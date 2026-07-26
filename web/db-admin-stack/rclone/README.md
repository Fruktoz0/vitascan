# rclone konfiguráció (Google Drive)

Ebbe a mappába kerül a hoston létrehozott `rclone.conf` (és esetleges token fájlok).
**Ne commitold** — a `.gitignore` kizárja őket.

## Gyors setup

1. Telepítsd az [rclone](https://rclone.org/install/)-t a gépedre.
2. Futtasd: `rclone config` → új remote neve pl. `gdrive`, típus: Google Drive (OAuth).
3. Másold ide a configot, pl. Windows-on:

   ```text
   %APPDATA%\rclone\rclone.conf  →  web/db-admin-stack/rclone/rclone.conf
   ```

4. A Drive-on hozd létre a célmappát (pl. `VitaScan/backups`).
5. A gyökér `.env`-ben:

   ```env
   RCLONE_UPLOAD_ENABLED=true
   RCLONE_REMOTE=gdrive:VitaScan/backups
   ```

6. Rebuild: `docker compose up -d --build db-tools`

Részletek: [../README.md](../README.md).
