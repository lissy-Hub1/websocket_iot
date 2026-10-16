from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool

from dependencies import Contenedor, get_contenedor
from models.eventos import EventoWS, TipoEvento
from models.historial import HistorialRespuesta, MovimientoRegistrado, MovimientoSolicitud
from security import exigir_api_key

from .comun import BASE, CON_404, E401, E403, E409

router = APIRouter(prefix="/vehiculos/{id_vehiculo}", tags=["Movimientos e historial"])


@router.post(
    "/movimientos", response_model=MovimientoRegistrado, status_code=201,
    responses={**CON_404, 409: E409, 401: E401, 403: E403},
    dependencies=[Depends(exigir_api_key)],
    summary="Registrar un movimiento individual (requiere X-API-Key)",
    description=(
        "Ejecuta un comando **existente** del catálogo del vehículo (no crea comandos). "
        "Verifica que el vehículo exista y esté activo, y que el comando exista, esté activo y "
        "pertenezca a ese vehículo.\n\n"
        "**Stored Procedures (una sola transacción):** `sp_obtener_vehiculo`, `sp_obtener_comandos_vehiculo`, "
        "`sp_obtener_estado`, `sp_actualizar_estado`, `sp_registrar_historial`.\n\n"
        "Después del COMMIT se notifica por WebSocket (evento `movimiento`). `conectado` conserva el valor "
        "real del estado: una solicitud HTTP no lo vuelve verdadero. Si se rechaza el POST no cambia nada "
        "ni se emite evento."
    ),
)
async def registrar_movimiento(
    id_vehiculo: int, solicitud: MovimientoSolicitud, c: Contenedor = Depends(get_contenedor)
):
    resultado = await run_in_threadpool(c.movimientos.registrar, id_vehiculo, solicitud)
    notificados = await c.manager.difundir(
        id_vehiculo,
        EventoWS(
            tipo=TipoEvento.MOVIMIENTO, id_vehiculo=id_vehiculo,
            comando=resultado["comando"], codigo=resultado["codigo"], id_comando=resultado["id_comando"],
            origen=resultado["origen"], conectado=resultado["conectado"], timestamp=resultado["fecha_hora"],
        ),
    )
    return MovimientoRegistrado(**resultado, notificados=notificados)


@router.get(
    "/historial", response_model=HistorialRespuesta, responses=CON_404,
    summary="Últimos movimientos individuales (máximo 10)",
    description=(
        "**Stored Procedures:** `sp_obtener_vehiculo`, `sp_obtener_historial`. Solo lectura.\n\n"
        "Devuelve como máximo los 10 movimientos individuales más recientes, del más nuevo al más antiguo "
        "(si hay menos, solo los disponibles; el historial completo sigue en RDS). Los movimientos de DEMO "
        "nunca aparecen aquí. Lista vacía con 200 = vehículo sin movimientos; 404 = vehículo inexistente."
    ),
)
async def historial(
    id_vehiculo: int,
    limite: int = Query(10, ge=1, le=10, description="Cantidad máxima (1 a 10)"),
    c: Contenedor = Depends(get_contenedor),
):
    filas = await run_in_threadpool(c.historial.ultimos, id_vehiculo, limite)
    return HistorialRespuesta(
        id_vehiculo=id_vehiculo, limite=limite, total_devueltos=len(filas), movimientos=filas
    )
