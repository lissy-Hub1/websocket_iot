# Vehículo IoT · CONTROL + MONITOREO (prácticas 4.1 y 4.2)

Aplicación web Mobile First publicada en GitHub Pages: https://lissy-hub1.github.io/websocket_iot/

- **CONTROL** (`#control`, práctica 4.1): joystick, botones, DETENER y DEMO.
- **MONITOREO** (`#monitoreo`, práctica 4.2): último movimiento reportado y los diez movimientos
  individuales más recientes guardados en Amazon RDS, actualizados en tiempo real.

Las dos vistas viven en la misma página y comparten configuración, cliente REST, **una sola sesión WSS**
e indicadores. La API (FastAPI en AWS) está en su propio repositorio:
https://github.com/lissy-Hub1/websocket_iot_aws

```
GitHub Pages (CONTROL + MONITOREO)
  ├─ Fetch async/await (HTTPS) ──► FastAPI en EC2 ──► 21 Stored Procedures ──► Amazon RDS
  └─ WebSocket (WSS) ◄──────────── eventos del vehículo (también los ve un cliente externo)
```

## Estructura

```
index.html                  Página única: navegación, vista CONTROL y vista MONITOREO
assets/
  css/estilos.css           Identidad visual, Mobile First sobre Bootstrap 5
  img/                      Favicon (SVG y PNG)
  js/
    config.js               URL de la API, vehículo, clave, zonas horarias, tiempos y RUTAS
    main.js                 Arranque: une vistas, dominio y conexiones (sin reglas de negocio)
    api/cliente.js          Fetch centralizado: encabezados, timeout (AbortController), errores, JSON
    api/vehiculo.js         Operaciones de la API y validación de lo recibido (CONTROL y MONITOREO)
    api/sesion.js           Entrega la clave X-API-Key desde config.js
    conexion/websocket.js   Sesión WSS compartida: latido, reconexión con espera progresiva
    conexion/salud.js       Comprobación periódica de API y RDS
    dominio/catalogo.js     Reparte el catálogo real entre joystick, DETENER y botones
    dominio/control.js      Cola de comandos y prioridad de DETENER
    dominio/demos.js        Ciclo de vida de una DEMO
    dominio/monitoreo.js    Último movimiento + historial: carga REST, eventos WSS, deduplicación y orden
    ui/navegacion.js        Cambio de vista por hash (#control / #monitoreo)
    ui/monitoreo.js         Tarjeta del último movimiento y tabla de diez filas
    ui/                     joystick, controles, indicadores, avisos y componentes
    utilidades/fechas.js    Interpretación y formato de fecha/hora (zona horaria)
    utilidades/errores.js   ApiError y mensajes para el operador
```

Todas las rutas son relativas, así que funcionan en la subruta de GitHub Pages.

## Configuración (`assets/js/config.js`)

| Campo | Valor |
|---|---|
| `API_BASE_URL` | URL HTTPS de la API, sin diagonal final (`https://miwebiot.duckdns.org`) |
| `VEHICLE_ID` | Id del vehículo (`1`) |
| `API_KEY` | Clave `X-API-Key` que la API exige para mover el vehículo y para la DEMO |
| `ZONA_HORARIA_BD` | Zona en la que RDS guarda `fecha_hora` / `fecha_actualizacion` (`UTC`) |
| `ZONA_HORARIA_VISTA` | Zona en la que se muestran fecha y hora (`America/Mexico_City`) |
| `LIMITE_HISTORIAL` | Filas de la tabla de MONITOREO (`10`) |
| `ALUMNO`, `ANIO` | Créditos del pie |

> **Aviso sobre la clave.** Por observación del docente la web ya no pide la clave al operador: está en
> `config.js` y, por lo tanto, **es pública** en GitHub Pages. La misma clave protege los `/eliminar` de la
> API. Si se filtra, cámbiala en el `.env` del servidor y en `config.js`. Nunca pongas aquí credenciales de
> RDS/MySQL ni claves de AWS.

En el servidor de AWS, `.env` debe autorizar el origen de Pages: `CORS_ORIGINS=https://lissy-hub1.github.io`.

## Ejecución local

```bash
python3 -m http.server 5500
```

Abre `http://localhost:5500/#control` o `http://localhost:5500/#monitoreo`. Para llamar a la API desde ahí,
agrega `http://localhost:5500` a `CORS_ORIGINS`.

## Publicación en GitHub Pages

1. Sube los cambios a la rama `main`.
2. En **Settings → Pages**: *Deploy from a branch*, rama `main`, carpeta **`/ (root)`**
   (antes era `/docs`; hay que cambiarlo una vez).
3. Abre la URL en computadora y en un teléfono real, en vertical y horizontal.

## Contratos de AWS que usa la aplicación

