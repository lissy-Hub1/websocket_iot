from typing import Optional

from database import StoredProcedures


class EstadoRepository:
    def __init__(self, sp: StoredProcedures):
        self._sp = sp

    def obtener(self, id_vehiculo: int) -> Optional[dict]:
        filas = self._sp.consultar("sp_obtener_estado", id_vehiculo)
        return filas[0] if filas else None

    def actualizar(self, id_vehiculo: int, id_comando: Optional[int], conectado: bool) -> None:
        self._sp.ejecutar("sp_actualizar_estado", id_vehiculo, id_comando, conectado)
