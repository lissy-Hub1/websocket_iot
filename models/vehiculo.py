from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .comando import Comando
from .demo import Demo
from .estado import Estado


class VehiculoCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=80, examples=["Carrito RC"])
    modelo: Optional[str] = Field(default=None, max_length=80, examples=["RC-01"])
    descripcion: Optional[str] = Field(default=None, max_length=255)
    microcontrolador: Optional[str] = Field(default=None, max_length=50, examples=["ESP32"])


class VehiculoActualizar(VehiculoCrear):
    activo: bool = True


class Vehiculo(BaseModel):
    id_vehiculo: int
    nombre: str
    modelo: Optional[str] = None
    descripcion: Optional[str] = None
    microcontrolador: Optional[str] = None
    fecha_registro: datetime
    activo: bool


class VehiculoDetalle(Vehiculo):
    comandos: list[Comando]
    estado: Optional[Estado] = None
    demos: list[Demo]
