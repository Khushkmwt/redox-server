# RESP2 Protocol in Redox

Redox communicates using **RESP2 (REdis Serialization Protocol 2)** over raw TCP sockets. All data frames terminate with `\r\n` (CRLF).

---

## Data Types Supported

### 1. Simple Strings (`+`)
Used for basic status replies like `+OK\r\n` or `+PONG\r\n`.
```
+OK\r\n
```

### 2. Errors (`-`)
Used for command errors and protocol violations.
```
-ERR unknown command 'FOO'\r\n
-ERR value is not an integer or out of range\r\n
```

### 3. Integers (`:`)
Used for numeric counts, lengths, and increment results.
```
:42\r\n
:-1\r\n
```

### 4. Bulk Strings (`$`)
Used for binary-safe strings. The length is prefixed by `$`, followed by CRLF, the payload, and CRLF.
```
$5\r\n
hello\r\n
```
For a non-existent or null value, a null bulk string is sent:
```
$-1\r\n
```

### 5. Arrays (`*`)
Used for client requests and multi-value responses (e.g. `MGET`, `KEYS`, `COMMAND`).
```
*2\r\n
$4\r\n
ECHO\r\n
$5\r\n
hello\r\n
```

---

## Byte-Length Accuracy

All bulk string headers use **UTF-8 byte length** rather than character length (`Buffer.byteLength`). Non-ASCII characters (e.g. `é` = 2 bytes, emojis = 4 bytes) are framed with their exact byte size to prevent framing corruption.
