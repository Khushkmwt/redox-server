// Server telemetry and diagnostic information formatter.

import { formatBytesHuman } from "./memory.js";

export interface DiagnosticsContext {
  startTime: number;
  port: number;
  usedMemory: number;
  maxMemory: number;
  evictionPolicy: string;
  evictedKeys: number;
  expiredKeys: number;
  totalKeys: number;
  lastSaveTimestamp: number;
  totalConnections: number;
  totalCommands: number;
}

/**
 * Format Redis-compatible INFO command string from store state.
 */
export function formatInfo(ctx: DiagnosticsContext, section?: string): string {
  const sec = section?.toLowerCase();
  const blocks: string[] = [];

  const serverSection = () => {
    const uptimeSec = Math.floor((Date.now() - ctx.startTime) / 1000);
    return [
      "# Server",
      "redox_version:1.0.0",
      `process_id:${process.pid}`,
      `tcp_port:${ctx.port}`,
      `uptime_in_seconds:${uptimeSec}`,
    ].join("\r\n");
  };

  const memorySection = () => {
    return [
      "# Memory",
      `used_memory:${ctx.usedMemory}`,
      `used_memory_human:${formatBytesHuman(ctx.usedMemory)}`,
      `maxmemory:${ctx.maxMemory}`,
      `maxmemory_human:${formatBytesHuman(ctx.maxMemory)}`,
      `maxmemory_policy:${ctx.evictionPolicy}`,
      `evicted_keys:${ctx.evictedKeys}`,
      `expired_keys:${ctx.expiredKeys}`,
      `total_keys:${ctx.totalKeys}`,
    ].join("\r\n");
  };

  const persistenceSection = () => {
    return [
      "# Persistence",
      "loading:0",
      `rdb_last_save_time:${ctx.lastSaveTimestamp}`,
      "rdb_last_bgsave_status:ok",
    ].join("\r\n");
  };

  const statsSection = () => {
    return [
      "# Stats",
      `total_connections_received:${ctx.totalConnections}`,
      `total_commands_processed:${ctx.totalCommands}`,
    ].join("\r\n");
  };

  if (!sec || sec === "all" || sec === "default") {
    blocks.push(serverSection(), memorySection(), persistenceSection(), statsSection());
  } else if (sec === "server") {
    blocks.push(serverSection());
  } else if (sec === "memory") {
    blocks.push(memorySection());
  } else if (sec === "persistence") {
    blocks.push(persistenceSection());
  } else if (sec === "stats") {
    blocks.push(statsSection());
  }

  return blocks.join("\r\n\r\n");
}
