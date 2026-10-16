from pydantic import BaseModel


class Mensaje(BaseModel):
    mensaje: str


class Creado(BaseModel):
    id: int
    mensaje: str = "Creado correctamente"


class ErrorRespuesta(BaseModel):
    detail: str
