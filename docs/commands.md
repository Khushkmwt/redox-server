# Redox Command Reference

Full specification of all 19 Redis-compatible commands implemented in `redox-server`.

---

## Index of Commands

- [PING](#ping)
- [ECHO](#echo)
- [SET](#set)
- [GET](#get)
- [DEL](#del)
- [EXISTS](#exists)
- [TYPE](#type)
- [DBSIZE](#dbsize)
- [FLUSHALL](#flushall)
- [APPEND](#append)
- [STRLEN](#strlen)
- [INCR](#incr)
- [INCRBY](#incrby)
- [DECR](#decr)
- [DECRBY](#decrby)
- [MSET](#mset)
- [MGET](#mget)
- [KEYS](#keys)
- [COMMAND](#command)
- [INFO](#info)
- [HSET](#hset)
- [HGET](#hget)
- [HMGET](#hmget)
- [HDEL](#hdel)
- [HEXISTS](#hexists)
- [HLEN](#hlen)
- [HGETALL](#hgetall)
- [HKEYS](#hkeys)
- [HVALS](#hvals)

---

### PING
- **Syntax**: `PING [message]`
- **Description**: Tests server connectivity.
- **Returns**: `+PONG` if no message is provided, or the bulk string message if provided.
- **Examples**:
  ```
  PING -> +PONG
  PING "hello world" -> "hello world"
  ```

### ECHO
- **Syntax**: `ECHO message`
- **Description**: Echoes the provided message back as a bulk string.
- **Returns**: Bulk string.

### SET
- **Syntax**: `SET key value`
- **Description**: Sets `key` to hold the string `value`. If `key` already holds a value, it is overwritten.
- **Returns**: Simple string `+OK`.

### GET
- **Syntax**: `GET key`
- **Description**: Retrieves the value of `key`.
- **Returns**: Bulk string value if key exists, or `nil` (`$-1\r\n`) if key does not exist.

### DEL
- **Syntax**: `DEL key [key ...]`
- **Description**: Removes the specified keys.
- **Returns**: Integer count of keys that were removed.

### EXISTS
- **Syntax**: `EXISTS key [key ...]`
- **Description**: Checks how many of the specified keys exist in the store.
- **Returns**: Integer count of existing keys.

### TYPE
- **Syntax**: `TYPE key`
- **Description**: Returns the type of the value stored at `key`.
- **Returns**: Simple string `+string` if key exists, or `+none` if key does not exist.

### DBSIZE
- **Syntax**: `DBSIZE`
- **Description**: Returns the total number of keys in the current store.
- **Returns**: Integer count.

### FLUSHALL
- **Syntax**: `FLUSHALL`
- **Description**: Deletes all keys from the database.
- **Returns**: Simple string `+OK`.

### APPEND
- **Syntax**: `APPEND key value`
- **Description**: If `key` already exists, appends `value` to the end of the existing string. If `key` does not exist, it is created and set to `value`.
- **Returns**: Integer total byte length of the value after append.

### STRLEN
- **Syntax**: `STRLEN key`
- **Description**: Returns the byte length of the string value stored at `key`.
- **Returns**: Integer length, or `0` if the key does not exist.

### INCR
- **Syntax**: `INCR key`
- **Description**: Increments the number stored at `key` by one. If the key does not exist, it is set to `0` before performing the operation.
- **Returns**: Integer value after increment.
- **Errors**: Returns `-ERR value is not an integer or out of range` if value is non-numeric.

### INCRBY
- **Syntax**: `INCRBY key increment`
- **Description**: Increments the number stored at `key` by `increment`.
- **Returns**: Integer value after increment.

### DECR
- **Syntax**: `DECR key`
- **Description**: Decrements the number stored at `key` by one.
- **Returns**: Integer value after decrement.

### DECRBY
- **Syntax**: `DECRBY key decrement`
- **Description**: Decrements the number stored at `key` by `decrement`.
- **Returns**: Integer value after decrement.

### MSET
- **Syntax**: `MSET key value [key value ...]`
- **Description**: Sets the given keys to their respective values. Operates atomically.
- **Returns**: Simple string `+OK`.
- **Errors**: Returns error if arguments count is odd or zero.

### MGET
- **Syntax**: `MGET key [key ...]`
- **Description**: Returns the values of all specified keys in the same order as requested.
- **Returns**: RESP2 Array containing bulk strings or `nil` values.

### KEYS
- **Syntax**: `KEYS pattern`
- **Description**: Returns all keys matching `pattern`.
  - `*` matches all keys.
  - `?` matches any single character.
  - `[abc]` matches specified characters.
- **Returns**: RESP2 Array of bulk strings.

### COMMAND
- **Syntax**: `COMMAND [COUNT | DOCS]`
- **Description**: Returns details about supported commands for Redis client probes.
- **Returns**:
  - `COMMAND`: Array of command names.
  - `COMMAND COUNT`: Total integer count of supported commands.
  - `COMMAND DOCS`: Empty array reply.

### INFO
- **Syntax**: `INFO [section]`
- **Description**: Returns memory usage, maxmemory settings, eviction policy, and key metrics.
- **Returns**: Bulk string formatted with Redis-compatible `# Memory` fields.

### HSET
- **Syntax**: `HSET key field value [field value ...]`
- **Description**: Sets the specified fields to their respective values in the hash stored at key.
- **Returns**: Integer count of fields that were added.

### HGET
- **Syntax**: `HGET key field`
- **Description**: Returns the value associated with field in the hash stored at key.
- **Returns**: Bulk string value, or `nil` (`$-1\r\n`) if field or key does not exist.

### HMGET
- **Syntax**: `HMGET key field [field ...]`
- **Description**: Returns the values associated with the specified fields in the hash stored at key.
- **Returns**: RESP2 Array of bulk strings or nulls.

### HDEL
- **Syntax**: `HDEL key field [field ...]`
- **Description**: Removes the specified fields from the hash stored at key. If the hash becomes empty, the key is removed.
- **Returns**: Integer count of fields that were removed.

### HEXISTS
- **Syntax**: `HEXISTS key field`
- **Description**: Returns whether field exists in the hash stored at key.
- **Returns**: `:1` if field exists, `:0` otherwise.

### HLEN
- **Syntax**: `HLEN key`
- **Description**: Returns the number of fields contained in the hash stored at key.
- **Returns**: Integer count.

### HGETALL
- **Syntax**: `HGETALL key`
- **Description**: Returns all fields and values of the hash stored at key.
- **Returns**: RESP2 Array of field-value pairs (`[f1, v1, f2, v2, ...]`).

### HKEYS
- **Syntax**: `HKEYS key`
- **Description**: Returns all field names in the hash stored at key.
- **Returns**: RESP2 Array of field names.

### HVALS
- **Syntax**: `HVALS key`
- **Description**: Returns all values in the hash stored at key.
- **Returns**: RESP2 Array of field values.

