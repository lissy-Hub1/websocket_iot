"""Autenticación simple por API key para operaciones de control y eliminación."""
import hmac

from fastapi import Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from config import Settings, get_settings

_encabezado = APIKeyHeader(name="X-API-Key", auto_error=False, description="Clave de la API (ver .env)")


def exigir_api_key(
    clave: str | None = Security(_encabezado),
    settings: Settings = Depends(get_settings),
) -> None:
    if not clave:
        raise HTTPException(status_code=401, detail="Falta el encabezado X-API-Key")
    if not hmac.compare_digest(clave, settings.api_key):
        raise HTTPException(status_code=403, detail="API key inválida")