| Uso | Operación | Clave |
|---|---|---|
| Vehículo, comandos y DEMO | `GET /vehiculos/{id}` | No |
| Movimiento y DETENER | `POST /vehiculos/{id}/movimientos` con `{id_comando, origen}` | Sí |
| Duración de la DEMO | `GET /vehiculos/{id}/demos/{id_demo}/movimientos` | No |
| Iniciar / cancelar DEMO | `POST …/demos/{id_demo}/iniciar` (202) · `POST …/demos/cancelar` | Sí |
| **Último estado** (MONITOREO) | `GET /vehiculos/{id}/estado` → `{comando, codigo, id_comando, vehiculo, conectado, fecha_actualizacion}` o `null` | No |
| **Historial** (MONITOREO) | `GET /vehiculos/{id}/historial?limite=10` → `{movimientos: [{id_historial, comando, codigo, fecha_hora, origen}]}` | No |
| Salud de la API | `GET /openapi.json` (no existe una ruta de salud dedicada) | No |
| Diagnóstico de RDS | `GET /vehiculos/{id}/estado`: 200 = respondió, 503 = RDS caído | No |
| Eventos | `WSS /ws/vehiculos/{id}` | No |

Eventos WSS (todos con `tipo`, `id_vehiculo` y `timestamp` UTC ISO 8601): `estado_inicial`, `movimiento`,
`demo_inicio`, `demo_movimiento`, `demo_fin`, `demo_cancelada`, `demo_error`.

## Cómo funciona MONITOREO

| Situación | Qué hace la app |
|---|---|
| Al abrir la app o volver a MONITOREO | REST: `GET /estado` y `GET /historial?limite=10` |
| Evento `movimiento` del mismo vehículo | Actualiza la tarjeta al instante y **vuelve a pedir el historial a la API** (la fila no se inventa: recibir el evento no prueba que quedó guardado) |
| Varios eventos seguidos | Se agrupan en una sola consulta (350 ms) y nunca hay dos consultas del historial a la vez |
| Evento `demo_movimiento` | Solo cambia la tarjeta («WSS · paso de DEMO»); **no toca la tabla**, porque la DEMO no se guarda en historial |
| `demo_fin` / `demo_cancelada` | Recupera el estado guardado por REST (el paro seguro deja DETENER sin evento) |
| `estado_inicial` (al conectar o reconectar) | Resincroniza estado e historial por REST |
| Eventos de otro vehículo, repetidos o más viejos que el mostrado | Se ignoran |
| Respuesta REST que llega después de un evento más nuevo | Se descarta para no pisar el dato reciente |
| Sin sesión WSS | La tarjeta se marca «Último valor conocido»; al reconectar se resincroniza |

No hay polling del historial: solo se consulta por un evento, una reconexión, al volver a la vista o con
el botón «Actualizar». La tabla reutiliza las filas por `id_historial` y ordena por `fecha_hora` y luego id.
Quitar la fila 11 de la pantalla nunca borra nada en RDS.

### Fechas y horas

Los eventos traen `timestamp` en UTC con `Z`. RDS devuelve `fecha_hora` / `fecha_actualizacion` sin
desfase; se interpretan en `ZONA_HORARIA_BD` (UTC, valor por defecto de RDS) y se muestran en
`ZONA_HORARIA_VISTA`. Si el dato falta, se muestra «—»: nunca se fabrica una hora.

### Lo que NO demuestra cada dato

- «Solicitado», «Aceptado por API», «Evento WSS» y «Registro en RDS» son cosas distintas.
- Ninguno prueba que los motores se movieron: el ESP8266/ESP32 se conecta en otra etapa.
- «WebSocket WSS · En línea» es la sesión de **este navegador**, no la presencia del vehículo.

## Indicadores

| Indicador | Evidencia | Estados |
|---|---|---|
| WebSocket WSS | Apertura, cierre, error y latido `ping`/`pong` de la sesión del navegador | En línea / Conectando / Reconectando / Desconectado |
| Servidor AWS · API de 21 servicios | `GET /openapi.json` cada 30 s, timeout 5 s | Disponible / Comprobando / No disponible |
| Amazon RDS | `GET /vehiculos/{id}/estado` (200 / 503) | Disponible / No disponible / Sin verificar |

## Reglas de CONTROL (sin cambios desde 4.1)

- Sin ráfagas: un movimiento en vuelo a la vez; de la cola queda el más reciente.
- DETENER primero: vacía la cola y sale de inmediato, aun durante una DEMO (también la cancela). Atajo `Esc`.
- La DEMO la ejecuta el backend; mientras corre se bloquean joystick y botones, pero no DETENER ni cancelar.

## Pruebas funcionales (práctica 4.2)

Abre además un cliente WebSocket independiente (Postman, Thunder Client o extensión de Chrome) en
`wss://miwebiot.duckdns.org/ws/vehiculos/1`.

| Prueba | Pasos | Resultado esperado |
|---|---|---|
| A. Carga inicial | Abre `#monitoreo` con DevTools → Network | `GET /estado` y `GET /historial?limite=10`; tabla ordenada del más reciente al más antiguo; con historial vacío dice «Sin movimientos» |
| B. Evento en vivo | En `#control` ejecuta AVANZAR, DERECHA y DETENER; cambia a `#monitoreo` | El cliente externo recibe 3 eventos `movimiento`; tarjeta y tabla cambian sin recargar |
| C. Otra sesión y límite | Desde otra pestaña o Postman envía más de 10 movimientos | MONITOREO se actualiza solo; exactamente 10 filas, sin duplicados |
| D. Reconexión | Corta la red (DevTools → Offline) y vuelve | WSS pasa a Desconectado/Reconectando y regresa; nueva carga REST en Network |
| E. DEMO y diseño | Ejecuta una DEMO con `#monitoreo` abierto | La tarjeta muestra los pasos; la tabla no cambia. Revisa vertical, horizontal y escritorio |
