from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class Estado(BaseModel):
    """Último estado registrado del vehículo (tabla estado_vehiculo)."""

    id_vehiculo: int
    vehiculo: str
    id_comando: Optional[int] = None
    comando: Optional[str] = None
    codigo: Optional[int] = None
    conectado: bool
    fecha_actualizacion: datetime
