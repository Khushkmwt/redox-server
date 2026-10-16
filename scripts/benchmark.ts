// Redox Benchmark Suite — Measures sequential latency & pipelined throughput.
//
// Usage:
//   npx tsx --env-file=.env scripts/benchmark.ts
//   PORT=6379 npx tsx scripts/benchmark.ts

import net from "node:net";

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = Number(process.env.PORT ?? 6379);
const SEQUENTIAL_OPS = 5_000;
const PIPELINED_OPS = 25_000;
const PIPELINE_BATCH_SIZE = 100;

// ── RESP2 helpers ──────────────────────────────────────────────────────────────

function encodeCommand(...args: string[]): Buffer {
  const parts: Buffer[] = [Buffer.from(`*${args.length}\r\n`)];
  for (const a of args) {
    const payload = Buffer.from(a, "utf8");
    parts.push(Buffer.from(`$${payload.byteLength}\r\n`));
    parts.push(payload);
    parts.push(Buffer.from("\r\n"));
  }
  return Buffer.concat(parts);
}

/** Parses exactly one complete RESP2 frame from buffer. Returns bytes consumed, or 0 if incomplete. */
function parseOneResp(buffer: string): number {
  if (buffer.length === 0) return 0;
  const prefix = buffer[0];
  const crlf = buffer.indexOf("\r\n");
  if (crlf === -1) return 0;

  if (prefix === "+" || prefix === "-" || prefix === ":") {
    return crlf + 2;
  }

  if (prefix === "$") {
    const len = parseInt(buffer.slice(1, crlf), 10);
    if (len === -1) return crlf + 2;
    const total = crlf + 2 + len + 2;
    if (buffer.length < total) return 0;
    return total;
  }

  if (prefix === "*") {
    const count = parseInt(buffer.slice(1, crlf), 10);
    if (count <= 0) return crlf + 2;
    let offset = crlf + 2;
    for (let i = 0; i < count; i++) {
      if (offset >= buffer.length) return 0;
      const sub = parseOneResp(buffer.slice(offset));
      if (sub === 0) return 0;
      offset += sub;
    }
    return offset;
  }

  return 0;
}

