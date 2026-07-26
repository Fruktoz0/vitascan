# VitaScan PWA: build + vite preview
FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Böngészőből elérhető API bázis (build-time). Same-origin: /api → preview proxy → api konténer
ARG VITE_API_URL=/api
ARG VITE_PROXY_TARGET=http://api:3005
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PROXY_TARGET=$VITE_PROXY_TARGET

RUN npm run build

EXPOSE 4173

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4173"]
