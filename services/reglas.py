"""Validaciones de negocio compartidas por varios servicios."""
from typing import Optional

from exceptions import Conflicto, NoEncontrado
from repositories import ComandoRepository, VehiculoRepository


def exigir_vehiculo(repo: VehiculoRepository, id_vehiculo: int, *, activo: bool = False) -> dict:
    vehiculo = repo.obtener(id_vehiculo)
    if vehiculo is None:
        raise NoEncontrado(f"El vehículo {id_vehiculo} no existe")
    if activo and not vehiculo["activo"]:
        raise Conflicto(f"El vehículo {id_vehiculo} está inactivo")
    return vehiculo


def buscar_comando(
    repo: ComandoRepository,
    id_vehiculo: int,
    *,
    id_comando: Optional[int] = None,
    codigo: Optional[int] = None,
    activo: bool = False,
) -> dict:
    """Busca el comando SOLO dentro del catálogo del vehículo (rechaza comandos de otro vehículo)."""
    for comando in repo.listar_por_vehiculo(id_vehiculo):
        if (id_comando is not None and comando["id_comando"] == id_comando) or (
            codigo is not None and comando["codigo"] == codigo
        ):
            if activo and not comando["activo"]:
                raise Conflicto(f"El comando '{comando['nombre']}' está inactivo")
            return comando
    ref = f"id {id_comando}" if id_comando is not None else f"código {codigo}"
    raise NoEncontrado(f"El comando ({ref}) no existe en el catálogo del vehículo {id_vehiculo}")
