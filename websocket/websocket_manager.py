"""Administra clientes WebSocket agrupados por vehículo."""
import logging
from collections import defaultdict

from fastapi import WebSocket

from models.eventos import EventoWS

log = logging.getLogger("app_iot.ws")


class ConnectionManager:
    def __init__(self) -> None:
        self._clientes: dict[int, set[WebSocket]] = defaultdict(set)

    def conectar(self, id_vehiculo: int, ws: WebSocket) -> None:
        """El `accept()` lo hace el endpoint; aquí solo se registra al cliente."""
        self._clientes[id_vehiculo].add(ws)
        log.info("Cliente conectado al vehículo %s (total %s)", id_vehiculo, len(self._clientes[id_vehiculo]))

    def desconectar(self, id_vehiculo: int, ws: WebSocket) -> None:
        self._clientes[id_vehiculo].discard(ws)
        if not self._clientes[id_vehiculo]:
            self._clientes.pop(id_vehiculo, None)

    def total(self, id_vehiculo: int) -> int:
        return len(self._clientes.get(id_vehiculo, ()))

    async def enviar(self, ws: WebSocket, evento: EventoWS) -> None:
        await ws.send_json(evento.a_json())

    async def difundir(self, id_vehiculo: int, evento: EventoWS) -> int:
        """Envía el evento SOLO a los clientes de ese vehículo.
        Un cliente caído se descarta sin afectar a los demás. Devuelve cuántos lo recibieron."""
        mensaje = evento.a_json()
        entregados = 0
        for ws in list(self._clientes.get(id_vehiculo, ())):
            try:
                await ws.send_json(mensaje)
                entregados += 1
            except Exception:  # cliente desconectado o con error
                log.info("Se descarta un cliente caído del vehículo %s", id_vehiculo)
                self.desconectar(id_vehiculo, ws)
        return entregados
