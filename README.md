# API IoT – Vehículo (Examen 2.6 · desplegada en AWS)

API pública en **Python + FastAPI** (programación orientada a objetos) sobre la base `vehiculo_iot` de **Amazon RDS**.
Usa los **21 Stored Procedures** del esquema, GET/POST, **WebSocket** por vehículo y ejecución de **DEMO**.
Corre en **Amazon EC2** detrás de **Caddy (HTTPS/WSS automático)** y usa **Amazon RDS for MySQL**.

* Swagger UI: **https://TU_DOMINIO/docs**
* WebSocket: **wss://TU_DOMINIO/ws/vehiculos/{id_vehiculo}**
* Repositorio: **https://github.com/TU_USUARIO/TU_REPO**

```
Thunder Client / Swagger  →  HTTPS/WSS (Caddy, 443)  →  FastAPI en EC2 (127.0.0.1:8000)  →  Stored Procedures  →  Amazon RDS (3306, solo desde el SG de EC2)
```

## Reglas de negocio

| Flujo | Qué hace | Historial |
|---|---|---|
| **Movimiento individual** `POST /vehiculos/{id}/movimientos` | Valida → `sp_actualizar_estado` + `sp_registrar_historial` en **una transacción** → COMMIT → evento WebSocket `movimiento` | **Sí** |
| **DEMO** `POST /vehiculos/{id}/demos/{id_demo}/iniciar` | `sp_obtener_movimientos_demo` → N eventos WebSocket ordenados y temporizados → `sp_actualizar_estado` por movimiento | **No** (nunca llama a `sp_registrar_historial`) |

* `GET /vehiculos/{id}/historial` devuelve **como máximo 10** movimientos individuales (del más reciente al más antiguo). El historial completo queda en RDS.
* `conectado` **no** se vuelve verdadero por recibir un POST: se conserva el valor real de `estado_vehiculo`.
* Un POST rechazado no cambia estado ni historial y no emite eventos.
* Solo una DEMO por vehículo a la vez (`409` si ya hay una). Se puede cancelar.
* Los GET nunca modifican datos.

## Estructura

```
main.py                     # app FastAPI, manejo de errores, lifespan
config.py                   # Settings desde variables de entorno
security.py                 # X-API-Key para control y eliminación
dependencies.py             # Contenedor que crea y comparte los objetos
exceptions.py               # Errores de negocio -> códigos HTTP
database/
  connection.py             # Database: conexión a RDS + transacción (commit/rollback/cierre)
  procedures.py             # StoredProcedures: CALL con parámetros enlazados + lista blanca de los 21 SP
repositories/               # SOLO acceso a SP (sin reglas de negocio)
services/                   # Reglas de negocio (vehículos, comandos, estado, historial, movimientos, demos)
  demo_runner.py            # Ejecuta/cancela DEMO de forma asíncrona
websocket/websocket_manager.py   # ConnectionManager: clientes por vehículo
models/                     # Modelos Pydantic de entrada/salida y eventos WebSocket
routers/                    # Endpoints HTTP y WebSocket (delgados)
```

## Despliegue en EC2
* **Windows Server:** [DESPLIEGUE_WINDOWS.md](DESPLIEGUE_WINDOWS.md) y `deploy/windows/` (tareas programadas + Caddy).
* **Linux:** [DESPLIEGUE_EC2.md](DESPLIEGUE_EC2.md) y `deploy/` (systemd + Caddy).
La API corre con **un solo worker** porque el `ConnectionManager` y las DEMO en curso viven en memoria.

## Ejecución local (desarrollo)

```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate        macOS/Linux:  source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # (Windows: copy .env.example .env) y completa los valores
python -m uvicorn main:app --reload --port 8000
```

* Swagger UI: <http://localhost:8000/docs>
* En desarrollo local, el Security Group de RDS debe permitir 3306 desde **My IP** (en producción, solo desde el SG de la instancia EC2).
* `.env` está en `.gitignore`: nunca lo subas a GitHub.