function connect(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(PORT, HOST, () => {
      socket.setNoDelay(true);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}

// ── Sequential Benchmark ───────────────────────────────────────────────────────

async function benchmarkSequential(
  label: string,
  commandFn: (i: number) => Buffer,
  count: number
): Promise<{ label: string; mode: string; ops: number; timeMs: number; opsPerSec: number; avgLatencyUs: number }> {
  const socket = await connect();

  let pending: (() => void) | null = null;
  let leftover = "";

  socket.on("data", (chunk) => {
    leftover += chunk.toString("utf8");
    while (leftover.length > 0) {
      const consumed = parseOneResp(leftover);
      if (consumed === 0) break;
      leftover = leftover.slice(consumed);
      if (pending) {
        const cb = pending;
        pending = null;
        cb();
        break;
      }
    }
  });

  function send(buf: Buffer): Promise<void> {
    return new Promise((resolve) => {
      pending = resolve;
      socket.write(buf);
    });
  }

  // Warm-up
  for (let i = 0; i < 50; i++) await send(commandFn(i));

  const start = performance.now();
  for (let i = 0; i < count; i++) {
    await send(commandFn(i));
  }
  const elapsed = performance.now() - start;
  socket.destroy();

  const opsPerSec = Math.round((count / elapsed) * 1000);
  const avgLatencyUs = Math.round((elapsed / count) * 1000);

  return {
    label,
    mode: "Sequential",
    ops: count,
    timeMs: Math.round(elapsed),
    opsPerSec,
    avgLatencyUs,
  };
}

// ── Pipelined Benchmark ────────────────────────────────────────────────────────

async function benchmarkPipelined(
  label: string,
  commandFn: (i: number) => Buffer,
  totalOps: number,
  batchSize: number
): Promise<{ label: string; mode: string; ops: number; timeMs: number; opsPerSec: number; avgLatencyUs: number }> {
  const socket = await connect();

  let leftover = "";
  let repliesReceived = 0;
  let targetReplies = 0;
  let onBatchDone: (() => void) | null = null;

  socket.on("data", (chunk) => {
    leftover += chunk.toString("utf8");
    while (leftover.length > 0) {
      const consumed = parseOneResp(leftover);
      if (consumed === 0) break;
      leftover = leftover.slice(consumed);
      repliesReceived++;
    }

    if (repliesReceived >= targetReplies && onBatchDone) {
      const cb = onBatchDone;
      onBatchDone = null;
      cb();
    }
  });

  const batches = Math.ceil(totalOps / batchSize);
  const start = performance.now();

  for (let b = 0; b < batches; b++) {
    const currentBatch = Math.min(batchSize, totalOps - b * batchSize);
    const buffers: Buffer[] = [];
    for (let i = 0; i < currentBatch; i++) {
      buffers.push(commandFn(b * batchSize + i));
    }

    targetReplies += currentBatch;
    await new Promise<void>((resolve) => {
      onBatchDone = resolve;
      socket.write(Buffer.concat(buffers));
    });
  }

  const elapsed = performance.now() - start;
  socket.destroy();

  const opsPerSec = Math.round((totalOps / elapsed) * 1000);
  const avgLatencyUs = Math.round((elapsed / totalOps) * 1000);

  return {
    label,
    mode: `Pipelined (${batchSize})`,
    ops: totalOps,
    timeMs: Math.round(elapsed),
    opsPerSec,
    avgLatencyUs,
  };
}

// ── Format Output Table ────────────────────────────────────────────────────────

function printRow(col1: string, col2: string, col3: string, col4: string, col5: string, col6: string) {
  console.log(
    `${col1.padEnd(14)} ${col2.padEnd(18)} ${col3.padStart(10)} ${col4.padStart(10)} ${col5.padStart(12)} ${col6.padStart(14)}`
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n========================================================================================`);
  console.log(`                      REDOX HIGH-PERFORMANCE BENCHMARK SUITE`);
  console.log(`========================================================================================`);
  console.log(`Target: ${HOST}:${PORT} | Sequential: ${SEQUENTIAL_OPS.toLocaleString()} ops | Pipelined: ${PIPELINED_OPS.toLocaleString()} ops (batch: ${PIPELINE_BATCH_SIZE})\n`);

  printRow("Command", "Mode", "Total Ops", "Time", "Avg Latency", "Throughput");
  console.log("-".repeat(84));

  const testCases = [
    { name: "PING", fn: () => encodeCommand("PING") },
    { name: "SET", fn: (i: number) => encodeCommand("SET", `bench:k:${i}`, "redox-val") },
    { name: "GET", fn: (i: number) => encodeCommand("GET", `bench:k:${i}`) },
    { name: "INCR", fn: () => encodeCommand("INCR", "bench:counter") },
    { name: "HSET", fn: (i: number) => encodeCommand("HSET", `bench:hash:${i}`, "field1", "val1", "field2", "val2") },
    { name: "HGET", fn: (i: number) => encodeCommand("HGET", `bench:hash:${i}`, "field1") },
    { name: "EXPIRE", fn: (i: number) => encodeCommand("EXPIRE", `bench:k:${i}`, "300") },
    { name: "DEL", fn: (i: number) => encodeCommand("DEL", `bench:k:${i}`) },
  ];

  try {
    // 1. Sequential benchmarks
    for (const tc of testCases) {
      const res = await benchmarkSequential(tc.name, tc.fn, SEQUENTIAL_OPS);
      printRow(
        res.label,
        res.mode,
        res.ops.toLocaleString(),
        `${res.timeMs} ms`,
        `${res.avgLatencyUs} µs`,
        `${res.opsPerSec.toLocaleString()} ops/s`
      );
    }

    console.log("-".repeat(84));

    // 2. Pipelined benchmarks
    for (const tc of testCases) {
      const res = await benchmarkPipelined(tc.name, tc.fn, PIPELINED_OPS, PIPELINE_BATCH_SIZE);
      printRow(
        res.label,
        res.mode,
        res.ops.toLocaleString(),
        `${res.timeMs} ms`,
        `${res.avgLatencyUs} µs`,
        `${res.opsPerSec.toLocaleString()} ops/s`
      );
    }

    console.log("=".repeat(84));
    console.log(`\nBenchmark completed successfully.\n`);
  } catch (err) {
    console.error(`\nFailed to connect to ${HOST}:${PORT} — is the server running?\n`, err);
    process.exit(1);
  }
}

main();
