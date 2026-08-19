# VitaScan – adatbázis mentés / visszaállítás (db-tools)

Ez a mappa a **`db-tools`** Docker image forráskódját és adatkönyvtárait tartalmazza (`backups/`, `config/`, `rclone/`). A szolgáltatás a gyökér **`docker-compose.yml`** része – nincs külön compose fájl, és **nincs saját `.env`** sem: minden kulcs a repository gyökér **`.env`** / **[`.env.example`](../../.env.example)** fájlban van.

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
| `web/db-admin-stack/backups/` | Mentések (`*.tar.gz` teljes csomag, régi `*.dump` is) |
| `web/db-admin-stack/config/schedule.json` | Cron ütemezés |
| `web/db-admin-stack/rclone/` | rclone config (Google Drive OAuth) — ne commitold |

## Google Drive feltöltés (rclone)

Kézi és ütemezett mentés után a db-tools `rclone copy`-val feltölti a `.tar.gz` csomagot (adatbázis + receptképek) a megadott remote mappába. Alapból **ki van kapcsolva**.

### Setup (My Drive, OAuth)

1. Telepítsd az [rclone](https://rclone.org/install/)-t a host gépre.
2. Futtasd: `rclone config` → új remote neve pl. `gdrive`, típus: **Google Drive** (böngészős OAuth).
3. Másold a keletkező configot a volume alá:

   ```text
   Windows: %APPDATA%\rclone\rclone.conf  →  web/db-admin-stack/rclone/rclone.conf
   Linux/macOS: ~/.config/rclone/rclone.conf  →  web/db-admin-stack/rclone/rclone.conf
   ```

4. A Drive-on hozd létre a célmappát (pl. `VitaScan/backups`).
5. A gyökér `.env`-ben:

   ```env
   RCLONE_UPLOAD_ENABLED=true
   RCLONE_REMOTE=gdrive:VitaScan/backups
   # RCLONE_CONFIG=/rclone/rclone.conf   # alapértelmezés, ritkán kell
   ```

6. Rebuild + restart:

   ```bash
   docker compose up -d --build db-tools
   ```

7. Admin → Adatbázis → **Mentés most**, majd ellenőrizd a Drive mappát. Az Overview kártyán megjelenik a „Google Drive” státusz.

Feltöltési hiba esetén a **lokális csomag megmarad**; a kézi mentés válaszában `driveUpload: failed` + hibaüzenet. A Drive-on nincs külön retention — csak a lokális `retentionDays` töröl.

Service account / Shared Drive nem az alapút; személyes My Drive-hoz az OAuth config a javasolt.

## Funkciók és biztonság

Az admin webfelület **Adatbázis** lapja az API `/admin/database/*` végpontjain keresztül hívja a db-tools-t.

A db-tools a `vitascan_media` volume-ot is látja (`RECIPE_STORAGE_DIR`, alapból `/data/vitascan/recipes`) — ugyanaz, mint az API.

### Mentés (`POST /backup`, ütemezett cron)

- `pg_dump -Fc` → `database.dump`, majd GNU `tar` csomag: `{manual|auto}-vitascan-<időbélyeg>.tar.gz`.
- A csomag tartalma: `database.dump` + `recipes/*.webp` (a `tmp/` feltöltési mappa nélkül).
- Ha a recepttár üres / nincs felcsatolva, a csomag csak a dumpot tartalmazza.
- Régi, csak-DB `.dump` fájlok továbbra is listázhatók és visszaállíthatók.

### Szelektív adatfrissítés (`POST /data-update`)

- `.tar.gz` / `.tgz` / `.tar`: kicsomagolás, dump merge, receptképek bemásolása.
- `.dump` / `.backup`: ideiglenes DB + `postgres_fdw` merge a célba.
- Preferált FK-sorrend (Prisma modellek): User → UserProfile → **NotificationPref** → **PushSubscription** → SystemSetting → RefreshToken → **DataShare** → **ShoppingList** → **ShoppingListItem** → **Recipe** → Food → FoodComponent → Vote → FoodFavorite → FoodEditLog → RecipeIngredient → RecipeImage → RecipeFavorite → AiRecipeImport → DailyLog → MealTemplate → MealTemplateItem → WaterLog → WeightLog → **FastSession** → DayNote → DailyAnalysis → AiFoodRecognition → BodyMeasurement* → **BodyFatLog** → **BodyFatGoal** → AiBodyAnalysis → WorkoutLog → DailyStepLog (egyéb közös táblák ABC-ben a végén).
- A Recipe a Food előtt van, mert `Food.preparedFromRecipeId` a Recipe-re mutat.
- A DataShare a User után van (owner + partner). A ShoppingListItem a ShoppingList után.
- A FastSession a User-re mutat (`onDelete: Cascade`); a WeightLog után jön, a többi user-naplóval.
- Merge előtt a dump oldali legacy **WaterLog** (`amountMl`) napi `totalMl` + `loggedDate` formára konvertálódik, ha kell.
- **UserProfile** új oszlopai (`showHomeWaterCard`, `showHomeStreakCard`, `showHomeFastingCard`, `fastingProtocol`, `fastingGoalMinutes`) és a **NotificationPref** böjt mezői (`fastingGoalEnabled`, `lastFastingGoalPushAt`) defaulttal mennek a cél sémában: régi dumpból csak a közös oszlopok jönnek át, a hiányzó mezők a Prisma defaultot kapják új soron.
- Csak **közös oszlopok** kerülnek át (séma-drift nem bontja el az importot).
- `INSERT … ON CONFLICT DO NOTHING` — meglévő PK / unique (pl. Food `barcode`, `externalId`) **nem frissül**.
- Hiányzó FK-jú sorok (pl. étel creator nélkül) kimaradnak; az import folytatódik.
- `_prisma_migrations` nem módosul.

### Teljes visszaállítás (`/restore`, `/restore-upload`)

- `.tar.gz`: `pg_restore --clean` a `database.dump`-ra, majd a `recipes/` fájlok másolása a `RECIPE_STORAGE_DIR`-be (felülírás, extra régi fájlok nem törlődnek).
- `.dump` / `.backup` / `.sql`: csak adatbázis (képek nélkül).
- Régi dump után a hiányzó újabb sémát a stack újraindítása / `prisma db push` pótolhatja; automatikus push a restore után nincs.

Részletek és curl példa a korábbi szekciókban maradtak – a **szolgáltatás neve** Docker DNS szerint: `db-tools` (nem kötelező a `vitascan_db_tools` konténernév).

## Biztonság

- Élesben állíts erős `DB_TOOLS_SECRET` értéket (ne hagyd a példa defaultot).
- A db-tools portja alapból csak localhost felől van publisholva (`127.0.0.1:3010`).
- Az `rclone.conf` / tokenek **ne kerüljenek** a gitbe (`rclone/.gitignore`).
