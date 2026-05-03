# PG_MAJOR: postgresql${PG_MAJOR}-client (pg_dump / pg_restore).
# Szerver vs. kliens: régebbi szerver + új SET → csökkentsd PG_MAJOR-ot. Újabb .dump formátum → növeld PG_MAJOR-ot.
FROM node:20-alpine

ARG PG_MAJOR=17
RUN apk add --no-cache bash postgresql${PG_MAJOR}-client

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3010

CMD ["node", "src/server.mjs"]
