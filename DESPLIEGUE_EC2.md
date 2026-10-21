# Despliegue en Amazon EC2 (examen 2.6)

IP de la instancia: **44.219.102.53**

La lógica de la API (POO, 21 SP, WebSocket, DEMO) **no cambia**. Lo que se agrega es el entorno:
dominio + HTTPS/WSS, ejecución persistente y red segura hacia RDS.

```
Thunder Client / Swagger ──HTTPS/WSS (443)──► Caddy ──► Uvicorn 127.0.0.1:8000 ──► RDS (3306, solo desde el SG de EC2)
```

---

## 1. Dominio y IP fija

**HTTPS no se puede emitir para una IP "pelona" de forma práctica; necesitas un nombre de dominio.** Opciones gratuitas:

| Opción | Cómo | Nota |
|---|---|---|
| **DuckDNS** (recomendada) | Entra a duckdns.org, crea un subdominio (p. ej. `miiot.duckdns.org`) y apúntalo a `44.219.102.53` | Estable y gratuito |
| **sslip.io** (sin registro) | Tu dominio sería `44-219-102-53.sslip.io` (ya resuelve a tu IP) | Funciona al instante, pero comparte límites de Let's Encrypt con otros usuarios; si falla, usa DuckDNS |

Verifica que resuelve a tu IP: `nslookup TU_DOMINIO`.

**Elastic IP:** en la consola EC2 → *Elastic IPs*, confirma que `44.219.102.53` esté asociada como Elastic IP.
Si es una IP pública normal, **cambiará al detener/iniciar la instancia** y el dominio dejará de funcionar.

## 2. Security Groups

**SG de la EC2** (Inbound):

