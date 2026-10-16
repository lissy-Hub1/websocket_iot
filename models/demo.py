from typing import Optional

from pydantic import BaseModel, Field


class DemoCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, examples=["Cuadrado"])
    descripcion: Optional[str] = Field(default=None, max_length=255)


class DemoActualizar(DemoCrear):
    activo: bool = True


class Demo(BaseModel):
    id_demo: int
    id_vehiculo: int
    nombre: str
    descripcion: Optional[str] = None
    activo: bool


class MovimientoDemoCrear(BaseModel):
    id_comando: int = Field(ge=1)
    orden: int = Field(ge=1, le=10_000)
    duracion_ms: int = Field(ge=0, le=600_000, examples=[1000])
    pausa_ms: int = Field(default=0, ge=0, le=600_000, examples=[200])


class MovimientoDemoActualizar(MovimientoDemoCrear):
    pass


class MovimientoDemo(BaseModel):
    id_demo_movimiento: int
    orden: int
    id_comando: int
    comando: str
    codigo: int
    duracion_ms: int
    pausa_ms: int


class DemoIniciada(BaseModel):
    id_vehiculo: int
    id_demo: int
    total_movimientos: int
    mensaje: str = "DEMO iniciada; los eventos se transmiten por WebSocket"
