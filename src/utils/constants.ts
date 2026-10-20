// Shared numerical and sizing constants for Redox server.

export const INT64_MIN = -9223372036854775808n;
export const INT64_MAX = 9223372036854775807n;

export const MAX_BULK_BYTES = 512 * 1024 * 1024; // 512 MiB limit per argument
export const MAX_ARRAY_SIZE = 1024; // maximum arguments per command array
export const MAX_BUFFER_BYTES = 64 * 1024 * 1024; // 64 MB maximum unparsed stream buffer
export const MAX_PATTERN_LENGTH = 1024; // maximum glob pattern length

export const DEFAULT_PORT = 6379;
export const EVICTION_SAMPLE_SIZE = 16;
export const ACTIVE_EXPIRY_BATCH_SIZE = 20;

export const ERR_WRONG_TYPE = "WRONGTYPE Operation against a key holding the wrong kind of value";
export const ERR_NOT_INTEGER = "ERR value is not an integer or out of range";
export const ERR_SYNTAX = "ERR syntax error";

