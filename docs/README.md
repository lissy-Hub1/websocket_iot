# Aplicación de CONTROL para vehículo IoT (práctica 4.1)

Frontend Mobile First publicado en GitHub Pages. Controla el vehículo con joystick, botones y DEMO
consumiendo la API FastAPI ya desplegada en AWS. No incluye monitoreo, CRUD ni control físico del ESP.

```
GitHub Pages → Fetch/async-await → API REST en AWS (FastAPI) → Amazon RDS
                                          └→ evento WebSocket (WSS) → esta app + cliente externo
```

## Estructura

```
docs/
  index.html            HTML semántico y referencias relativas (compatibles con subruta de Pages)
  css/estilos.css       Paleta pastel/neón y diseño Mobile First sobre Bootstrap 5
  img/                  Favicon propio (SVG y PNG)
  js/
    config.js           URL base, id del vehículo, créditos, tiempos y rutas de la API
    main.js             Arranque: conecta interfaz, dominio y conexiones
    api/cliente.js      Fetch centralizado: encabezados, timeout, errores y JSON
    api/vehiculo.js     Operaciones de la API y validación de lo recibido
    api/sesion.js       Clave de operación, solo en la pestaña (sessionStorage)
    conexion/websocket.js  Sesión WSS, latido y reconexión
    conexion/salud.js   Comprobación periódica de API y RDS
    dominio/catalogo.js Reparte el catálogo real entre joystick, DETENER y botones
    dominio/control.js  Servicio único de comandos: cola, duplicados y prioridad de DETENER
    dominio/demos.js    Ciclo de vida de una DEMO
    ui/                 joystick, controles, indicadores, traza, avisos y componentes
    utilidades/errores.js  ApiError y mensajes para el operador
pruebas_frontend/       Pruebas de reglas con Node (no se publican)
```

## Configuración

Edita `docs/js/config.js`:

| Campo | Valor |
|---|---|
| `API_BASE_URL` | URL HTTPS de tu API, sin diagonal final |
| `VEHICLE_ID` | Id de tu vehículo de prueba |
| `ALUMNO`, `ANIO` | Texto de los créditos del pie |

En el servidor de AWS agrega a `.env` el origen autorizado y reinicia la API (solo esquema y dominio):

```
CORS_ORIGINS=https://TU_USUARIO.github.io
```

## Ejecución local

```bash
python3 -m http.server 5500 --directory docs
```

Abre `http://localhost:5500`. Para llamar a la API desde ahí, agrega ese origen a `CORS_ORIGINS`.

Pruebas de las reglas de comandos:

```bash
node --test pruebas_frontend/control.test.mjs
```

## Publicación en GitHub Pages

1. Sube el repositorio a GitHub.
2. En **Settings → Pages**, elige **Deploy from a branch**, tu rama y la carpeta **/docs**.
3. Abre `https://TU_USUARIO.github.io/NOMBRE_DEL_REPO/` en computadora y en un teléfono real.

## Puntos de integración con la API

| Acción | Operación | Clave |
|---|---|---|
| Vehículo, comandos y DEMO | `GET /vehiculos/{id}` | No |
| Movimiento y DETENER | `POST /vehiculos/{id}/movimientos` con `{id_comando, origen}` | Sí |
| Duración de la DEMO elegida | `GET /vehiculos/{id}/demos/{id_demo}/movimientos` | No |
| Iniciar DEMO | `POST /vehiculos/{id}/demos/{id_demo}/iniciar` (202) | Sí |
| Cancelar DEMO | `POST /vehiculos/{id}/demos/cancelar` | Sí |
| Eventos | `WSS /ws/vehiculos/{id}` | No |

### Cómo se calculan los tres indicadores

| Indicador | Evidencia | Qué NO demuestra |
|---|---|---|
| WebSocket WSS | Apertura, cierre, error y latido `ping`/`pong` de la sesión de este navegador | Que el vehículo físico esté conectado |
| Servidor AWS · API de 21 servicios | `GET /openapi.json` cada 30 s, con timeout de 5 s | Que funcionen las 21 operaciones |
| Amazon RDS | `GET /vehiculos/{id}/estado`: 200 = respondió; 503 = el código documentado de RDS caído; otro resultado o API caída = «Sin verificar» | Más allá de esa consulta puntual |

La API no tiene una ruta de salud ni un diagnóstico dedicado de RDS, y no se inventó ninguno. Para mostrar
siempre «Sin verificar» en RDS, pon `diagnosticoRds: null` en `RUTAS` de `config.js`.

## Seguridad

- `X-API-Key` protege los comandos. La escribe la persona que opera y queda solo en esa pestaña; **nunca** va en el repositorio.
- Quien tenga la URL de Pages no puede mover el vehículo sin esa clave. CORS no es autenticación.
- Solo HTTPS/WSS desde Pages: la app avisa si la configuración causaría contenido mixto.
- Los datos remotos se validan y se muestran con `textContent`. El navegador nunca se conecta a MySQL/RDS.

## Reglas de control

- **Sin ráfagas:** el joystick envía solo al cambiar de dirección y hay un movimiento en vuelo a la vez; de la cola queda el más reciente.
- **DETENER primero:** vacía la cola y sale de inmediato, aun durante una DEMO (también la cancela) o con una solicitud pendiente. Atajo: tecla `Esc`.
- **Respuestas tardías:** no reactivan la interfaz. Si el backend registró el comando anterior después de DETENER (según `fecha_hora`), DETENER se repite una vez.
- **DEMO:** la secuencia y sus tiempos los ejecuta el backend. Mientras corre se bloquean joystick y botones, pero no DETENER ni cancelar.
- **Evidencia:** «Solicitado», «Aceptado por API» y «Evento recibido» se marcan por separado. Ninguno prueba que los motores se movieron.

## Pruebas funcionales y evidencias

Abre además un cliente WebSocket independiente (Postman, Thunder Client o extensión de Chrome) en
`wss://TU_DOMINIO/ws/vehiculos/{id}`. Debe recibir `estado_inicial` al conectarse.

| Prueba | Pasos | Resultado esperado en el cliente externo |
|---|---|---|
| A. Movimiento | Desde el teléfono, empuja el joystick hacia avanzar | POST 201 y evento `movimiento` con el mismo vehículo, comando y código |
| B. Cambio y detención | Cambia de dirección sin soltar y luego suelta | Un evento por dirección y uno de DETENER, sin duplicados por arrastre |
| C. DEMO | Elige una DEMO e iníciala; repite y cancélala | `demo_inicio`, N × `demo_movimiento` en orden, y `demo_fin` o `demo_cancelada` |
| D. Indicadores | Corta y recupera la red o reinicia la API | WebSocket y API cambian por separado; RDS muestra su diagnóstico o «Sin verificar» |
| E. Responsividad | URL publicada en vertical, horizontal y escritorio | Sin desbordes; controles visibles y funcionales |

Los movimientos de una DEMO no deben aparecer en `GET /vehiculos/{id}/historial`.
