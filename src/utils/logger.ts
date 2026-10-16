export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SILENT";

const LEVELS: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  SILENT: 50,
};

function getCurrentLevel(): number {
  const envLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel;
  return LEVELS[envLevel] ?? LEVELS.INFO;
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(...args: unknown[]): void {
    if (getCurrentLevel() <= LEVELS.DEBUG) {
      console.log(`[${timestamp()}] [DEBUG]`, ...args);
    }
  },

  info(...args: unknown[]): void {
    if (getCurrentLevel() <= LEVELS.INFO) {
      console.log(`[${timestamp()}] [INFO]`, ...args);
    }
  },

  warn(...args: unknown[]): void {
    if (getCurrentLevel() <= LEVELS.WARN) {
      console.warn(`[${timestamp()}] [WARN]`, ...args);
    }
  },

  error(...args: unknown[]): void {
    if (getCurrentLevel() <= LEVELS.ERROR) {
      console.error(`[${timestamp()}] [ERROR]`, ...args);
    }
  },
};
