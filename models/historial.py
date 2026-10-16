from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class MovimientoSolicitud(BaseModel):
    """Cuerpo del POST de movimiento individual: se indica el comando por id o por código."""

    id_comando: Optional[int] = Field(default=None, ge=1, examples=[1])
    codigo: Optional[int] = Field(default=None, ge=0, description="Alternativa a id_comando")
    origen: str = Field(default="MANUAL", min_length=1, max_length=30, examples=["MANUAL"])

    @model_validator(mode="after")
    def exactamente_uno(self):
        if (self.id_comando is None) == (self.codigo is None):
            raise ValueError("Indica exactamente uno: id_comando o codigo")
        return self


class MovimientoRegistrado(BaseModel):
    id_vehiculo: int
    id_comando: int
    comando: str
    codigo: int
    origen: str
    conectado: bool
    fecha_hora: datetime
    notificados: int = Field(description="Clientes WebSocket a los que se envió el evento")


class HistorialItem(BaseModel):
    id_historial: int
    id_vehiculo: int
    comando: Optional[str] = None
    codigo: Optional[int] = None
    fecha_hora: datetime
    origen: str


class HistorialRespuesta(BaseModel):
    id_vehiculo: int
    limite: int
    total_devueltos: int
    movimientos: list[HistorialItem]
