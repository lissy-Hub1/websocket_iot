from database import Database
from repositories import HistorialRepository, VehiculoRepository

from .reglas import exigir_vehiculo

LIMITE_MAXIMO = 10


class HistorialService:
    def __init__(self, db: Database):
        self._db = db

    def ultimos(self, id_vehiculo: int, limite: int = LIMITE_MAXIMO) -> list[dict]:
        """Hasta `limite` (máx. 10) movimientos individuales, del más reciente al más antiguo.
        Solo lectura: el historial completo permanece en RDS."""
        limite = max(1, min(limite, LIMITE_MAXIMO))
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo)
            return HistorialRepository(sp).obtener(id_vehiculo)[:limite]
