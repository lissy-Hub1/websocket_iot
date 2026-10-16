"""Endpoint WebSocket por vehículo (no aparece en Swagger; ver README)."""
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor_ws
from exceptions import ErrorDeNegocio, NoEncontrado
from models.eventos import EventoWS, TipoEvento

log = logging.getLogger("app_iot.ws")
router = APIRouter()


@router.websocket("/ws/vehiculos/{id_vehiculo}")
async def monitorear(websocket: WebSocket, id_vehiculo: int, c: Contenedor = Depends(get_contenedor_ws)):
    await websocket.accept()
    try:
        estado = await run_in_threadpool(c.estados.obtener, id_vehiculo)
    except NoEncontrado:
        await websocket.close(code=4404, reason="Vehiculo no encontrado")
        return
    except ErrorDeNegocio:
        await websocket.close(code=1013, reason="Base de datos no disponible")
        return

    c.manager.conectar(id_vehiculo, websocket)
    try:
        inicial = EventoWS(
            tipo=TipoEvento.ESTADO_INICIAL, id_vehiculo=id_vehiculo,
            comando=estado["comando"] if estado else None,
            codigo=estado["codigo"] if estado else None,
            id_comando=estado["id_comando"] if estado else None,
            conectado=bool(estado["conectado"]) if estado else False,
        )
        await c.manager.enviar(websocket, inicial)
        while True:
            texto = await websocket.receive_text()  # mantiene viva la conexión
            if texto.strip().lower() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("Error en la conexión WebSocket del vehículo %s", id_vehiculo)
    finally:
        c.manager.desconectar(id_vehiculo, websocket)
