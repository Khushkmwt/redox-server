# Redox Configuration Guide

This guide describes how to configure `redox-server` for local development, testing, and production container environments.

---

## Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `HOST` | string | `127.0.0.1` | IP address or hostname to bind to. In Docker, this is set to `0.0.0.0`. |
| `PORT` | number | `6379` | TCP port to listen on. |
| `MAX_CONNECTIONS` | number | `100` | Maximum number of simultaneous connected TCP clients. |
| `TIMEOUT` | number | `0` | Inactivity timeout in seconds. `0` disables timeout. |
| `LOG_LEVEL` | string | `INFO` | Logging level: `DEBUG`, `INFO`, `WARN`, `ERROR`, or `SILENT`. |

---

## Local Development (.env)

You can place a `.env` file in the root of `redox-server`:

```env
PORT=7865
HOST=127.0.0.1
LOG_LEVEL=DEBUG
MAX_CONNECTIONS=50
TIMEOUT=120
```

When running `npm run dev`, Node's `--env-file=.env` automatically applies these settings.

---

## Docker Deployment

`redox-server` includes a production multi-stage `Dockerfile` and `docker-compose.yml`.

### Running with Docker Compose:
```bash
docker compose up -d
```

### TCP Healthcheck:
The Compose setup includes an automated TCP healthcheck that connects on port 6379, executes `PING`, expects `+PONG\r\n`, and reports container health status.
