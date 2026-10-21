# Despliegue en EC2 con **Windows Server** (examen 2.6)

IP: **44.219.102.53** · El dominio de DuckDNS solo es el *nombre*; el **HTTPS lo pone Caddy** en tu servidor.

```
Cliente ──HTTPS/WSS 443──► Caddy ──► Uvicorn 127.0.0.1:8000 ──► RDS (3306, solo desde el SG de la EC2)
```

## 1. Antes de tocar Windows
**DuckDNS:** en duckdns.org, tu subdominio debe tener *current ip* = `44.219.102.53`. Verifica en tu laptop: `nslookup TU_DOMINIO`.
**Elastic IP:** confirma en EC2 → Elastic IPs que `44.219.102.53` es una Elastic IP (si no, cambia al detener la instancia).

**Security Group de la EC2 (Inbound):**

| Tipo | Puerto | Origen |
|---|---|---|
| RDP | 3389 | **Mi IP** |
| HTTP | 80 | 0.0.0.0/0 (Let's Encrypt lo usa para validar) |
| HTTPS | 443 | 0.0.0.0/0 |

No abras el 8000. **Security Group de RDS:** MySQL 3306 con origen = *el Security Group de la EC2*; borra reglas `0.0.0.0/0`.

## 2. Dentro de la instancia Windows (una sola vez)
1. **Python 3.12 o 3.13** de python.org, marcando *Add to PATH* e *Install for all users*. Evita 3.14 (algunas dependencias de uvicorn en Windows pueden no tener paquete precompilado).
2. **Caddy:** descarga `caddy_windows_amd64.zip` de github.com/caddyserver/caddy/releases, extrae `caddy.exe` en `C:\caddy\`.
3. Pon el proyecto en una ruta corta, p. ej. **`C:\websocket_iot`** (no dentro de tu carpeta de usuario).
4. Crea el `.env`:
   ```powershell
   cd C:\websocket_iot
   copy .env.example .env
   notepad .env      # DB_HOST = endpoint de RDS, DB_USER, DB_PASSWORD, API_KEY nuevo
   ```
5. ¿Algo ocupa el puerto 80 (p. ej. IIS)? `netstat -ano | findstr ":80 "`. Si sí, detén ese servicio: `Stop-Service W3SVC`.

## 3. Instalar y dejar persistente (PowerShell **como Administrador**)
```powershell
cd C:\websocket_iot
powershell -ExecutionPolicy Bypass -File .\deploy\windows\setup_windows.ps1 -Dominio TU_DOMINIO
```
Crea el entorno virtual, abre 80/443 en el firewall de Windows y registra dos tareas que **arrancan con Windows** y se reinician si fallan: `IoT-API` y `IoT-Caddy`. Seguirán vivas aunque cierres RDP.

La primera vez Caddy tarda unos segundos en obtener el certificado.

## 4. Verificar (desde tu laptop, no desde la EC2)
```
https://TU_DOMINIO/docs                              (candado válido)
python deploy/probar_wss.py wss://TU_DOMINIO/ws/vehiculos/1 30
```
Reinicia la instancia una vez y comprueba que todo vuelve solo.

## 5. Operación diaria
```powershell
Get-ScheduledTask IoT-API, IoT-Caddy | Select TaskName, State
Get-Content C:\websocket_iot\api.log -Tail 50 -Wait        # logs de la API
# Tras un git pull:
Stop-ScheduledTask IoT-API; Start-ScheduledTask IoT-API
```

## 6. Problemas frecuentes
| Síntoma | Causa | Solución |
|---|---|---|
| Sigue saliendo `http://` / "no seguro" | Caddy no corre o no obtuvo certificado | `Get-ScheduledTask IoT-Caddy`; ejecuta a mano `C:\caddy\caddy.exe run --config C:\caddy\Caddyfile` y lee el error |
| Caddy: error al validar el dominio | DNS no apunta a la IP, o 80/443 cerrados (SG o firewall) | `nslookup`, revisa SG y firewall; puerto 80 libre |
| `503 La base de datos no está disponible` | SG de RDS no deja entrar al SG de la EC2, o `.env` mal | Revisa regla 3306 y `DB_HOST`; mira `api.log` |
| `api.log`: *Falta la variable de entorno* | `.env` incompleto o en otra carpeta | Debe estar en `C:\websocket_iot\.env` |
| `pip install` falla compilando | Python 3.14 | Instala 3.12/3.13 y borra `.venv` |
| Dominio muerto tras reiniciar | IP no era Elastic | Asocia Elastic IP y actualiza DuckDNS |

Las pruebas de Thunder Client y la lista de evidencias están en `DESPLIEGUE_EC2.md` (secciones 7 y 8); aplican igual.
