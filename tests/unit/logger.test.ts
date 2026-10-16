import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/utils/logger.js";

describe("logger", () => {
  const originalEnv = process.env.LOG_LEVEL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.LOG_LEVEL = originalEnv;
  });

  it("logs info messages when LOG_LEVEL is INFO", () => {
    process.env.LOG_LEVEL = "INFO";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test info message");
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0].join(" ")).toContain("[INFO]");
    expect(spy.mock.calls[0].join(" ")).toContain("test info message");
  });

  it("does not log debug when LOG_LEVEL is INFO", () => {
    process.env.LOG_LEVEL = "INFO";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("test debug message");
    expect(spy).not.toHaveBeenCalled();
  });

  it("logs debug when LOG_LEVEL is DEBUG", () => {
    process.env.LOG_LEVEL = "DEBUG";
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.debug("test debug message");
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0].join(" ")).toContain("[DEBUG]");
  });

  it("suppresses logs when LOG_LEVEL is SILENT", () => {
    process.env.LOG_LEVEL = "SILENT";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.info("hello");
    logger.error("fail");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
