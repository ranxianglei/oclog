import chalk from "chalk";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { spawn } from "node:child_process";

import type { ExportPayload, RawMessage, SessionListItem } from "./types.js";
import {
  filterVisible,
  renderMessageBlock,
  renderSessionHeader,
  renderSessionRow,
} from "./format.js";

let _renderer: Marked | null = null;

function getRenderer(): Marked {
  if (_renderer) return _renderer;
  const m = new Marked();
  m.use(
    markedTerminal({
      showSectionPrefix: false,
      reflowText: true,
      width: process.stdout.columns || 80,
      tab: 2,
    }),
  );
  _renderer = m;
  return m;
}

function renderMarkdown(text: string): string {
  try {
    const result = getRenderer().parse(text);
    return typeof result === "string" ? result : text;
  } catch {
    return text;
  }
}

function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

export interface EmitOptions {
  raw?: boolean;
  pager?: boolean;
}

export function emit(text: string, opts: EmitOptions = {}): void {
  if (opts.raw) {
    process.stdout.write(text + "\n");
    return;
  }
  const rendered = renderMarkdown(text);
  if (opts.pager && isTTY()) {
    pipeToPager(rendered);
  } else {
    process.stdout.write(rendered + "\n");
  }
}

function pipeToPager(text: string): void {
  const pager = process.env.PAGER ?? "less";
  try {
    const child = spawn(pager, ["-R"], { stdio: ["pipe", "inherit", "inherit"] });
    child.stdin.write(text);
    child.stdin.end();
    child.on("error", () => process.stdout.write(text));
  } catch {
    process.stdout.write(text);
  }
}

export interface RenderOptions extends EmitOptions {
  expand?: boolean;
}

export function renderSessionList(
  sessions: SessionListItem[],
  opts: RenderOptions = {},
): void {
  if (sessions.length === 0) {
    emit("No sessions found.", opts);
    return;
  }
  const blocks: string[] = ["# Sessions", ""];
  for (let i = 0; i < sessions.length; i++) {
    blocks.push(...renderSessionRow(sessions[i]!, i));
    blocks.push("");
  }
  emit(blocks.join("\n"), opts);
}

export function renderExport(
  data: ExportPayload,
  opts: RenderOptions = {},
): void {
  const parts: string[] = [...renderSessionHeader(data.info), ""];
  const visible = filterVisible(data.messages);
  for (const msg of visible) {
    parts.push(...renderMessageBlock(msg, opts));
    parts.push("");
  }
  emit(parts.join("\n"), opts);
}

export function renderTail(
  data: ExportPayload,
  n: number | null,
  opts: RenderOptions = {},
): void {
  const visible = filterVisible(data.messages);
  const count = n == null || n < 0 ? 10 : n;
  const tail = count === 0 ? [] : visible.slice(Math.max(0, visible.length - count));
  const parts: string[] = [];
  for (const msg of tail) {
    parts.push(...renderMessageBlock(msg, opts));
    parts.push("");
  }
  emit(parts.join("\n"), opts);
}

export function renderMessageStream(
  msg: RawMessage,
  opts: RenderOptions = {},
): void {
  const parts = renderMessageBlock(msg, opts);
  if (parts.length === 0) return;
  emit(parts.join("\n"), opts);
}

export function renderError(message: string, hint?: string): void {
  const lines = [`## ✗ ${chalk.red("Error")}`, "", message];
  if (hint) lines.push("", `💡 ${hint}`);
  process.stderr.write(lines.join("\n") + "\n");
}
