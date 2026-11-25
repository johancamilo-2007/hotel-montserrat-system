# =============================================================================
# HOTEL MONTSERRAT S.A.S. - DOCKERFILE MULTI-STAGE SEGURO (NODE.JS 20 LTS)
# Principio de mínimo privilegio: Usuario no-root (node), sin dependencias dev
# =============================================================================

FROM node:20-alpine AS base

# Crear directorio de trabajo
WORKDIR /app

# Copiar manifiestos
COPY package.json ./
COPY backend/package.json ./backend/

# Copiar código fuente
COPY js ./js
COPY css ./css
COPY index.html ./
COPY hotel_montserrat_db.sql ./
COPY backend ./backend

# Establecer usuario sin privilegios para ejecución en producción
USER node

EXPOSE 4000

ENV NODE_ENV=production

# Ejecutar el servidor backend seguro
CMD ["node", "backend/src/server.js"]
