from database import StoredProcedures


class HistorialRepository:
    def __init__(self, sp: StoredProcedures):
        self._sp = sp

    def registrar(self, id_vehiculo: int, id_comando: int, origen: str) -> None:
        self._sp.ejecutar("sp_registrar_historial", id_vehiculo, id_comando, origen)

    def obtener(self, id_vehiculo: int) -> list[dict]:
        """El SP devuelve TODO el historial (más reciente primero); el límite lo aplica el servicio."""
        return self._sp.consultar("sp_obtener_historial", id_vehiculo)
