# redox-server

A Redis-inspired, in-memory key-value database server built from first principles in TypeScript.

Clients connect over TCP and communicate using the **RESP2** wire protocol — the same protocol used by Redis. This is an educational and portfolio project; it is **not** a production replacement for Redis.

---

## Requirements

- Node.js >= 18 (Node 22 or 24 recommended)
- npm >= 9
- (Optional) Docker & Docker Compose

---

## Installation

```bash
git clone <repo-url>
cd redox-server
npm install
```

---

## Running the server

```bash
# Development (tsx with .env file support)
npm run dev

# Production build and run
npm run build
npm start
```

The server listens on `127.0.0.1:6379` by default (or configured `PORT` in `.env`).

---

## Configuration

Configure using environment variables or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Network interface to bind to (`0.0.0.0` in Docker) |
| `PORT` | `6379` | TCP port to listen on |
| `MAX_CONNECTIONS` | `100` | Maximum simultaneous client connections |
| `TIMEOUT` | `0` | Idle connection timeout in seconds (`0` disables) |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT`) |

---

## Running with Docker

```bash
# Run with Docker Compose (includes built-in TCP healthcheck)
docker compose up -d

# Check logs
docker compose logs -f

# Stop container
docker compose down
```

---

## Connecting

Any RESP2-compatible client works. Connect using `redis-cli`:

```bash
redis-cli -h 127.0.0.1 -p 6379
```

Or connect with raw TCP tools like `nc`:

```bash
nc 127.0.0.1 6379
```

---

## Supported commands

### Core & Inspection
| Command | Description | Response |
|---|---|---|
| `PING [message]` | Health check | `+PONG` or bulk string |
| `ECHO message` | Echo back input message | Bulk string |
| `TYPE key` | Return data type of key | `string` or `none` |
| `EXISTS key [key ...]` | Count keys that exist | Integer |
| `DBSIZE` | Return total number of keys stored | Integer |
| `FLUSHALL` | Delete all keys from keyspace | `+OK` |

### String Operations
| Command | Description | Response |
|---|---|---|
| `SET key value` | Store a string key-value pair | `+OK` |
| `GET key` | Retrieve value for key | Bulk string or null |
| `APPEND key value` | Append value to key | New byte length (integer) |
| `STRLEN key` | Get byte length of stored value | Integer length (0 if missing) |
| `DEL key [key ...]` | Delete one or more keys | Integer count removed |

### Numeric / Counters
| Command | Description | Response |
|---|---|---|
| `INCR key` | Increment 64-bit integer value by 1 | Integer |
| `INCRBY key increment` | Increment by specified integer | Integer |
| `DECR key` | Decrement integer value by 1 | Integer |
| `DECRBY key decrement` | Decrement by specified integer | Integer |

### Multi-Key & Keyspace
| Command | Description | Response |
|---|---|---|
| `MSET key value [key value ...]` | Set multiple keys atomically | `+OK` |
| `MGET key [key ...]` | Get multiple values in order | Array of bulk strings/nulls |
| `KEYS pattern` | Match keys using glob pattern (`*`, `?`, `[abc]`) | Array of bulk strings |

### Server & Meta
| Command | Description | Response |
|---|---|---|
| `COMMAND` | List all supported commands | Array of bulk strings |
| `COMMAND COUNT` | Total number of commands | Integer count |
| `COMMAND DOCS` | Return empty docs array for client probes | Array |

Command names are **case-insensitive**.

---

## Running tests & benchmark

```bash
# Run full Vitest suite (105+ tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run coverage report
npm run test:coverage

# Run sequential throughput benchmark (server must be running)
npm run benchmark
```

---

## Architecture

```
TCP Client (redis-cli / redox-cli)
   │
   ▼
TCP Server  (src/server.ts)  ← Connection pool guard, idle timeout, structured logger
   │
   ▼
Per-connection byte buffer
   │
   ▼
RESP2 Parser  (src/protocol/resp-parser.ts)  ← State machine (Array → BulkLen → BulkData)
   │
   ▼
Command Dispatcher  (src/commands/index.ts)  ← Case normalization, argument validation
   │
   ▼
In-memory Store  (src/storage/store.ts)      ← Map-based string storage & pattern matching
   │
   ▼
RESP2 Encoder  (src/protocol/resp-encoder.ts)
   │
   ▼
TCP Client
```

---

## Known limitations

- **In-memory only** — no snapshot/AOF persistence.
- **String values only** — no lists, sets, hashes, or sorted sets.
- **No TTL / expiration** (planned for future milestone).
- **No authentication or TLS**.

---

## License

ISC
