from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor
from models.respuestas import Creado, Mensaje
from models.vehiculo import Vehiculo, VehiculoActualizar, VehiculoCrear, VehiculoDetalle
from security import exigir_api_key

from .comun import BASE, CON_404, PROTEGIDO

router = APIRouter(prefix="/vehiculos", tags=["Vehículos"])


@router.get(
    "", response_model=list[Vehiculo], responses=BASE,
    summary="Listar todos los vehículos",
    description="**Stored Procedure:** `sp_obtener_vehiculos`. Solo lectura.",
)
async def listar(c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.vehiculos.listar)


@router.get(
    "/{id_vehiculo}", response_model=VehiculoDetalle, responses=CON_404,
    summary="Consultar un vehículo con sus comandos, último estado y DEMO",
    description="**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_comandos_vehiculo`, "
    "`sp_obtener_estado`, `sp_obtener_demos`. Solo lectura. `estado` es `null` si aún no hay estado.",
)
async def detalle(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    return await run_in_threadpool(c.vehiculos.detalle, id_vehiculo)


@router.post(
    "", response_model=Creado, status_code=201, responses=BASE,
    summary="Crear un vehículo",
    description="**Stored Procedure:** `sp_crear_vehiculo`.",
)
async def crear(datos: VehiculoCrear, c: Contenedor = Depends(get_contenedor)):
    nuevo = await run_in_threadpool(c.vehiculos.crear, datos)
    return Creado(id=nuevo, mensaje="Vehículo creado")


@router.post(
    "/{id_vehiculo}/actualizar", response_model=Mensaje, responses=CON_404,
    summary="Actualizar un vehículo",
    description="**Stored Procedures:** `sp_obtener_vehiculo` (verifica existencia), `sp_actualizar_vehiculo`.",
)
async def actualizar(id_vehiculo: int, datos: VehiculoActualizar, c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.vehiculos.actualizar, id_vehiculo, datos)
    return Mensaje(mensaje="Vehículo actualizado")


@router.post(
    "/{id_vehiculo}/eliminar", response_model=Mensaje, responses=PROTEGIDO,
    dependencies=[Depends(exigir_api_key)],
    summary="Eliminar un vehículo (requiere X-API-Key)",
    description="**Stored Procedure:** `sp_eliminar_vehiculo`. Borra en cascada sus comandos, demos, estado e historial.",
)
async def eliminar(id_vehiculo: int, c: Contenedor = Depends(get_contenedor)):
    await run_in_threadpool(c.vehiculos.eliminar, id_vehiculo)
    return Mensaje(mensaje="Vehículo eliminado")
