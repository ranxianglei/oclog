import { spawn } from "node:child_process";
import { openSync, readFileSync, unlinkSync } from "node:fs";
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

const DEFAULT_LIMIT = 10;
const FOLLOW_INTERVAL_MS = 2000;
const DEFAULT_FOLLOW_INITIAL = 10;

export interface ListOptions {
  limit?: number;
}

export interface FollowOptions {
  interval?: number;
  initial?: number;
  onMessage: (msg: RawMessage, allMessages: RawMessage[]) => void | Promise<void>;
}

async function runOpencode(args: string[]): Promise<string> {
  const tmpFile = join(tmpdir(), `oclog-${randomUUID()}.json`);
  const fd = openSync(tmpFile, "w");
  return new Promise((resolve, reject) => {
    const child = spawn("opencode", args, {
      stdio: ["ignore", fd, "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stderr = "";
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    }
    child.on("error", (err: NodeJS.ErrnoException) => {
      try { unlinkSync(tmpFile); } catch {}
      if (err.code === "ENOENT") reject(new OpencodeUnavailable());
      else reject(err);
    });
    child.on("close", (code: number) => {
      if (code !== 0) {
        try { unlinkSync(tmpFile); } catch {}
        reject(new OclogError(`opencode ${args.join(" ")} failed`, stderr));
        return;
      }
      try {
        resolve(readFileSync(tmpFile, "utf8"));
      } catch (err) {
        reject(new OclogError(`failed to read output`, String(err)));
      } finally {
        try { unlinkSync(tmpFile); } catch {}
      }
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

  const bySlug = sessions.filter(
    (s) => s.id.includes(target) || (s.title ?? "").includes(target),
  );
  if (bySlug.length === 1) return bySlug[0]!.id;
  if (bySlug.length > 1) throw new AmbiguousTarget(target, bySlug.length);

  throw new SessionNotFound(target);
}

export interface FollowHandle {
  stop: () => void;
}

export async function followSession(
  sessionId: string,
  opts: FollowOptions,
): Promise<void> {
  const interval = opts.interval ?? FOLLOW_INTERVAL_MS;
  const initialCount = opts.initial ?? DEFAULT_FOLLOW_INITIAL;
  const seenIds = new Set<string>();
  let firstRun = true;

  while (true) {
    const data = await exportSession(sessionId);
    if (data) {
      const messages = data.messages;
      if (firstRun) {
        const tail = messages.slice(Math.max(0, messages.length - initialCount));
        for (const m of tail) {
          const id = m.info.id;
          if (id) seenIds.add(id);
          await opts.onMessage(m, messages);
        }
        firstRun = false;
      } else {
        for (const m of messages) {
          const id = m.info.id;
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          await opts.onMessage(m, messages);
        }
      }
    }
    await sleep(interval);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
