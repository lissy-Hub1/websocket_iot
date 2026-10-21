"""Conexión a Amazon RDS y manejo de transacciones."""
import logging
from contextlib import contextmanager
from typing import Iterator

import pymysql
from pymysql.constants import CLIENT

from config import Settings
from exceptions import Conflicto, ServicioNoDisponible

from .procedures import StoredProcedures

log = logging.getLogger("app_iot.db")


class Database:
    """Abre una conexión por operación y garantiza commit/rollback/cierre."""

    def __init__(self, settings: Settings):
        self._s = settings

    def _conectar(self) -> pymysql.connections.Connection:
        try:
            return pymysql.connect(
                host=self._s.db_host,
                port=self._s.db_port,
                user=self._s.db_user,
                password=self._s.db_password,
                database=self._s.db_name,
                connect_timeout=self._s.db_connect_timeout,
                charset="utf8mb4",
                autocommit=False,
                # rowcount = filas COINCIDENTES (no solo modificadas) para detectar "no existe"
                client_flag=CLIENT.FOUND_ROWS,
                # Cifra el tráfico EC2 -> RDS si se configura DB_SSL_CA (ver DESPLIEGUE_EC2.md)
                ssl_ca=self._s.db_ssl_ca,
            )
        except pymysql.err.OperationalError as exc:
            log.error("No se pudo conectar a la base de datos: %s", exc.args[:1])
            raise ServicioNoDisponible("La base de datos no está disponible") from exc

    @contextmanager
    def transaccion(self) -> Iterator[StoredProcedures]:
        """Todo lo ejecutado dentro del bloque es atómico: commit al salir, rollback si falla."""
        conexion = self._conectar()
        try:
            yield StoredProcedures(conexion)
            conexion.commit()
        except pymysql.err.IntegrityError as exc:
            conexion.rollback()
            log.warning("Violación de integridad: %s", exc.args)
            raise Conflicto("La operación viola una restricción de datos (duplicado o relación inválida)") from exc
        except pymysql.err.OperationalError as exc:
            conexion.rollback()
            log.error("Error operacional de MySQL: %s", exc.args)
            raise ServicioNoDisponible("La base de datos no está disponible") from exc
        except BaseException:
            conexion.rollback()
            raise
        finally:
            conexion.close()
