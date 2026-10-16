from database import StoredProcedures


class DemoRepository:
    """Demos y sus movimientos (6 SP de demos + 4 de movimientos)."""

    def __init__(self, sp: StoredProcedures):
        self._sp = sp

    # --- demos ---
    def crear(self, id_vehiculo, nombre, descripcion) -> int:
        filas = self._sp.consultar("sp_crear_demo", id_vehiculo, nombre, descripcion)
        return int(filas[0]["id_demo"])

    def listar_por_vehiculo(self, id_vehiculo: int) -> list[dict]:
        return self._sp.consultar("sp_obtener_demos", id_vehiculo)

    def actualizar(self, id_demo, nombre, descripcion, activo) -> int:
        return self._sp.ejecutar("sp_actualizar_demo", id_demo, nombre, descripcion, activo)

    def eliminar(self, id_demo: int) -> int:
        return self._sp.ejecutar("sp_eliminar_demo", id_demo)

    # --- movimientos de demo ---
    def agregar_movimiento(self, id_demo, id_comando, orden, duracion_ms, pausa_ms) -> None:
        self._sp.ejecutar("sp_agregar_movimiento_demo", id_demo, id_comando, orden, duracion_ms, pausa_ms)

    def listar_movimientos(self, id_demo: int) -> list[dict]:
        return self._sp.consultar("sp_obtener_movimientos_demo", id_demo)

    def actualizar_movimiento(self, id_demo_movimiento, id_comando, orden, duracion_ms, pausa_ms) -> int:
        return self._sp.ejecutar(
            "sp_actualizar_movimiento_demo", id_demo_movimiento, id_comando, orden, duracion_ms, pausa_ms
        )

    def eliminar_movimiento(self, id_demo_movimiento: int) -> int:
        return self._sp.ejecutar("sp_eliminar_movimiento_demo", id_demo_movimiento)