### Autenticación
Las operaciones de **control y eliminación** requieren el encabezado `X-API-Key: <valor de API_KEY en .env>`
(movimientos, iniciar/cancelar DEMO y todos los `/eliminar`). Sin encabezado → `401`; clave incorrecta → `403`.

## Endpoints HTTP y SP (todos documentados también en Swagger)

| Método y ruta | Stored Procedures |
|---|---|
| `GET /vehiculos` | sp_obtener_vehiculos |
| `GET /vehiculos/{id}` | sp_obtener_vehiculo, sp_obtener_comandos_vehiculo, sp_obtener_estado, sp_obtener_demos |
| `POST /vehiculos` | sp_crear_vehiculo |
| `POST /vehiculos/{id}/actualizar` | sp_actualizar_vehiculo |
| `POST /vehiculos/{id}/eliminar` 🔒 | sp_eliminar_vehiculo |
| `GET /vehiculos/{id}/comandos` | sp_obtener_comandos_vehiculo |
| `POST /vehiculos/{id}/comandos` | sp_crear_comando |
| `POST /vehiculos/{id}/comandos/{id_comando}/actualizar` | sp_actualizar_comando |
| `POST /vehiculos/{id}/comandos/{id_comando}/eliminar` 🔒 | sp_eliminar_comando |
| `GET /vehiculos/{id}/estado` | sp_obtener_estado |
| `POST /vehiculos/{id}/movimientos` 🔒 | sp_obtener_estado, sp_actualizar_estado, sp_registrar_historial |
| `GET /vehiculos/{id}/historial?limite=10` | sp_obtener_historial |
| `GET /vehiculos/{id}/demos` | sp_obtener_demos |
| `POST /vehiculos/{id}/demos` | sp_crear_demo |
| `POST /vehiculos/{id}/demos/{id_demo}/actualizar` | sp_actualizar_demo |
| `POST /vehiculos/{id}/demos/{id_demo}/eliminar` 🔒 | sp_eliminar_demo |
| `GET /vehiculos/{id}/demos/{id_demo}/movimientos` | sp_obtener_movimientos_demo |
| `POST /vehiculos/{id}/demos/{id_demo}/movimientos` | sp_agregar_movimiento_demo |
| `POST .../movimientos/{id_demo_movimiento}/actualizar` | sp_actualizar_movimiento_demo |
| `POST .../movimientos/{id_demo_movimiento}/eliminar` 🔒 | sp_eliminar_movimiento_demo |
| `POST /vehiculos/{id}/demos/{id_demo}/iniciar` 🔒 (202) | sp_obtener_movimientos_demo, sp_actualizar_estado |
| `POST /vehiculos/{id}/demos/cancelar` 🔒 | sp_actualizar_estado (paro seguro, si existe el comando `DETENER`) |

🔒 = requiere `X-API-Key`.

### Cuerpo del POST de movimiento
```json
{ "id_comando": 1, "origen": "MANUAL" }
```
También se acepta `{ "codigo": 1 }` en lugar de `id_comando` (indica exactamente uno de los dos). `origen` es opcional (por defecto `MANUAL`).

## WebSocket

**URL pública:** `wss://TU_DOMINIO/ws/vehiculos/{id_vehiculo}`  (p. ej. `wss://TU_DOMINIO/ws/vehiculos/1`)
**URL local (desarrollo):** `ws://localhost:8000/ws/vehiculos/{id_vehiculo}`

* Al conectarse envía el último estado (`estado_inicial`).
* Varios clientes pueden monitorear el mismo vehículo; cada cliente recibe solo eventos de **su** vehículo.
* Si el vehículo no existe se cierra con código `4404`; si RDS no está disponible, con `1013`.
* El cliente puede enviar el texto `ping` y recibe `pong`.

