# Redox Server — Confirmed Bug Issue Drafts

**Audit date:** October 19, 2026  
**Scope:** Expiration, persistence, commands, RESP2 parsing/encoding, memory accounting, and shutdown  
**Status:** Drafts only; GitHub issues have not been created.

## Severity Summary

| Severity | Count |
|---|---:|
| High | 2 |
| Medium | 8 |
| Low | 1 |

## High

### SERVER-1. Snapshot restore resurrects TTLs after downtime

**Affected code:** `src/storage/persistence.ts` (`saveSnapshot`, `restoreSnapshot`)

**Impact:** A key whose TTL expires while the server is offline is restored with its full pre-shutdown remaining TTL, making expired data live again.

**Reproduction:** Save a snapshot while a key has a positive TTL, wait longer than that remaining TTL, then restore the snapshot. The snapshot records `savedAt`, but restore passes the saved `ttlMsRemaining` directly to `store.set()` or `store.pexpire()`.

**Expected:** Subtract snapshot downtime from each saved TTL and skip keys whose TTL elapsed before restore.

**Suggested fix:** Compute elapsed wall-clock time from `snapshot.savedAt`, subtract it from each defined TTL, and omit entries with no positive remaining TTL.

**Test gap:** `tests/unit/persistence.test.ts` restores immediately and does not cover downtime beyond the saved TTL.

### SERVER-2. Replacing a key can undercount memory after LRU eviction

**Affected code:** `src/storage/store.ts` (`set`, `ensureMemory`)

**Impact:** Under `allkeys-lru`, if `ensureMemory()` evicts the key being overwritten, it subtracts the old entry's bytes. `set()` then adds only the precomputed delta (`newBytes - oldBytes`), leaving `usedMemory` lower than the actual stored data size. Later writes may exceed the configured memory limit without triggering eviction or OOM.

**Reproduction:** Configure a small memory limit and `allkeys-lru`; set a key, then overwrite it with a much larger value so the old key is selected for eviction while reserving the delta. Compare `usedMemory` with the actual entry size, or attempt further writes against the limit.

**Expected:** Memory accounting after every successful mutation equals the sum of stored entry sizes, and configured limits remain enforced.

**Suggested fix:** Make replacement and eviction accounting consistent, for example by excluding the replaced key from eviction and handling its old allocation explicitly, or recomputing accounting after eviction.

**Test gap:** `tests/unit/memory-eviction.test.ts` tests insertion eviction but not overwriting an existing key that can itself be evicted.

## Medium

### SERVER-3. Active expiration repeatedly checks the same first 20 TTL keys

**Affected code:** `src/storage/store.ts` (`activeExpiryTick`)

**Impact:** The scan starts at the beginning of `Map` on every tick and stops after 20 entries with TTLs. If those first entries remain unexpired, later expired entries are never actively purged, allowing unreachable expired data to retain memory indefinitely.

**Reproduction:** Insert at least 21 TTL-bearing keys in order. Keep the first 20 unexpired and let a later key expire. Repeatedly call `activeExpiryTick()` or wait for its timer; the later key is not visited.

**Expected:** Repeated ticks make progress through the TTL-bearing keys so every expired key is eventually eligible for cleanup.

**Suggested fix:** Maintain a rotating cursor or dedicated TTL-key sampling structure instead of restarting the scan from the first map entry each tick.

**Test gap:** `tests/unit/ttl.test.ts` covers a small set and does not ensure progress beyond the first 20 TTL entries.

### SERVER-4. APPEND and integer mutations clear an existing TTL

**Affected code:** `src/commands/append.ts`, `src/commands/integer-utils.ts`, `src/storage/store.ts` (`set`)

**Impact:** `APPEND`, `INCR`, `INCRBY`, `DECR`, and `DECRBY` rewrite values without passing the existing TTL. `store.set()` treats omitted TTL as no expiration, so these commands convert expiring keys into permanent keys.

**Reproduction:** Set a key with a TTL, run one of the listed mutation commands, and inspect `PTTL`; the key no longer expires.

**Expected:** Mutations preserve the key's existing expiration time.

**Suggested fix:** Add an update operation that preserves `expiresAt`, or have mutation handlers retain and pass the remaining TTL without extending the expiration.

**Test gap:** Existing command tests verify value changes but not TTL preservation after mutation.

### SERVER-5. Shutdown can wait indefinitely for connected clients

**Affected code:** `src/server.ts` (`shutdown`)

**Impact:** `server.close()` stops new connections but waits for current sockets. A connected keep-alive client can prevent the callback and process exit indefinitely after a shutdown signal.

**Reproduction:** Keep a client socket connected, send SIGINT or SIGTERM to the server, and observe that the process remains alive awaiting socket closure.

**Expected:** Shutdown should finish within a bounded interval while persisting data and closing active client sockets.

**Suggested fix:** Track and close active sockets or use supported connection-closing APIs, with a bounded fallback timeout.

**Test gap:** No nearby server test covers shutdown while a client remains connected.

