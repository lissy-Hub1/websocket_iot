from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor
from models.demo import (
    Demo, DemoActualizar, DemoCrear, DemoIniciada,
    MovimientoDemo, MovimientoDemoActualizar, MovimientoDemoCrear,
)
from models.respuestas import Creado, Mensaje
from security import exigir_api_key

from .comun import CON_404, E409, PROTEGIDO

router = APIRouter(prefix="/vehiculos/{id_vehiculo}/demos", tags=["DEMO"])
CON_409 = {**CON_404, 409: E409}


@router.get(
    "", response_model=list[Demo], responses=CON_404,
    summary="Listar las DEMO de un vehículo",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_demos`.",
)
async def listar(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.demos.listar, id_vehiculo)


@router.post(
    "", response_model=Creado, status_code=201, responses=CON_404,
    summary="Crear una DEMO",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_crear_demo`.",
)
async def crear(id_vehiculo: int, datos: DemoCrear, c: Contenedor = Depends(get_contenedor)):
    nuevo = await run_in_threadpool(c.demos.crear, id_vehiculo, datos)
    return Creado(id=nuevo, mensaje="DEMO creada")


@router.post(
    "/{id_demo}/actualizar", response_model=Mensaje, responses=CON_404,
    summary="Actualizar una DEMO",
    description="**Stored Procedures:** `sp_obtener_demos` (verifica pertenencia), `sp_actualizar_demo`.",
)
async def actualizar(id_vehiculo: int, id_demo: int, datos: DemoActualizar,
                     c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.demos.actualizar, id_vehiculo, id_demo, datos)
    return Mensaje(mensaje="DEMO actualizada")


@router.post(
    "/{id_demo}/eliminar", response_model=Mensaje, responses=PROTEGIDO,
    dependencies=[Depends(exigir_api_key)],
    summary="Eliminar una DEMO (requiere X-API-Key)",
    description="**Stored Procedures:** `sp_obtener_demos`, `sp_eliminar_demo` (borra en cascada sus movimientos).",
)
async def eliminar(id_vehiculo: int, id_demo: int, c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.demos.eliminar, id_vehiculo, id_demo)
    return Mensaje(mensaje="DEMO eliminada")


# ------------------------------------------------------------------ movimientos de la DEMO
@router.get(
    "/{id_demo}/movimientos", response_model=list[MovimientoDemo], responses=CON_404,
    summary="Consultar los movimientos ordenados de una DEMO",
    description="**Stored Procedures:** `sp_obtener_demos`, `sp_obtener_movimientos_demo`. Ordenados por `orden`.",
)
async def listar_movimientos(id_vehiculo: int, id_demo: int, c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.demos.listar_movimientos, id_vehiculo, id_demo)


@router.post(
    "/{id_demo}/movimientos", response_model=Mensaje, status_code=201, responses=CON_409,
    summary="Agregar un movimiento a la DEMO",
    description="**Stored Procedures:** `sp_obtener_demos`, `sp_obtener_comandos_vehiculo`, `sp_agregar_movimiento_demo`. "
    "El comando debe pertenecer al vehículo; 409 si el `orden` ya existe en la DEMO.",
)
async def agregar_movimiento(id_vehiculo: int, id_demo: int, datos: MovimientoDemoCrear,
                             c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.demos.agregar_movimiento, id_vehiculo, id_demo, datos)
    return Mensaje(mensaje="Movimiento agregado a la DEMO")


@router.post(
    "/{id_demo}/movimientos/{id_demo_movimiento}/actualizar", response_model=Mensaje, responses=CON_409,
    summary="Actualizar un movimiento de la DEMO",
    description="**Stored Procedures:** `sp_obtener_movimientos_demo` (verifica pertenencia), `sp_actualizar_movimiento_demo`.",
)
async def actualizar_movimiento(id_vehiculo: int, id_demo: int, id_demo_movimiento: int,
                                datos: MovimientoDemoActualizar, c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.demos.actualizar_movimiento, id_vehiculo, id_demo, id_demo_movimiento, datos)
    return Mensaje(mensaje="Movimiento de la DEMO actualizado")


@router.post(
    "/{id_demo}/movimientos/{id_demo_movimiento}/eliminar", response_model=Mensaje, responses=PROTEGIDO,
    dependencies=[Depends(exigir_api_key)],
    summary="Eliminar un movimiento de la DEMO (requiere X-API-Key)",
    description="**Stored Procedures:** `sp_obtener_movimientos_demo`, `sp_eliminar_movimiento_demo`.",
)
async def eliminar_movimiento(id_vehiculo: int, id_demo: int, id_demo_movimiento: int,
                              c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.demos.eliminar_movimiento, id_vehiculo, id_demo, id_demo_movimiento)
    return Mensaje(mensaje="Movimiento de la DEMO eliminado")


# ------------------------------------------------------------------ ejecución
@router.post(
    "/{id_demo}/iniciar", response_model=DemoIniciada, status_code=202,
    responses={**PROTEGIDO, 409: E409},
    dependencies=[Depends(exigir_api_key)],
    summary="Iniciar una DEMO y transmitirla por WebSocket (requiere X-API-Key)",
    description=(
        "Responde `202` de inmediato y ejecuta la DEMO en segundo plano.\n\n"
        "**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_demos`, `sp_obtener_movimientos_demo`, "
        "`sp_obtener_comandos_vehiculo` y, por cada movimiento, `sp_actualizar_estado`. "
        "**NO** usa `sp_registrar_historial`: los movimientos de DEMO no se guardan en el historial.\n\n"
        "Eventos WebSocket: `demo_inicio`, N × `demo_movimiento` (con `duracion_ms` y `pausa_ms`), `demo_fin`. "
        "409 si el vehículo ya tiene una DEMO en ejecución, está inactivo, la DEMO está inactiva o sin movimientos."
    ),
)
async def iniciar(id_vehiculo: int, id_demo: int, c: Contenedor = Depends(get_contenedor)):
    total = await c.runner.iniciar(id_vehiculo, id_demo)
    return DemoIniciada(id_vehiculo=id_vehiculo, id_demo=id_demo, total_movimientos=total)


@router.post(
    "/cancelar", response_model=Mensaje, responses=PROTEGIDO,
    dependencies=[Depends(exigir_api_key)],
    summary="Cancelar la DEMO en ejecución del vehículo (requiere X-API-Key)",
    description="Suspende de inmediato los movimientos posteriores y emite `demo_cancelada` por WebSocket. "
    "Si el catálogo tiene un comando activo llamado `DETENER`, lo deja como último comando con "
    "`sp_actualizar_estado` (paro seguro, sin historial). 404 si no hay DEMO en ejecución.",
)
async def cancelar(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    id_demo = await c.runner.cancelar(id_vehiculo)
    return Mensaje(mensaje=f"DEMO {id_demo} cancelada")
