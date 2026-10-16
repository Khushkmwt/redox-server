# redox-server

A Redis-inspired, in-memory key-value database server built from first principles in TypeScript.

Clients connect over TCP and communicate using the **RESP2** wire protocol — the same protocol used by Redis. This is an educational and portfolio project; it is **not** a production replacement for Redis.

---

## Requirements

- Node.js >= 18 (Node 22 or 24 recommended)
- npm >= 9
- (Optional) Docker & Docker Compose

---

## Documentation

Comprehensive documentation is available in the [`docs/`](./docs) directory:

- [**Architecture Guide**](./docs/architecture.md) — System components, connection lifecycle, and parser state machine.
- [**Command Reference**](./docs/commands.md) — Full specification for all 19 supported commands with examples.
- [**RESP2 Protocol**](./docs/protocol.md) — Wire-level protocol details, framing, and types.
- [**Configuration Guide**](./docs/configuration.md) — Environment variables, local setup, and Docker deployment.

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
| `MAX_MEMORY` | `0` | Max memory cap (e.g. `64mb`, `500kb`; `0` disables cap) |
| `EVICTION_POLICY` | `noeviction` | Eviction behavior when memory cap reached (`noeviction`, `allkeys-lru`) |
| `DUMP_PATH` | `data/dump.json` | Snapshot persistence file location |

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

### 1. Using Redox CLI (`redox-cli`)
The dedicated, themed interactive client for Redox:

```bash
# From the redox-cli directory
npm start -- -p 6379

# Or globally if linked via `npm link`
redox-cli -p 6379
```

### 2. Using standard Redis CLI (`redis-cli`)
Redox speaks standard RESP2, so official Redis tools work out of the box:

```bash
redis-cli -h 127.0.0.1 -p 6379
```

### 3. Using raw TCP (`nc`)
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
| `SET key value [EX s] [PX ms]` | Store a string key-value pair with optional TTL | `+OK` |
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

### Hashes
| Command | Description | Response |
|---|---|---|
| `HSET key field value [f v ...]` | Set fields on a hash | Integer count of added fields |
| `HGET key field` | Get value of a hash field | Bulk string or null |
| `HMGET key field [field ...]` | Get multiple field values in order | Array of bulk strings/nulls |
| `HDEL key field [field ...]` | Delete fields from a hash | Integer count removed |
| `HEXISTS key field` | Check if field exists in hash | Integer (`1` or `0`) |
| `HLEN key` | Total count of fields in hash | Integer |
| `HGETALL key` | Return all field-value pairs | Array `[f1, v1, f2, v2, ...]` |
| `HKEYS key` | List all field names in hash | Array of bulk strings |
| `HVALS key` | List all values in hash | Array of bulk strings |

### Key Expiration & TTL
| Command | Description | Response |
|---|---|---|
| `EXPIRE key seconds` | Set timeout on key in seconds | Integer (`1` if set, `0` if missing) |
| `PEXPIRE key milliseconds` | Set timeout on key in milliseconds | Integer (`1` if set, `0` if missing) |
| `TTL key` | Return remaining TTL in seconds (`-1` none, `-2` missing) | Integer |
| `PTTL key` | Return remaining TTL in milliseconds | Integer |
| `PERSIST key` | Remove timeout from key | Integer (`1` if removed, `0` if none) |

### Server & Meta
| Command | Description | Response |
|---|---|---|
| `INFO [section]` | Report memory metrics and server diagnostics | Bulk string |
| `COMMAND` | List all supported commands | Array of bulk strings |
| `COMMAND COUNT` | Total number of commands | Integer count |
| `COMMAND DOCS` | Return empty docs array for client probes | Array |
| `SAVE` | Persist snapshot of in-memory store to disk | `+OK` |

Command names are **case-insensitive**.

---

## Running tests & benchmark

```bash
# Run full Vitest suite (134+ tests including unit, integration & stress)
npm test

# Run tests in watch mode
npm run test:watch

# Run coverage report
npm run test:coverage

# Run high-performance sequential latency & pipelined throughput benchmark
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
