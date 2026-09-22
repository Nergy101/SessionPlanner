# syntax=docker/dockerfile:1

FROM denoland/deno:2.9.6 AS build

WORKDIR /app

COPY deno.json deno.lock ./
COPY assets ./assets
COPY components ./components
COPY db ./db
COPY islands ./islands
COPY routes ./routes
COPY services ./services
COPY static ./static
COPY *.ts ./
COPY vite.config.ts ./

RUN deno install --entrypoint deno.json
RUN deno task build

FROM denoland/deno:2.9.6

WORKDIR /app

ENV PORT=8000 \
    DB_PATH=/data/session-planner.db

COPY --from=build /app/deno.json /app/deno.lock ./
COPY --from=build /app/db ./db
COPY --from=build /app/_fresh ./_fresh

RUN mkdir -p /data && chown -R deno:deno /app /data
USER deno

VOLUME ["/data"]
EXPOSE 8000

CMD ["deno", "task", "start"]
