# HIVE

Intranet autoalojada para la operación diaria de una empresa. Esta carpeta es un build ya compilado y listo para correr — un solo proceso sirve todo.

Versión descargada: `v0.1.0`.

## Instalación

Hay dos formas de levantar el proceso — con Docker o manual — independientes de si es para probar la app o para producción. Lo que sí cambia entre esos dos casos es la infraestructura que hay detrás (base de datos y storage).

### Con Docker

```bash
cp .env.example .env
docker compose up -d --build
docker compose run --rm api npm run setup
```

`docker compose up --build` instala las dependencias dentro de la imagen — no hace falta correr `npm ci` por separado.

El `docker-compose.yml` incluido trae, además del servicio `api`, un Postgres y un storage local (SeaweedFS) listos para usar — es donde tiene sentido levantarlo así **para probar la app**, sin depender de ninguna cuenta externa. Para producción con Docker, editá `.env` apuntando `POSTGRES_*`/`STORAGE_PROVIDER` a tu propia infraestructura (ver más abajo) en vez de usar esos servicios bundleados.

### Manual (sin Docker)

Requiere Node.js 20.6+ y, siempre, tu propia instancia de PostgreSQL y tu propio storage — no hay equivalente local/bundleado fuera de Docker.

```bash
cp .env.example .env
# editá .env con lo de abajo

npm ci --omit=dev
npm run setup
npm start
```

### Variables de entorno

Sea cual sea el camino elegido, en producción configurá `.env` apuntando a tu propia infraestructura:

| Variable           | Qué es                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `APP_PORT`         | El único puerto en el que escucha este proceso.                                               |
| `JWT_SECRET`       | Valor largo y aleatorio, generado una sola vez — rotarlo invalida todas las sesiones activas. |
| `POSTGRES_*`       | La base de datos propia de esta instalación.                                                  |
| `STORAGE_PROVIDER` | Dónde viven los archivos subidos. Se fija en la instalación, no se cambia después.            |

**Proveedores de storage disponibles** (`STORAGE_PROVIDER`):

- `s3` — Amazon S3, o cualquier servicio compatible con el protocolo S3.
- `gcs` — Google Cloud Storage.
- `azure` — Azure Blob Storage.
- `supabase` — Supabase Storage.

Cada proveedor pide su propio grupo de variables (`STORAGE_AWS_*`, `STORAGE_GCS_*`, `STORAGE_AZURE_*`, `STORAGE_SUPABASE_*`) — solo se lee el grupo que corresponde al valor de `STORAGE_PROVIDER`. Revisá `.env.example`: ahí está cada grupo comentado, con el detalle de qué variables pide cada uno.

## Documentación

Con la app corriendo, entrá a `http://localhost:<APP_PORT>/docs`.

## Comandos

| Comando         | Qué hace                                  |
| --------------- | ----------------------------------------- |
| `npm start`     | Arranca el servidor.                      |
| `npm run setup` | Instalación inicial — solo corre una vez. |

## Reportar un bug

[Abrí un issue](https://github.com/hive-app-intranet/releases/issues/new) con la versión que estás corriendo y los pasos para reproducirlo. No compartas datos sensibles — es un repo público.

## Historial de cambios

[CHANGELOG.md](https://github.com/hive-app-intranet/releases/blob/main/CHANGELOG.md)
