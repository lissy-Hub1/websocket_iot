"""Descripciones de errores reutilizables para Swagger."""
from models.respuestas import ErrorRespuesta

E400 = {"model": ErrorRespuesta, "description": "Solicitud inválida"}
E401 = {"model": ErrorRespuesta, "description": "Falta X-API-Key"}
E403 = {"model": ErrorRespuesta, "description": "X-API-Key inválida"}
E404 = {"model": ErrorRespuesta, "description": "Recurso inexistente"}
E409 = {"model": ErrorRespuesta, "description": "Conflicto con el estado actual o con una regla de negocio"}
E422 = {"description": "Error de validación del cuerpo o de los parámetros"}
E500 = {"model": ErrorRespuesta, "description": "Error interno"}
E503 = {"model": ErrorRespuesta, "description": "Base de datos (RDS) no disponible"}

BASE = {422: E422, 500: E500, 503: E503}
CON_404 = {**BASE, 404: E404}
PROTEGIDO = {**CON_404, 401: E401, 403: E403}
