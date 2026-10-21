"""Punto de entrada.
Local:      python -m uvicorn main:app --reload --port 8000
Producción: uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 (detrás de Caddy, ver deploy/)"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from pathlib import Path

from fastapi.responses import FileResponse, JSONResponse

from config import get_settings
from dependencies import Contenedor
from exceptions import ErrorDeNegocio
from routers import comandos, demos, estado, movimientos, vehiculos, ws

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app_iot")

DESCRIPCION = """
API pública para el vehículo IoT (examen 2.6) en Amazon EC2. Base de datos: Amazon RDS `vehiculo_iot`.

* **Movimiento individual** (`POST /vehiculos/{id}/movimientos`): actualiza estado + historial y notifica por WebSocket.
* **DEMO** (`POST /vehiculos/{id}/demos/{id_demo}/iniciar`): transmite N movimientos por WebSocket **sin** historial.
* **WebSocket seguro (WSS):** `wss://<este-mismo-dominio>/ws/vehiculos/{id_vehiculo}` (Swagger no documenta WebSocket; ver README).
* Las operaciones de control y eliminación requieren el encabezado `X-API-Key`.
"""

ETIQUETAS = [
    {"name": "Vehículos", "description": "Alta, consulta, edición y baja de vehículos"},
    {"name": "Comandos", "description": "Catálogo de comandos de cada vehículo"},
    {"name": "Estado", "description": "Último estado registrado"},
    {"name": "Movimientos e historial", "description": "Movimientos individuales y su bitácora (máx. 10)"},
    {"name": "DEMO", "description": "DEMO, sus movimientos y su ejecución por WebSocket"},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.contenedor = Contenedor.crear(get_settings())  # falla al arrancar si falta configuración
    log.info("API lista (documentación en /docs)")
    yield
    await app.state.contenedor.runner.cerrar()


app = FastAPI(
    title="API IoT – Vehículo (examen 2.6)",
    description=DESCRIPCION,
    version="1.0.0",
    openapi_tags=ETIQUETAS,
    lifespan=lifespan,
)

for modulo in (vehiculos, comandos, estado, movimientos, demos, ws):
    app.include_router(modulo.router)


@app.exception_handler(ErrorDeNegocio)
async def manejar_error_negocio(_: Request, exc: ErrorDeNegocio):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.mensaje})


@app.exception_handler(Exception)
async def manejar_error_inesperado(_: Request, exc: Exception):
    log.exception("Error no controlado")  # el detalle queda en el log, no en la respuesta
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


PANEL = Path(__file__).parent / "static" / "index.html"


@app.get("/", include_in_schema=False)
async def panel():
    """Panel web del vehículo (HTML estático que usa la propia API y el WSS)."""
    return FileResponse(PANEL)