"""Ejecutor de Stored Procedures con parámetros enlazados (sin concatenar SQL)."""
from typing import Any

import pymysql.cursors

# Lista blanca: solo se pueden invocar los 21 SP del esquema vehiculo_iot.
PROCEDIMIENTOS_PERMITIDOS = frozenset(
    {
        "sp_crear_vehiculo", "sp_obtener_vehiculos", "sp_obtener_vehiculo",
        "sp_actualizar_vehiculo", "sp_eliminar_vehiculo",
        "sp_crear_comando", "sp_obtener_comandos_vehiculo",
        "sp_actualizar_comando", "sp_eliminar_comando",
        "sp_actualizar_estado", "sp_obtener_estado",
        "sp_registrar_historial", "sp_obtener_historial",
        "sp_crear_demo", "sp_obtener_demos", "sp_actualizar_demo", "sp_eliminar_demo",
        "sp_agregar_movimiento_demo", "sp_obtener_movimientos_demo",
        "sp_actualizar_movimiento_demo", "sp_eliminar_movimiento_demo",
    }
)


class StoredProcedures:
    """Envuelve una conexión abierta y expone `consultar` y `ejecutar`."""

    def __init__(self, conexion: pymysql.connections.Connection):
        self._conexion = conexion

    def _llamar(self, nombre: str, parametros: tuple[Any, ...]):
        if nombre not in PROCEDIMIENTOS_PERMITIDOS:
            raise ValueError(f"Procedimiento no permitido: {nombre}")
        marcadores = ", ".join(["%s"] * len(parametros))
        sql = f"CALL {nombre}({marcadores})"  # el nombre viene de la lista blanca
        cursor = self._conexion.cursor(pymysql.cursors.DictCursor)
        try:
            cursor.execute(sql, parametros)
            filas = list(cursor.fetchall())
            afectadas = cursor.rowcount
            while cursor.nextset():  # vacía los resultados restantes del CALL
                pass
            return filas, afectadas
        finally:
            cursor.close()

    def consultar(self, nombre: str, *parametros: Any) -> list[dict]:
        """SP que devuelve filas (SELECT)."""
        filas, _ = self._llamar(nombre, parametros)
        return filas

    def ejecutar(self, nombre: str, *parametros: Any) -> int:
        """SP que modifica datos. Devuelve las filas coincidentes (0 = no existía)."""
        _, afectadas = self._llamar(nombre, parametros)
        return afectadas