### SERVER-6. Expiration arguments accept numeric prefixes and decimals

**Affected code:** `src/commands/set.ts`, `src/commands/expire.ts`, `src/commands/pexpire.ts`

**Impact:** `parseInt()` accepts strings such as `10abc` or `10.5` as `10`, silently applying a different expiration than the client supplied instead of returning an integer-validation error.

**Reproduction:** Run `SET key value EX 10abc`, `EXPIRE key 10.5`, or `PEXPIRE key 10abc`.

**Expected:** Reject malformed integer arguments according to the command's integer syntax.

**Suggested fix:** Validate the entire argument before conversion and retain explicit range checks.

**Test gap:** Nearby command tests do not cover trailing non-numeric characters or decimal values.

### SERVER-7. MSET can partially apply before an OOM error

**Affected code:** `src/commands/mset.ts`; `src/storage/store.ts` (`set`, `ensureMemory`)

**Impact:** If a later pair exceeds the memory limit, earlier pairs remain written even though the command fails. The database is left in a partially updated state.

**Reproduction:** Configure `noeviction` with a small memory limit, then issue an `MSET` whose early pairs fit and a later pair exceeds the limit. The command errors, but earlier keys have changed.

**Expected:** `MSET` applies all pairs or none, consistent with its atomic command behavior.

**Suggested fix:** Validate/reserve the total memory impact before mutation or apply changes transactionally with rollback on failure.

**Test gap:** Memory tests cover rejected individual writes but not partial multi-key mutation.

### SERVER-8. RESP simple strings and errors allow CRLF injection

**Affected code:** `src/protocol/resp-encoder.ts` (`simpleString`, `error`)

**Impact:** Embedded carriage returns or newlines in a simple-string or error payload create extra RESP lines and can desynchronize the client parser. Dynamic error text can include user-controlled command content.

**Reproduction:** Encode an error or simple string containing `\r\n` and observe that the emitted bytes contain a second protocol line.

**Expected:** Simple-string and error payloads must not be able to inject RESP line delimiters.

**Suggested fix:** Reject or normalize CR and LF before encoding these line-based RESP types; add encoder and command-path regression tests.

**Test gap:** `tests/unit/resp-encoder.test.ts` uses payloads without embedded CRLF.

### SERVER-9. Glob conversion permits expensive regex backtracking

**Affected code:** `src/storage/pattern.ts` (`globToRegExp`); `src/storage/store.ts` (pattern matching)

**Impact:** User-provided wildcard patterns are translated to regexes containing unbounded `.*` segments and tested against keys. Adversarial patterns and near-matching keys can cause excessive regex backtracking on the server's event loop.

**Reproduction:** On a test-only isolated process, match a long pattern with repeated wildcard/literal segments against a long near-matching key and measure execution time. Do not run an unbounded adversarial input against a shared or production server.

**Expected:** Pattern matching should have bounded work proportional to pattern and key length.

**Suggested fix:** Replace regex translation with a bounded glob matcher, or enforce defensible pattern/key limits and add adversarial performance tests.

**Test gap:** `tests/unit` pattern coverage does not establish a runtime bound for adversarial patterns.

### SERVER-10. DBSIZE traverses every key to remove expired entries

**Affected code:** `src/commands/dbsize.ts`; `src/storage/store.ts` (`size`)

**Impact:** `DBSIZE` performs a full keyspace traversal and expiration check, blocking the event loop as the database grows instead of returning a constant-time count.

**Reproduction:** Populate a large keyspace and call `DBSIZE`; `store.size()` iterates through keys to check expiration before returning the count.

**Expected:** `DBSIZE` should return promptly without synchronously sweeping the entire keyspace.

**Suggested fix:** Maintain an appropriate live-key count or rely on passive/active expiry cleanup while ensuring the returned count follows documented semantics.

**Test gap:** Command tests check small key counts only; no scale or latency test covers `DBSIZE`.

## Low

### SERVER-11. RESP parser accepts malformed integer fields with trailing text

**Affected code:** `src/protocol/resp-parser.ts` (array count and bulk length parsing)

**Impact:** `parseInt()` accepts numeric prefixes such as `*1junk` and `$2junk`, so malformed RESP headers may be accepted as valid frames rather than rejected as protocol errors.

**Reproduction:** Feed the parser an array header like `*1junk\r\n` followed by one valid element, or a bulk header like `$2junk\r\nhi\r\n`.

**Expected:** Reject headers unless the entire length field matches the protocol's integer grammar.

**Suggested fix:** Validate the complete header field before converting it and add parser tests for numeric prefixes with trailing characters.

**Test gap:** `tests/unit/resp-parser.test.ts` checks wholly alphabetic invalid lengths but not numeric prefixes with trailing text.

## Excluded Leads

- Invalid snapshot JSON does not currently crash the server process: startup catches and logs restore errors, then continues listening. Recovery behavior may deserve separate work, but the earlier crash claim is incorrect.