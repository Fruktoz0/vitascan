# VitaScan – adatbázis mentés / visszaállítás (db-tools)

Ez a mappa a **`db-tools`** Docker image forráskódját és adatkönyvtárait tartalmazza (`backups/`, `config/`). A szolgáltatás a gyökér **`docker-compose.yml`** része – nincs külön compose fájl, és **nincs saját `.env`** sem: minden kulcs a repository gyökér **`.env`** / **[`.env.example`](../../.env.example)** fájlban van.

## Előfeltételek

- External Docker hálózat: `global-net`.
- PostgreSQL hostnév a stack felől: `global_postgres` (ahogy a fő compose-ban a `DATABASE_URL`).
- Környezeti változók: csak a gyökér `.env` (Docker Compose innen tölti a `${…}` interpolációt).

## Indítás

A repository gyökérből:

```bash
docker compose up -d --build
```

Szolgáltatások: `api`, `web`, `db-tools`, `prisma-studio`.

## Kapcsolat az API-val

A compose alapértelmezése:

- API → db-tools: `DB_TOOLS_URL=http://db-tools:3010`
- Közös titkos kulcs: `DB_TOOLS_SECRET` (gyökér `.env`)

Ha csak a db-tools logokat nézed lokálisan: `http://127.0.0.1:3010` (compose-ban így van kötve).

## Fájlok

| Útvonal | Szerep |
|---------|--------|
| `web/db-admin-stack/backups/` | Mentések (`*.dump`) |
| `web/db-admin-stack/config/schedule.json` | Cron ütemezés |

## Funkciók és biztonság

Az admin webfelület **Adatbázis** lapja az API `/admin/database/*` végpontjain keresztül hívja a db-tools-t.

Részletek és curl példa a korábbi szekciókban maradtak – a **szolgáltatás neve** Docker DNS szerint: `db-tools` (nem kötelező a `vitascan_db_tools` konténernév).

## Biztonság

- Élesben állíts erős `DB_TOOLS_SECRET` értéket (ne hagyd a példa defaultot).
- A db-tools portja alapból csak localhost felől van publisholva (`127.0.0.1:3010`).