| Tipo | Puerto | Origen |
|---|---|---|
| SSH | 22 | **Mi IP** (no `0.0.0.0/0`) |
| HTTP | 80 | 0.0.0.0/0 (Let's Encrypt lo necesita) |
| HTTPS | 443 | 0.0.0.0/0 |

**No abras el 8000**: Uvicorn solo escucha en `127.0.0.1`.

**SG de RDS** (Inbound):

| Tipo | Puerto | Origen |
|---|---|---|
| MySQL/Aurora | 3306 | **El Security Group de la EC2** (selecciónalo por nombre `sg-...`) |

Elimina cualquier regla `0.0.0.0/0` hacia 3306. Si aún necesitas conectarte desde tu laptop, deja una regla temporal con *Mi IP* y bórrala antes de entregar.
Si EC2 y RDS están en la misma VPC, usa el endpoint de RDS normal (resuelve a IP privada) y, si es posible, deja *Publicly accessible = No*.

## 3. Subir los cambios a GitHub (en tu laptop)

Copia el contenido de esta carpeta sobre tu proyecto (respetando rutas; `README.md`, `main.py`, `config.py` y `database/connection.py` reemplazan a los existentes), luego:

```bash
git ls-files | grep -i "\.env$"     # NO debe imprimir nada. Si imprime .env, ver nota abajo
sed -i 's/TU_DOMINIO/tu-dominio-real/g' README.md   # (macOS: sed -i '' ...)  o reemplaza a mano
git add .
git commit -m "Despliegue en EC2: HTTPS/WSS, systemd, Caddy y documentación"
git push
```

> Si `.env` aparece en `git ls-files`, estuvo versionado: bórralo del índice (`git rm --cached .env`), **cambia la contraseña de RDS y el API_KEY**, porque quedó en el historial.
> Tampoco subas tu archivo `.pem`.

## 4. Preparar la EC2

```bash
ssh -i tu-llave.pem ubuntu@44.219.102.53

git clone https://github.com/TU_USUARIO/TU_REPO.git websocket_iot
cd websocket_iot
cp .env.example .env
nano .env          # completa DB_HOST (endpoint de RDS), DB_USER, DB_PASSWORD y un API_KEY nuevo
```

*(Opcional, recomendado) cifrar EC2→RDS:*

```bash
curl -o ~/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
echo 'DB_SSL_CA=/home/ubuntu/global-bundle.pem' >> .env
```

> El repo debe quedar clonado en `/home/ubuntu/websocket_iot` (el script ajusta la ruta si usas otra).
> Si el repo es privado, usa un token personal de GitHub o una *deploy key*.

## 5. Instalar y arrancar (un solo comando)

```bash
bash deploy/setup_ec2.sh TU_DOMINIO
```

Hace: paquetes, venv + dependencias, servicio **systemd** (arranca con el servidor, se reinicia si falla, sigue vivo al cerrar SSH/VS Code) y **Caddy** (certificado HTTPS automático).

Comandos útiles:

```bash
sudo systemctl status websocket_iot
journalctl -u websocket_iot -f        # logs de la API
journalctl -u caddy -f                # logs de Caddy / certificado
sudo systemctl restart websocket_iot  # tras un git pull
```

Actualizar después de cambios: `cd ~/websocket_iot && git pull && .venv/bin/pip install -r requirements.txt && sudo systemctl restart websocket_iot`

## 6. Verificación (desde tu laptop, no desde la EC2)

```bash
curl -i https://TU_DOMINIO/vehiculos                 # 200 + JSON
curl -i -X POST https://TU_DOMINIO/vehiculos/1/movimientos \
     -H "Content-Type: application/json" -d '{"id_comando":1}'   # 401 (sin API key = protegido)
python deploy/probar_wss.py wss://TU_DOMINIO/ws/vehiculos/1 30    # imprime estado_inicial
```

Abre `https://TU_DOMINIO/docs` (candado válido) y usa **Authorize** con tu `X-API-Key`.
Reinicia la instancia una vez para comprobar que todo vuelve solo (con Elastic IP).

## 7. Los tres escenarios en Thunder Client

Variables: `BASE=https://TU_DOMINIO`, `API_KEY=...`; encabezado `X-API-Key: {{API_KEY}}` en los POST protegidos.

1. **POST + WSS individual**
   Abre **dos** conexiones WebSocket a `wss://TU_DOMINIO/ws/vehiculos/1` → ambas muestran `estado_inicial`.
   `POST {{BASE}}/vehiculos/1/movimientos` con `{"id_comando": 1, "origen": "MANUAL"}` → `201`; ambas reciben `movimiento`.
   Evidencia SQL: `select * from estado_vehiculo;` y `select * from historial_comandos order by id_historial desc limit 5;`
   *(Opcional: abre un tercer WSS a otro vehículo y muestra que no recibe nada.)*
2. **GET historial** → `GET {{BASE}}/vehiculos/1/historial`: máximo 10, del más reciente al más antiguo, sin movimientos DEMO.
   Evidencia: `select count(*) from historial_comandos where id_vehiculo=1;` (si hay más de 10, la API devuelve 10).
3. **DEMO por WSS** → con el WSS abierto: `POST {{BASE}}/vehiculos/1/demos/1/iniciar` (`202`).
   Se ven `demo_inicio`, N × `demo_movimiento` (con `duracion_ms`/`pausa_ms`) y `demo_fin`.
   Después: `GET {{BASE}}/vehiculos/1/estado` (último estado) y `select count(*) from historial_comandos;` igual que antes.
   *(Extra: iniciar otra DEMO mientras corre → `409`; `POST .../demos/cancelar` → `demo_cancelada`.)*

## 8. Lista para el PDF de evidencias

- [ ] Diagrama EC2 – RDS (Security Groups con el origen del SG, **sin** mostrar contraseñas ni el endpoint completo si prefieres)
- [ ] Swagger UI en `https://TU_DOMINIO/docs` con la URL visible + repositorio GitHub (README con eventos WSS)
- [ ] Prueba 1: dos WSS con `estado_inicial`, el POST y el evento en ambas + SQL de estado e historial
- [ ] Prueba 2: JSON del GET (≤ 10, orden descendente)
- [ ] Prueba 3: `demo_inicio` → N movimientos con tiempos → `demo_fin`, estado final y conteo de historial sin cambio
- [ ] Enlaces: repositorio, Swagger (HTTPS) y dirección `wss://`
- [ ] Conclusiones técnicas y apuntes manuscritos de las 21 APIs (los redactas tú; son parte de la evaluación presencial)

## 9. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Caddy no obtiene certificado | DNS aún no apunta a la IP, o el 80/443 está cerrado | `nslookup`, revisa SG, `journalctl -u caddy` |
| `503 La base de datos no está disponible` | SG de RDS no permite al SG de la EC2, o `.env` incorrecto | Revisa regla 3306 y `DB_HOST`; `journalctl -u websocket_iot` |
| El servicio no arranca: *Falta la variable de entorno* | `.env` incompleto o en otra carpeta | Debe estar en `/home/ubuntu/websocket_iot/.env` |
| WSS cierra con `4404` | El vehículo no existe | Usa un `id_vehiculo` válido |
| El dominio dejó de responder tras reiniciar | IP no era Elastic | Asocia una Elastic IP y actualiza DNS |
| `SSL` error al conectar a RDS | `DB_SSL_CA` apunta a un archivo inexistente | Verifica la ruta o quita la variable |