Todos los mensajes llevan `tipo`, `id_vehiculo`, `timestamp` (UTC, ISO 8601) y, cuando aplica, `comando` y `codigo`.

| `tipo` | Cuándo | Campos extra |
|---|---|---|
| `estado_inicial` | Al abrir la conexión | `id_comando`, `conectado` (`comando`/`codigo` ausentes si no hay estado) |
| `movimiento` | Tras un POST individual confirmado en RDS | `id_comando`, `origen`, `conectado` |
| `demo_inicio` | Arranca una DEMO | `id_demo`, `total` (N) |
| `demo_movimiento` | Cada movimiento de la DEMO | `id_demo`, `orden`, `indice`, `total`, `duracion_ms`, `pausa_ms`, `id_comando` |
| `demo_fin` | Terminó la DEMO | `id_demo`, `total` |
| `demo_cancelada` | Se canceló la DEMO | `id_demo`, `total` |
| `demo_error` | Falla de datos/RDS durante la DEMO | `id_demo`, `detalle` |

Ejemplos:
```json
{"tipo":"estado_inicial","id_vehiculo":1,"comando":"ADELANTE","codigo":1,"timestamp":"2026-10-14T18:12:30Z","id_comando":1,"conectado":false}
{"tipo":"movimiento","id_vehiculo":1,"comando":"ADELANTE","codigo":1,"timestamp":"2026-10-14T18:12:31Z","id_comando":1,"origen":"WEB","conectado":false}
{"tipo":"demo_inicio","id_vehiculo":1,"timestamp":"...","id_demo":1,"total":4}
{"tipo":"demo_movimiento","id_vehiculo":1,"comando":"ADELANTE","codigo":1,"timestamp":"...","id_comando":1,"id_demo":1,"orden":1,"indice":1,"total":4,"duracion_ms":300,"pausa_ms":100}
{"tipo":"demo_fin","id_vehiculo":1,"timestamp":"...","id_demo":1,"total":4}
```

> Enviar un mensaje **no** significa ejecución física confirmada: la confirmación del ESP8266/ESP32 llegará en una práctica posterior.

### Cancelación y paro seguro
`POST /vehiculos/{id}/demos/cancelar` cancela la tarea de inmediato (no se emite ningún movimiento posterior) y envía `demo_cancelada`.
Si el catálogo del vehículo tiene un comando activo llamado **`DETENER`**, se deja como último comando con `sp_actualizar_estado`
(también ante un error). Nunca se escribe en el historial.

## Pruebas en Thunder Client (los 3 escenarios del examen, contra el servicio público)

Variable sugerida: `API_KEY` y encabezado `X-API-Key: {{API_KEY}}` en los POST protegidos.

1. **POST** `https://TU_DOMINIO/vehiculos/1/movimientos` — Body JSON `{"id_comando": 1, "origen": "MANUAL"}` → `201`.
   Verifica en MySQL: `select * from estado_vehiculo;` y `select * from historial_comandos order by id_historial desc limit 5;`
2. **GET** `https://TU_DOMINIO/vehiculos/1/historial` → máximo 10 movimientos, del más reciente al más antiguo.
   Comprueba el límite con `select count(*) from historial_comandos where id_vehiculo=1;` (si hay más de 10, la API devuelve 10).
3. **WebSocket** `wss://TU_DOMINIO/ws/vehiculos/1` → conecta, y desde otra pestaña haz **POST**
   `https://TU_DOMINIO/vehiculos/1/demos/1/iniciar` (con `X-API-Key`). Verás `demo_inicio`, N × `demo_movimiento`, `demo_fin`.
   Compara `select count(*) from historial_comandos;` antes y después: **no cambia**.

## Códigos HTTP usados
200, 201, 202 (DEMO iniciada), 400, 401, 403, 404 (no existe), 409 (conflicto/regla), 422 (validación), 500, 503 (RDS no disponible).
