from database import Database
from exceptions import NoEncontrado
from models.vehiculo import VehiculoActualizar, VehiculoCrear
from repositories import ComandoRepository, DemoRepository, EstadoRepository, VehiculoRepository

from .reglas import exigir_vehiculo


class VehiculoService:
    def __init__(self, db: Database):
        self._db = db

    def crear(self, datos: VehiculoCrear) -> int:
        with self._db.transaccion() as sp:
            return VehiculoRepository(sp).crear(
                datos.nombre, datos.modelo, datos.descripcion, datos.microcontrolador
            )

    def listar(self) -> list[dict]:
        with self._db.transaccion() as sp:
            return VehiculoRepository(sp).listar()

    def detalle(self, id_vehiculo: int) -> dict:
        """Vehículo + comandos + último estado + demos (solo lectura)."""
        with self._db.transaccion() as sp:
            vehiculo = exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            vehiculo["comandos"] = ComandoRepository(sp).listar_por_vehiculo(id_vehiculo)
            vehiculo["estado"] = EstadoRepository(sp).obtener(id_vehiculo)
            vehiculo["demos"] = DemoRepository(sp).listar_por_vehiculo(id_vehiculo)
            return vehiculo

    def actualizar(self, id_vehiculo: int, d: VehiculoActualizar) -> None:
        with self._db.transaccion() as sp:
            repo = VehiculoRepository(sp)
            exigir_vehiculo(repo, id_vehiculo)
            repo.actualizar(id_vehiculo, d.nombre, d.modelo, d.descripcion, d.microcontrolador, d.activo)

    def eliminar(self, id_vehiculo: int) -> None:
        with self._db.transaccion() as sp:
            if VehiculoRepository(sp).eliminar(id_vehiculo) == 0:
                raise NoEncontrado(f"El vehículo {id_vehiculo} no existe")
