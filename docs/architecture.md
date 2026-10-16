# Redox Server Architecture

This document describes the internal design and data flow of `redox-server`.

---

## High-Level Overview

Redox is a single-threaded (event-driven), in-memory key-value store communicating over TCP using Redis Serialization Protocol 2 (RESP2).

```
                      ┌─────────────────────────────────────────┐
                      │               TCP Client                │
                      │        (redis-cli / redox-cli)          │
                      └────────────────────┬────────────────────┘
                                           │  Raw RESP2 Bytes
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │        Node.js net.Server               │
                      │         (src/server.ts)                 │
                      │  - Connection concurrency guard         │
                      │  - Idle connection timeout              │
                      │  - Structured logging                   │
                      └────────────────────┬────────────────────┘
                                           │  Chunk Buffer
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │              RespParser                 │
                      │    (src/protocol/resp-parser.ts)        │
                      │  - Incremental state machine            │
                      │  - Handles fragmentation & pipelining   │
                      └────────────────────┬────────────────────┘
                                           │  Parsed string[] args
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │          Command Dispatcher             │
                      │       (src/commands/index.ts)           │
                      │  - Case-insensitive lookup              │
                      │  - Argument count & type validation     │
                      └──────────┬───────────────────▲──────────┘
                                 │                   │
         Read / Write Operations │                   │ Response Buffer
                                 ▼                   │
                      ┌──────────────────────┐       │
                      │     Store Singleton  │       │
                      │(src/storage/store.ts)│       │
                      │  - Map<string, Entry>│       │
                      │  - Glob pattern match│       │
                      └──────────────────────┘       │
                                                     │
                      ┌──────────────────────────────┴──────────┐
                      │              RespEncoder                │
                      │    (src/protocol/resp-encoder.ts)       │
                      │  - Encodes strings, errors, ints, arrays│
                      └─────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. TCP Server & Lifecycle (`src/server.ts`)
- Implemented with Node's native `node:net` module.
- Each incoming connection is assigned its own `RespParser` instance to preserve per-connection framing state across TCP chunks.
- **Connection Guard**: `MAX_CONNECTIONS` limit rejects connections with an explicit `-ERR max number of clients reached` when the active pool is saturated.
- **Idle Timeout**: Connections can be configured with an inactivity timeout (`TIMEOUT`) in seconds.
- **Structured Logging**: Emits timestamped, leveled logs (`DEBUG`, `INFO`, `WARN`, `ERROR`).

### 2. RESP2 Parser (`src/protocol/resp-parser.ts`)
- Operates as an incremental 3-state state machine:
  1. `ARRAY_HEADER`: Expects `*<count>\r\n`.
  2. `BULK_HEADER`: Expects `$<length>\r\n`.
  3. `BULK_DATA`: Reads exactly `<length>` raw payload bytes followed by `\r\n`.
- Handles **TCP fragmentation** (partial packet buffers retained in memory until next chunk arrives) and **pipelining** (multiple commands received in a single TCP read).

### 3. Command Dispatcher (`src/commands/index.ts`)
- Normalizes command names to uppercase (`args[0].toUpperCase()`).
- Looks up the registered handler function from a handler map.
- Catches errors and formats them into RESP2 protocol error replies (`-ERR ...`).
- Guarantees server stability — exceptions never crash the TCP server socket.

### 4. Storage Engine (`src/storage/store.ts`)
- In-memory `Map<string, Entry>` singleton shared across all TCP connections.
- Provides synchronous O(1) operations for `get`, `set`, `del`, `exists`, `type`, and `size`.
- Implements glob pattern matching (`*`, `?`, `[abc]`) for `KEYS` queries.

### 5. RESP2 Encoder (`src/protocol/resp-encoder.ts`)
- Converts JavaScript primitives and data structures into valid RESP2 binary buffers:
  - Simple Strings: `+OK\r\n`
  - Errors: `-ERR message\r\n`
  - Integers: `:123\r\n`
  - Bulk Strings: `$5\r\nhello\r\n`
  - Null Bulk Strings: `$-1\r\n`
  - Arrays: `*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n`
- All length prefixes use byte-accurate calculations (`Buffer.byteLength`).
