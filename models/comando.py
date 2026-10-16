from typing import Optional

from pydantic import BaseModel, Field


class ComandoCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=60, examples=["ADELANTE"])
    codigo: int = Field(ge=0, le=2_147_483_647, examples=[1])
    descripcion: Optional[str] = Field(default=None, max_length=255)


class ComandoActualizar(ComandoCrear):
    activo: bool = True


class Comando(BaseModel):
    id_comando: int
    id_vehiculo: int
    nombre: str
    codigo: int
    descripcion: Optional[str] = None
    activo: bool
