from typing import Optional

from database import Database
from repositories import EstadoRepository, VehiculoRepository

from .reglas import exigir_vehiculo


class EstadoService:
    def __init__(self, db: Database):
        self._db = db

    def obtener(self, id_vehiculo: int) -> Optional[dict]:
        """None = el vehículo existe pero aún no tiene estado (consulta válida sin resultados)."""
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return EstadoRepository(sp).obtener(id_vehiculo)

    def fijar_comando(self, id_vehiculo: int, id_comando: int) -> None:
        """Actualiza el último comando conservando el valor real de `conectado`.
        No registra historial (lo usan las DEMO)."""
        with self._db.transaccion() as sp:
            repo = EstadoRepository(sp)
            actual = repo.obtener(id_vehiculo)
            repo.actualizar(id_vehiculo, id_comando, bool(actual["conectado"]) if actual else False)
