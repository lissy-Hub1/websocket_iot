"""Ejecución de una DEMO: lee los N movimientos de RDS y los transmite por WebSocket.

Reglas clave:
  * NUNCA llama a sp_registrar_historial (los movimientos de DEMO no van al historial).
  * Sí actualiza el último comando con sp_actualizar_estado mientras avanza.
  * Una sola DEMO por vehículo; se puede cancelar en cualquier momento.
  * Enviar un mensaje NO significa ejecución física confirmada (eso llegará con el microcontrolador).
"""
import asyncio
import logging
from typing import Any, Callable, Optional

from database import Database
from exceptions import Conflicto, NoEncontrado
from models.eventos import EventoWS, TipoEvento
from repositories import ComandoRepository, DemoRepository, VehiculoRepository
from websocket import ConnectionManager

from .estado_service import EstadoService
from .reglas import exigir_vehiculo

log = logging.getLogger("app_iot.demo")


class DemoRunner:
    def __init__(self, db: Database, manager: ConnectionManager, estado: EstadoService):
        self._db = db
        self._manager = manager
        self._estado = estado
        self._tareas: dict[int, asyncio.Task] = {}   # id_vehiculo -> tarea en curso
        self._demo_en_curso: dict[int, int] = {}      # id_vehiculo -> id_demo

    # ------------------------------------------------------------ API pública
    def en_ejecucion(self, id_vehiculo: int) -> Optional[int]:
        return self._demo_en_curso.get(id_vehiculo)

    async def iniciar(self, id_vehiculo: int, id_demo: int) -> int:
        """Valida y lanza la DEMO en segundo plano. Devuelve el número de movimientos (N)."""
        self._exigir_libre(id_vehiculo)
        movimientos, nombre_stop = await asyncio.to_thread(self._validar, id_vehiculo, id_demo)
        self._exigir_libre(id_vehiculo)  # se re-verifica (sin await de por medio con la creación de la tarea)
        tarea = asyncio.create_task(self._ejecutar(id_vehiculo, id_demo, movimientos, nombre_stop))
        self._tareas[id_vehiculo] = tarea
        self._demo_en_curso[id_vehiculo] = id_demo
        return len(movimientos)

    async def cancelar(self, id_vehiculo: int) -> int:
        tarea = self._tareas.get(id_vehiculo)
        if tarea is None or tarea.done():
            raise NoEncontrado(f"El vehículo {id_vehiculo} no tiene una DEMO en ejecución")
        id_demo = self._demo_en_curso[id_vehiculo]
        tarea.cancel()
        await asyncio.wait({tarea}, timeout=5)  # espera el aviso de cancelación y el paro seguro
        return id_demo

    async def cerrar(self) -> None:
        """Al apagar el servidor: cancela todas las DEMO activas."""
        tareas = list(self._tareas.values())
        for t in tareas:
            t.cancel()
        if tareas:
            await asyncio.wait(tareas, timeout=5)

    # ------------------------------------------------------------ internos
    def _exigir_libre(self, id_vehiculo: int) -> None:
        if id_vehiculo in self._tareas:
            raise Conflicto(f"El vehículo {id_vehiculo} ya tiene la DEMO {self._demo_en_curso[id_vehiculo]} en ejecución")

    def _validar(self, id_vehiculo: int, id_demo: int):
        """Corre en un hilo. Devuelve (movimientos ordenados, comando DETENER si existe)."""
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo, activo=True)
            repo = DemoRepository(sp)
            demo = next((d for d in repo.listar_por_vehiculo(id_vehiculo) if d["id_demo"] == id_demo), None)
            if demo is None:
                raise NoEncontrado(f"La DEMO {id_demo} no existe para el vehículo {id_vehiculo}")
            if not demo["activo"]:
                raise Conflicto(f"La DEMO {id_demo} está inactiva")
            movimientos = repo.listar_movimientos(id_demo)  # sp_obtener_movimientos_demo (ya ordenados)
            if not movimientos:
                raise Conflicto(f"La DEMO {id_demo} no tiene movimientos")
            catalogo = {c["id_comando"]: c for c in ComandoRepository(sp).listar_por_vehiculo(id_vehiculo)}
            for m in movimientos:
                c = catalogo.get(m["id_comando"])
                if c is None:
                    raise Conflicto(f"El movimiento {m['orden']} usa un comando que no pertenece al vehículo")
                if not c["activo"]:
                    raise Conflicto(f"El movimiento {m['orden']} usa el comando inactivo '{c['nombre']}'")
            detener = next(
                (c["id_comando"] for c in catalogo.values() if c["nombre"].upper() == "DETENER" and c["activo"]),
                None,
            )
            return movimientos, detener

    async def _en_hilo(self, funcion: Callable[..., Any], *args):
        """Ejecuta código bloqueante fuera del event loop y, si la tarea se cancela, espera a que
        el hilo termine para no dejar una escritura 'volando' después del paro seguro."""
        trabajo = asyncio.ensure_future(asyncio.to_thread(funcion, *args))
        try:
            return await asyncio.shield(trabajo)
        except asyncio.CancelledError:
            await asyncio.wait({trabajo})
            raise

    async def _ejecutar(self, id_vehiculo: int, id_demo: int, movs: list[dict], id_detener: Optional[int]):
        total = len(movs)
        ev = lambda tipo, **kw: EventoWS(tipo=tipo, id_vehiculo=id_vehiculo, id_demo=id_demo, **kw)  # noqa: E731
        try:
            await self._manager.difundir(id_vehiculo, ev(TipoEvento.DEMO_INICIO, total=total))
            for indice, m in enumerate(movs, start=1):
                # actualiza el último comando (sp_actualizar_estado); SIN historial
                await self._en_hilo(self._estado.fijar_comando, id_vehiculo, m["id_comando"])
                await self._manager.difundir(
                    id_vehiculo,
                    ev(
                        TipoEvento.DEMO_MOVIMIENTO,
                        comando=m["comando"], codigo=m["codigo"], id_comando=m["id_comando"],
                        orden=m["orden"], indice=indice, total=total,
                        duracion_ms=m["duracion_ms"], pausa_ms=m["pausa_ms"],
                    ),
                )
                await asyncio.sleep(m["duracion_ms"] / 1000)
                await asyncio.sleep(m["pausa_ms"] / 1000)
            await self._manager.difundir(id_vehiculo, ev(TipoEvento.DEMO_FIN, total=total))
        except asyncio.CancelledError:
            log.info("DEMO %s del vehículo %s cancelada", id_demo, id_vehiculo)
            await self._paro_seguro(id_vehiculo, id_detener)
            await self._manager.difundir(id_vehiculo, ev(TipoEvento.DEMO_CANCELADA, total=total))
        except Exception:
            log.exception("Falla durante la DEMO %s del vehículo %s", id_demo, id_vehiculo)
            await self._paro_seguro(id_vehiculo, id_detener)
            await self._manager.difundir(
                id_vehiculo, ev(TipoEvento.DEMO_ERROR, detalle="La DEMO terminó por un error interno")
            )
        finally:
            self._tareas.pop(id_vehiculo, None)
            self._demo_en_curso.pop(id_vehiculo, None)

    async def _paro_seguro(self, id_vehiculo: int, id_detener: Optional[int]) -> None:
        """Si el catálogo tiene un comando DETENER, lo deja como último comando (sin historial)."""
        if id_detener is None:
            return
        try:
            await self._en_hilo(self._estado.fijar_comando, id_vehiculo, id_detener)
        except Exception:
            log.exception("No se pudo registrar el paro seguro del vehículo %s", id_vehiculo)
