from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor
from models.comando import Comando, ComandoActualizar, ComandoCrear
from models.respuestas import Creado, Mensaje
from security import exigir_api_key

from .comun import CON_404, E409, PROTEGIDO

router = APIRouter(prefix="/vehiculos/{id_vehiculo}/comandos", tags=["Comandos"])


@router.get(
    "", response_model=list[Comando], responses=CON_404,
    summary="Listar el catálogo de comandos de un vehículo",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_comandos_vehiculo`. "
    "Lista vacía (200) = vehículo sin comandos; 404 = vehículo inexistente.",
)
async def listar(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.comandos.listar, id_vehiculo)


@router.post(
    "", response_model=Creado, status_code=201, responses={**CON_404, 409: E409},
    summary="Crear un comando en el catálogo del vehículo",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_crear_comando`. Crea un comando NUEVO "
    "en el catálogo; para ejecutar un movimiento usa `POST /vehiculos/{id}/movimientos`. "
    "409 si el nombre o código ya existen en ese vehículo.",
)
async def crear(id_vehiculo: int, datos: ComandoCrear, c: Contenedor = Depends(get_contenedor)):
    nuevo = await run_in_threadpool(c.comandos.crear, id_vehiculo, datos)
    return Creado(id=nuevo, mensaje="Comando creado")


@router.post(
    "/{id_comando}/actualizar", response_model=Mensaje, responses={**CON_404, 409: E409},
    summary="Actualizar un comando del catálogo",
    description="**Stored Procedures:** `sp_obtener_comandos_vehiculo` (verifica pertenencia), `sp_actualizar_comando`.",
)
async def actualizar(id_vehiculo: int, id_comando: int, datos: ComandoActualizar,
                     c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.comandos.actualizar, id_vehiculo, id_comando, datos)
    return Mensaje(mensaje="Comando actualizado")


@router.post(
    "/{id_comando}/eliminar", response_model=Mensaje, responses={**PROTEGIDO, 409: E409},
    dependencies=[Depends(exigir_api_key)],
    summary="Eliminar un comando (requiere X-API-Key)",
    description="**Stored Procedures:** `sp_obtener_comandos_vehiculo`, `sp_eliminar_comando`. "
    "409 si el comando todavía lo usa algún movimiento de DEMO.",
)
async def eliminar(id_vehiculo: int, id_comando: int, c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.comandos.eliminar, id_vehiculo, id_comando)
    return Mensaje(mensaje="Comando eliminado")
