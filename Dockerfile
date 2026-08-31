# Сборка и запуск в одном образе: сервер кастомный и стартует через tsx,
# поэтому нужен исходник, а не только .next.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall дёргает prisma generate — схема уже на месте.
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
# Разовые скрипты обслуживания базы запускаются в этом же контейнере, значит
# должны в него попасть. Без этого db:rename-questions падает на боевом с
# «Cannot find module», а следом сид заливает пул повторно.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

# Миграции накатываются отдельной командой при деплое, а не на старте:
# иначе два инстанса подерутся за одну миграцию.
CMD ["node", "--import", "tsx", "server.ts"]
