from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor
from models.estado import Estado

from .comun import CON_404

router = APIRouter(prefix="/vehiculos/{id_vehiculo}/estado", tags=["Estado"])


@router.get(
    "", response_model=Optional[Estado], responses=CON_404,
    summary="Consultar el último estado del vehículo",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_estado`. Solo lectura. "
    "Devuelve `null` (200) si el vehículo existe pero aún no tiene estado; 404 si el vehículo no existe. "
    "El estado se modifica con `sp_actualizar_estado` desde el POST de movimientos o durante una DEMO.",
)
async def obtener(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.estados.obtener, id_vehiculo)
