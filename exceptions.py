"""Excepciones de negocio. Cada una se traduce a un código HTTP en main.py."""


class ErrorDeNegocio(Exception):
    status_code = 400

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


class NoEncontrado(ErrorDeNegocio):
    status_code = 404


class Conflicto(ErrorDeNegocio):
    status_code = 409


class SolicitudInvalida(ErrorDeNegocio):
    status_code = 400


class ServicioNoDisponible(ErrorDeNegocio):
    status_code = 503
