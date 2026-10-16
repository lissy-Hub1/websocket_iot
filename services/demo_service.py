"""CRUD de DEMO y de sus movimientos (la ejecución está en demo_runner.py)."""
from database import Database
from exceptions import NoEncontrado
from models.demo import DemoActualizar, DemoCrear, MovimientoDemoActualizar, MovimientoDemoCrear
from repositories import ComandoRepository, DemoRepository, VehiculoRepository

from .reglas import buscar_comando, exigir_vehiculo


def exigir_demo(repo: DemoRepository, id_vehiculo: int, id_demo: int) -> dict:
    for demo in repo.listar_por_vehiculo(id_vehiculo):
        if demo["id_demo"] == id_demo:
            return demo
    raise NoEncontrado(f"La DEMO {id_demo} no existe para el vehículo {id_vehiculo}")


class DemoService:
    def __init__(self, db: Database):
        self._db = db

    # ---- demos ----
    def listar(self, id_vehiculo: int) -> list[dict]:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return DemoRepository(sp).listar_por_vehiculo(id_vehiculo)

    def crear(self, id_vehiculo: int, d: DemoCrear) -> int:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return DemoRepository(sp).crear(id_vehiculo, d.nombre, d.descripcion)

    def actualizar(self, id_vehiculo: int, id_demo: int, d: DemoActualizar) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            repo.actualizar(id_demo, d.nombre, d.descripcion, d.activo)

    def eliminar(self, id_vehiculo: int, id_demo: int) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            repo.eliminar(id_demo)

    # ---- movimientos de demo ----
    def listar_movimientos(self, id_vehiculo: int, id_demo: int) -> list[dict]:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            return repo.listar_movimientos(id_demo)

    def agregar_movimiento(self, id_vehiculo: int, id_demo: int, d: MovimientoDemoCrear) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            buscar_comando(ComandoRepository(sp), id_vehiculo, id_comando=d.id_comando)
            repo.agregar_movimiento(id_demo, d.id_comando, d.orden, d.duracion_ms, d.pausa_ms)

    def actualizar_movimiento(
        self, id_vehiculo: int, id_demo: int, id_mov: int, d: MovimientoDemoActualizar
    ) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            self._exigir_movimiento(repo, id_demo, id_mov)
            buscar_comando(ComandoRepository(sp), id_vehiculo, id_comando=d.id_comando)
            repo.actualizar_movimiento(id_mov, d.id_comando, d.orden, d.duracion_ms, d.pausa_ms)

    def eliminar_movimiento(self, id_vehiculo: int, id_demo: int, id_mov: int) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = DemoRepository(sp)
            exigir_demo(repo, id_vehiculo, id_demo)
            self._exigir_movimiento(repo, id_demo, id_mov)
            repo.eliminar_movimiento(id_mov)

    @staticmethod
    def _exigir_movimiento(repo: DemoRepository, id_demo: int, id_mov: int) -> None:
        if not any(m["id_demo_movimiento"] == id_mov for m in repo.listar_movimientos(id_demo)):
            raise NoEncontrado(f"El movimiento {id_mov} no pertenece a la DEMO {id_demo}")
