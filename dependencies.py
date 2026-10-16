"""Contenedor de dependencias: crea una sola vez los objetos de la aplicación."""
from dataclasses import dataclass

from fastapi import Request, WebSocket

from config import Settings
from database import Database
from services.comando_service import ComandoService
from services.demo_runner import DemoRunner
from services.demo_service import DemoService
from services.estado_service import EstadoService
from services.historial_service import HistorialService
from services.movimiento_service import MovimientoService
from services.vehiculo_service import VehiculoService
from websocket import ConnectionManager


@dataclass
class Contenedor:
    db: Database
    manager: ConnectionManager
    vehiculos: VehiculoService
    comandos: ComandoService
    estados: EstadoService
    historial: HistorialService
    movimientos: MovimientoService
    demos: DemoService
    runner: DemoRunner

    @classmethod
    def crear(cls, settings: Settings) -> "Contenedor":
        db = Database(settings)
        manager = ConnectionManager()
        estados = EstadoService(db)
        return cls(
            db=db,
            manager=manager,
            vehiculos=VehiculoService(db),
            comandos=ComandoService(db),
            estados=estados,
            historial=HistorialService(db),
            movimientos=MovimientoService(db),
            demos=DemoService(db),
            runner=DemoRunner(db, manager, estados),
        )


def get_contenedor(request: Request) -> Contenedor:
    return request.app.state.contenedor


def get_contenedor_ws(websocket: WebSocket) -> Contenedor:
    return websocket.app.state.contenedor
