from database import StoredProcedures


class ComandoRepository:
    def __init__(self, sp: StoredProcedures):
        self._sp = sp

    def crear(self, id_vehiculo, nombre, codigo, descripcion) -> int:
        filas = self._sp.consultar("sp_crear_comando", id_vehiculo, nombre, codigo, descripcion)
        return int(filas[0]["id_comando"])

    def listar_por_vehiculo(self, id_vehiculo: int) -> list[dict]:
        return self._sp.consultar("sp_obtener_comandos_vehiculo", id_vehiculo)

    def actualizar(self, id_comando, nombre, codigo, descripcion, activo) -> int:
        return self._sp.ejecutar("sp_actualizar_comando", id_comando, nombre, codigo, descripcion, activo)

    def eliminar(self, id_comando: int) -> int:
        return self._sp.ejecutar("sp_eliminar_comando", id_comando)
