from database import Database
from exceptions import NoEncontrado
from models.comando import ComandoActualizar, ComandoCrear
from repositories import ComandoRepository, VehiculoRepository

from .reglas import buscar_comando, exigir_vehiculo


class ComandoService:
    """Catálogo de comandos de cada vehículo (NO ejecuta movimientos)."""

    def __init__(self, db: Database):
        self._db = db

    def listar(self, id_vehiculo: int) -> list[dict]:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return ComandoRepository(sp).listar_por_vehiculo(id_vehiculo)

    def crear(self, id_vehiculo: int, d: ComandoCrear) -> int:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return ComandoRepository(sp).crear(id_vehiculo, d.nombre, d.codigo, d.descripcion)

    def actualizar(self, id_vehiculo: int, id_comando: int, d: ComandoActualizar) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = ComandoRepository(sp)
            buscar_comando(repo, id_vehiculo, id_comando=id_comando)
            repo.actualizar(id_comando, d.nombre, d.codigo, d.descripcion, d.activo)

    def eliminar(self, id_vehiculo: int, id_comando: int) -> None:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            repo = ComandoRepository(sp)
            buscar_comando(repo, id_vehiculo, id_comando=id_comando)
            if repo.eliminar(id_comando) == 0:
                raise NoEncontrado(f"El comando {id_comando} no existe")
