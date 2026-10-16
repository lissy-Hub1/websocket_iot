"""Mensajes JSON que viajan por WebSocket."""
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TipoEvento(str, Enum):
    ESTADO_INICIAL = "estado_inicial"
    MOVIMIENTO = "movimiento"            # movimiento individual (POST) -> sí va al historial
    DEMO_INICIO = "demo_inicio"
    DEMO_MOVIMIENTO = "demo_movimiento"  # movimiento de DEMO -> NO va al historial
    DEMO_FIN = "demo_fin"
    DEMO_CANCELADA = "demo_cancelada"
    DEMO_ERROR = "demo_error"


class EventoWS(BaseModel):
    tipo: TipoEvento
    id_vehiculo: int
    comando: Optional[str] = None
    codigo: Optional[int] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Campos opcionales según el evento
    id_comando: Optional[int] = None
    origen: Optional[str] = None
    conectado: Optional[bool] = None
    id_demo: Optional[int] = None
    orden: Optional[int] = None
    indice: Optional[int] = None
    total: Optional[int] = None
    duracion_ms: Optional[int] = None
    pausa_ms: Optional[int] = None
    detalle: Optional[str] = None

    def a_json(self) -> dict:
        return self.model_dump(mode="json", exclude_none=True)
