from datetime import datetime, timezone

from database import Database
from models.historial import MovimientoSolicitud
from repositories import ComandoRepository, EstadoRepository, HistorialRepository, VehiculoRepository

from .reglas import buscar_comando, exigir_vehiculo


class MovimientoService:
    """Movimiento INDIVIDUAL: actualiza estado e historial en una sola transacción."""

    def __init__(self, db: Database):
        self._db = db

    def registrar(self, id_vehiculo: int, solicitud: MovimientoSolicitud) -> dict:
        with self._db.transaccion() as sp:
            exigir_vehiculo(VehiculoRepository(sp), id_vehiculo, activo=True)
            comando = buscar_comando(
                ComandoRepository(sp), id_vehiculo,
                id_comando=solicitud.id_comando, codigo=solicitud.codigo, activo=True,
            )
            estados = EstadoRepository(sp)
            previo = estados.obtener(id_vehiculo)
            # `conectado` NO se asume verdadero por recibir un HTTP: se conserva el valor real.
            conectado = bool(previo["conectado"]) if previo else False

            estados.actualizar(id_vehiculo, comando["id_comando"], conectado)           # sp_actualizar_estado
            HistorialRepository(sp).registrar(id_vehiculo, comando["id_comando"], solicitud.origen)  # sp_registrar_historial
        # Aquí ya se hizo COMMIT en RDS: recién ahora el router puede notificar por WebSocket.
        return {
            "id_vehiculo": id_vehiculo,
            "id_comando": comando["id_comando"],
            "comando": comando["nombre"],
            "codigo": comando["codigo"],
            "origen": solicitud.origen,
            "conectado": conectado,
            "fecha_hora": datetime.now(timezone.utc),
        }
