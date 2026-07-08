import { spawn } from "node:child_process";
import { readFileSync, unlinkSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { ExportPayload, RawMessage, SessionListItem } from "./types.js";
import {
  AmbiguousTarget,
  ExportError,
  OclogError,
  OpencodeUnavailable,
  SessionNotFound,
} from "./errors.js";
import { filterVisible } from "./format.js";

const DEFAULT_LIMIT = 10;
const FOLLOW_INTERVAL_MS = 2000;
const DEFAULT_FOLLOW_INITIAL = 10;

export interface ListOptions {
  limit?: number;
}

export interface FollowOptions {
  interval?: number;
  initial?: number | null;
  onMessage: (msg: RawMessage, allMessages: RawMessage[]) => void | Promise<void>;
}

interface BunSpawnResult {
  exited: Promise<number>;
  stderr: ReadableStream<Uint8Array> | null;
}

interface BunGlobal {
  spawn: (opts: {
    cmd: string[];
    cwd?: string;
    stdout: unknown;
    stderr: string;
    env: Record<string, string | undefined>;
  }) => BunSpawnResult;
}

function getBun(): BunGlobal | null {
  const bun = (globalThis as { Bun?: BunGlobal }).Bun;
  return bun ?? null;
}

async function runOpencode(args: string[]): Promise<string> {
  const env = { ...process.env, NO_COLOR: "1" };
  const bun = getBun();
  const neutralCwd = tmpdir();

  if (bun) {
    const tmpFile = join(tmpdir(), `oclog-${randomUUID()}.json`);
    const fd = openSync(tmpFile, "w");
    const child = bun.spawn({
      cmd: ["opencode", ...args],
      cwd: neutralCwd,
      stdout: fd,
      stderr: "pipe",
      env,
    });
    const stderrText = child.stderr
      ? await new Response(child.stderr).text()
      : "";
    const code = await child.exited;
    if (code !== 0) {
      try { unlinkSync(tmpFile); } catch {}
      throw new OclogError(`opencode ${args.join(" ")} failed`, stderrText);
    }
    try {
      return readFileSync(tmpFile, "utf8");
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn("opencode", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: neutralCwd,
      env,
    });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") reject(new OpencodeUnavailable());
      else reject(err);
    });
    child.on("close", (code: number) => {
      if (code !== 0) {
        reject(new OclogError(`opencode ${args.join(" ")} failed`, stderr));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

export async function listSessions(
  opts: ListOptions = {},
): Promise<SessionListItem[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const raw = await runOpencode([
    "session", "list", "-n", String(limit), "--format", "json",
  ]);
  try {
    const parsed = JSON.parse(raw) as SessionListItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function exportSession(
  sessionId: string,
): Promise<ExportPayload | null> {
  let raw: string;
  try {
    raw = await runOpencode(["export", sessionId]);
  } catch (err) {
    if (err instanceof OclogError) throw err;
    throw new ExportError(sessionId, String(err));
  }
  try {
    const result = JSON.parse(raw) as ExportPayload;
    if (!result || !Array.isArray(result.messages)) return null;
    return result;
  } catch (err) {
    throw new ExportError(sessionId, `invalid JSON: ${(err as Error).message}`);
  }
}

export function resolveTarget(
  target: string,
  sessions: SessionListItem[],
): string {
  const exact = sessions.find((s) => s.id === target);
  if (exact) return exact.id;

  const prefixed = sessions.filter((s) => s.id.startsWith(target));
  if (prefixed.length === 1) return prefixed[0]!.id;
  if (prefixed.length > 1) throw new AmbiguousTarget(target, prefixed.length);

  const lowerTarget = target.toLowerCase();
  const bySlug = sessions.filter(
    (s) =>
      s.id.toLowerCase().includes(lowerTarget) ||
      (s.title ?? "").toLowerCase().includes(lowerTarget),
  );
  if (bySlug.length === 1) return bySlug[0]!.id;
  if (bySlug.length > 1) throw new AmbiguousTarget(target, bySlug.length);

  throw new SessionNotFound(target);
}

export interface FollowHandle {
  stop: () => void;
}

/**
 * Seed seen-set with IDs of all content messages, then render the initial tail.
 * Empty placeholder messages are NOT seeded so they still print when content arrives.
 */
async function seedAndShowInitial(
  messages: RawMessage[],
  initial: number | null,
  seen: Set<string>,
  onMessage: (msg: RawMessage, allMessages: RawMessage[]) => void | Promise<void>,
): Promise<boolean> {
  const content = filterVisible(messages);
  for (const m of content) {
    const mid = m.info.id;
    if (mid) seen.add(mid);
  }
  let show: RawMessage[];
  if (initial === null) {
    show = content;
  } else if (initial <= 0) {
    show = [];
  } else {
    show = content.slice(Math.max(0, content.length - initial));
  }
  for (const m of show) {
    await onMessage(m, messages);
  }
  return true;
}

/**
 * Export a session and stream messages not yet in `seen`.
 * Mirrors Python's `_stream_new_messages`.
 */
async function streamNewMessages(
  sessionId: string,
  seen: Set<string>,
  onMessage: (msg: RawMessage, allMessages: RawMessage[]) => void | Promise<void>,
): Promise<boolean> {
  const data = await exportSession(sessionId);
  if (!data) return true;
  for (const msg of data.messages) {
    const mid = msg.info.id;
    if (!mid || seen.has(mid)) continue;
    // Skip empty placeholder (mid-generation). Don't mark seen,
    // so it still prints once content arrives.
    if (!filterVisible([msg]).length) continue;
    seen.add(mid);
    await onMessage(msg, data.messages);
  }
  return true;
}

export async function followSession(
  sessionId: string,
  opts: FollowOptions,
): Promise<void> {
  const interval = opts.interval ?? FOLLOW_INTERVAL_MS;
  const initialCount = opts.initial ?? DEFAULT_FOLLOW_INITIAL;
  const seen = new Set<string>();

  // Initial export — fail fast if session doesn't exist
  const data = await exportSession(sessionId);
  if (!data) {
    throw new OclogError(`Failed to export session ${sessionId}.`);
  }

  await seedAndShowInitial(data.messages, initialCount, seen, opts.onMessage);

  process.stderr.write(
    `\n— following ${sessionId} (poll every ${interval / 1000}s, Ctrl-C to stop) —\n`,
  );

  try {
    while (true) {
      await sleep(interval);
      await streamNewMessages(sessionId, seen, opts.onMessage);
    }
  } catch (err) {
    if (err instanceof FollowStopped) {
      process.stderr.write("\n(stopped)\n");
      return;
    }
    throw err;
  }
}

/**
 * Follow the most recently updated session, re-targeting when a newer
 * session becomes the latest. The initial tail of each newly-targeted
 * session is printed on switch; afterwards new messages stream live.
 *
 * Mirrors Python's `follow_latest`.
 */
export async function followLatest(
  opts: FollowOptions,
): Promise<void> {
  const interval = opts.interval ?? FOLLOW_INTERVAL_MS;
  const initialCount = opts.initial ?? DEFAULT_FOLLOW_INITIAL;
  let current: string | null = null;
  const seen = new Set<string>();

  process.stderr.write(
    `— follow-latest: polling every ${interval / 1000}s (Ctrl-C to stop) —\n`,
  );

  try {
    while (true) {
      await sleep(interval);
      const sessions = await listSessions({ limit: 1 });
      if (!sessions.length) continue;
      const latest = sessions[0]!;
      const latestId = latest.id;
      const latestTitle = latest.title ?? "untitled";

      if (latestId !== current) {
        // A different session is now the most recent — switch to it.
        current = latestId;
        seen.clear();
        process.stderr.write(`\n→ ${latestId} — ${latestTitle}\n`);
        const data = await exportSession(current);
        if (!data) continue;
        await seedAndShowInitial(data.messages, initialCount, seen, opts.onMessage);
        continue;
      }

      // Same session as last poll — stream any new messages.
      await streamNewMessages(current, seen, opts.onMessage);
    }
  } catch (err) {
    if (err instanceof FollowStopped) {
      process.stderr.write("\n(stopped)\n");
      return;
    }
    throw err;
  }
}

class FollowStopped extends Error {
  constructor() {
    super("follow stopped");
    this.name = "FollowStopped";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
