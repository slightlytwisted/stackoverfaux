# Build
FROM node:22-alpine AS build
WORKDIR /build

COPY .prettierrc .prettierignore ./
COPY eslint.config.mjs ./
COPY package.json package-lock.json ./
COPY tsconfig.json ./  
COPY src/*.ts /build/src/
RUN npm install
RUN npm run build

# Stackoverfaux
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /build/dist/*.js ./
RUN npm install --omit=dev
ENTRYPOINT ["node", "server.js"]
