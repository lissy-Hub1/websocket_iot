"""Acceso a datos de vehículos: solo llama Stored Procedures, sin reglas de negocio."""
from typing import Optional

from database import StoredProcedures


class VehiculoRepository:
    def __init__(self, sp: StoredProcedures):
        self._sp = sp

    def crear(self, nombre, modelo, descripcion, microcontrolador) -> int:
        filas = self._sp.consultar("sp_crear_vehiculo", nombre, modelo, descripcion, microcontrolador)
        return int(filas[0]["id_vehiculo"])

    def listar(self) -> list[dict]:
        return self._sp.consultar("sp_obtener_vehiculos")

    def obtener(self, id_vehiculo: int) -> Optional[dict]:
        filas = self._sp.consultar("sp_obtener_vehiculo", id_vehiculo)
        return filas[0] if filas else None

    def actualizar(self, id_vehiculo, nombre, modelo, descripcion, microcontrolador, activo) -> int:
        return self._sp.ejecutar(
            "sp_actualizar_vehiculo", id_vehiculo, nombre, modelo, descripcion, microcontrolador, activo
        )

    def eliminar(self, id_vehiculo: int) -> int:
        return self._sp.ejecutar("sp_eliminar_vehiculo", id_vehiculo)
