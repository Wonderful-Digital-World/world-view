FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile \
	&& pnpm --filter @wonderful-digital-world/world-view build

FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app ./

WORKDIR /app/website
EXPOSE 3000
CMD ["pnpm", "start"]
