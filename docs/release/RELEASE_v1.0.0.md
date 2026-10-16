# Redox Server v1.0.0 Release Notes

> **Release Version:** `v1.0.0`  
> **Release Date:** October 17, 2026  
> **Target:** In-Memory Redis-Compatible Database Server  
> **Protocol:** RESP2 (REdis Serialization Protocol v2)  

---

## 🌟 Overview

Redox Server `v1.0.0` marks the first official major release of Redox, a Redis-compatible in-memory database server built from first principles in TypeScript. 

This release delivers full disk persistence, atomic snapshotting, LRU memory management, active/lazy key expiration, a complete Hash data type, comprehensive server diagnostics, high-concurrency stress testing, and sub-10 microsecond pipelined performance reaching **over 170,000 ops/second**.

---

## 🚀 Key Features & Highlights

### 1. Disk Durability & Snapshot Persistence
- **Atomic Point-in-Time Snapshots**: Serializes store state to temporary files (`dump.json.tmp.<ts>`) and commits via atomic file rename (`fs.renameSync`) to eliminate file corruption.
- **`SAVE` Command**: Synchronously dumps strings, hashes, and remaining TTL offsets to disk.
- **`LASTSAVE` Command**: Returns the UNIX timestamp (seconds) of the most recent snapshot.
- **Lifecycle Integration**:
  - Automatically loads and hydrates keyspace from `data/dump.json` (or `$DUMP_PATH`) on startup.
  - Automatically triggers a snapshot save on graceful termination (`SIGINT` / `SIGTERM`).
- **Docker Volume Support**: Dedicated Docker named volume (`redox-data:/app/data`) persists data across container lifecycles with non-root security.

### 2. Memory Governance & Eviction Policies
- **Configurable Memory Cap (`MAX_MEMORY`)**: Byte-level memory budgeting supporting human units (e.g. `64mb`, `500kb`).
- **Eviction Policies (`EVICTION_POLICY`)**:
  - `noeviction` (default): Rejects write commands with `OOM command not allowed when used memory > 'maxmemory'`.
  - `allkeys-lru`: Automatically evicts least recently accessed keys to reclaim memory when cap is exceeded.
- **Accurate Memory Accounting**: Tracks per-entry key/value byte overhead across Strings and Hashes.

### 3. Key Expiration & TTL Engine
- **Atomic Expiration on Write**: `SET key value [EX seconds] [PX milliseconds]`.
- **TTL Inspection & Management**: `EXPIRE`, `PEXPIRE`, `TTL`, `PTTL`, and `PERSIST`.
- **Hybrid Sweep Architecture**:
  - **Lazy (Passive) Expiration**: Purges stale keys upon read/lookup access.
  - **Active Background Sweep**: Sample-based 100ms interval timer sweeps expired keys in the background like Redis.

### 4. Native Hash Data Structure
- Full suite of 9 hash operations:
  - Writes: `HSET`, `HDEL`
  - Reads: `HGET`, `HMGET`, `HEXISTS`, `HLEN`, `HGETALL`, `HKEYS`, `HVALS`
- Strict type-safety with Redis `WRONGTYPE Operation against a key holding the wrong kind of value` errors.

### 5. Diagnostics & Server Telemetry
- **Expanded `INFO` Sections**:
  - `# Server`: Reports `redox_version:1.0.0`, `uptime_in_seconds`, `process_id`, `tcp_port`.
  - `# Memory`: Reports `used_memory`, human bytes, `maxmemory`, eviction policy, `evicted_keys`, `expired_keys`.
  - `# Persistence`: Reports `loading:0`, `rdb_last_save_time`, `rdb_last_bgsave_status`.
  - `# Stats`: Reports `total_connections_received`, `total_commands_processed`.
- Supports granular querying: `INFO`, `INFO server`, `INFO memory`, `INFO persistence`, `INFO stats`.

### 6. High Concurrency & Low Latency
- **Socket Optimization**: Enabled `TCP_NODELAY` across all accepted sockets to disable Nagle's algorithm and eliminate the 40ms delayed-ACK penalty.
- **Stress & Fuzz Tested**: Verified under 50 simultaneous TCP connections firing 10,000+ mixed concurrent operations and concurrent memory pressure with 100% valid RESP2 framing and 0 crashes.
- **Benchmark Throughput**:
  - Sequential single-flight latency: **25–45 µs per operation**
  - Pipelined batch throughput (100 ops/write): **100,000 to 170,000+ ops/sec**

---

## 📊 Complete Supported Command Matrix (36 Commands)

| Category | Commands |
|---|---|
| **Core & Inspection** | `PING`, `ECHO`, `TYPE`, `EXISTS`, `DBSIZE`, `FLUSHALL` |
| **String Operations** | `SET`, `GET`, `APPEND`, `STRLEN`, `DEL` |
| **Numeric Counters** | `INCR`, `INCRBY`, `DECR`, `DECRBY` |
| **Multi-Key & Search** | `MSET`, `MGET`, `KEYS` |
| **Hashes** | `HSET`, `HGET`, `HMGET`, `HDEL`, `HEXISTS`, `HLEN`, `HGETALL`, `HKEYS`, `HVALS` |
| **Key Expiration & TTL** | `EXPIRE`, `PEXPIRE`, `TTL`, `PTTL`, `PERSIST` |
| **Persistence & Snapshot** | `SAVE`, `LASTSAVE` |
| **Server & Diagnostics** | `INFO`, `COMMAND`, `COMMAND COUNT`, `COMMAND DOCS` |

---

## ⚡ Performance Verification

Benchmark measured on local loopback TCP connection (`127.0.0.1:18379`):

| Command | Mode | Batch Size | Latency | Throughput |
|---|---|---|---|---|
| `PING` | Pipelined | 100 | **6 µs** | **170,213 ops/s** |
| `GET` | Pipelined | 100 | **6 µs** | **159,912 ops/s** |
| `INCR` | Pipelined | 100 | **6 µs** | **155,726 ops/s** |
| `DEL` | Pipelined | 100 | **9 µs** | **117,575 ops/s** |
| `SET` | Pipelined | 100 | **9 µs** | **110,907 ops/s** |
| `EXPIRE` | Pipelined | 100 | **9 µs** | **109,216 ops/s** |
| `HGET` | Pipelined | 100 | **10 µs** | **101,725 ops/s** |
| `HSET` | Pipelined | 100 | **13 µs** | **78,232 ops/s** |

---

## 🧪 Automated Test Suite

- **Test Framework**: Vitest v5
- **Test Files**: 14 test suites
- **Total Tests**: **140 / 140 passing (100%)**
- **Test Coverage**:
  - Unit: RESP2 Encoder/Decoder, Logger, Store, Memory Eviction, TTL, Hashes, Persistence, All Commands
  - Integration: End-to-end TCP server, pipelining, client concurrency, error handling
  - Stress: 50 client concurrency, 10,000+ operations fuzz test, concurrent LRU flooding

---

## 🐳 Docker Deployment

Run with Docker Compose:
```bash
docker compose up -d
```
Container includes:
- Automated TCP health check (`PING` -> `+PONG`)
- Non-root user execution (`redox:redox`)
- Volume persistence (`redox-data:/app/data`)

---

## 📦 Getting Started

```bash
# Clone and install
cd redox-server
npm install

# Build production bundle
npm run build

# Start server
npm start
```
Connect via `redox-cli` or official `redis-cli`:
```bash
redis-cli -p 6379 PING
# +PONG
```
