"""Configuración de la aplicación leída desde variables de entorno (.env)."""
import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class ConfigError(RuntimeError):
    """Falta una variable de entorno obligatoria."""


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    db_connect_timeout: int
    api_key: str
    db_ssl_ca: str | None = None  # ruta al bundle de CA de RDS (opcional)

    @classmethod
    def from_env(cls) -> "Settings":
        def requerida(nombre: str) -> str:
            valor = os.getenv(nombre)
            if not valor:
                # Solo se indica el NOMBRE de la variable, nunca su valor.
                raise ConfigError(f"Falta la variable de entorno {nombre} (revisa tu archivo .env)")
            return valor

        return cls(
            db_host=requerida("DB_HOST"),
            db_port=int(os.getenv("DB_PORT", "3306")),
            db_name=os.getenv("DB_NAME", "vehiculo_iot"),
            db_user=requerida("DB_USER"),
            db_password=requerida("DB_PASSWORD"),
            db_connect_timeout=int(os.getenv("DB_CONNECT_TIMEOUT", "5")),
            api_key=requerida("API_KEY"),
            db_ssl_ca=os.getenv("DB_SSL_CA") or None,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings.from_env()
