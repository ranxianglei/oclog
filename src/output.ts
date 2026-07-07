import chalk from "chalk";
import { spawn } from "node:child_process";

import type { ExportPayload, RawMessage, SessionListItem } from "./types.js";
import {
  filterVisible,
  renderMessageBlock,
  renderSessionHeader,
  renderSessionRow,
} from "./format.js";

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
  const rendered = isTTY() ? renderMd(text) : stripMd(text);
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

function renderMd(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeLang = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        out.push(chalk.dim("┌─" + (codeLang ? ` ${codeLang} ` : "")));
      } else {
        inCode = false;
        codeLang = "";
        out.push(chalk.dim("└─"));
      }
      continue;
    }
    if (inCode) {
      out.push(chalk.cyan(line));
      continue;
    }

    if (line.startsWith("# ")) {
      out.push(chalk.bold.underline(line.slice(2)));
    } else if (line.startsWith("## ")) {
      out.push(chalk.bold(line.slice(3)));
    } else if (line.startsWith("### ")) {
      out.push(chalk.bold.cyan(line.slice(4)));
    } else if (line.startsWith("> ")) {
      out.push(chalk.dim("│ " + renderInline(line.slice(2))));
    } else if (/^[-*] /.test(line)) {
      out.push("  " + renderInline(line));
    } else if (line.startsWith("- ")) {
      out.push("  " + renderInline(line));
    } else if (/^\d+\./.test(line)) {
      out.push(renderInline(line));
    } else {
      out.push(renderInline(line));
    }
  }
  return out.join("\n");
}

function renderInline(text: string): string {
  let result = text;
  result = result.replace(/`([^`]+)`/g, (_, code: string) => chalk.cyan(code));
  result = result.replace(/\*\*([^*]+)\*\*/g, (_, t: string) => chalk.bold(t));
  result = result.replace(/_([^_]+)_/g, (_, t: string) => chalk.italic(t));
  return result;
}

function stripMd(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    let s = line;
    s = s.replace(/`([^`]+)`/g, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/_([^_]+)_/g, "$1");
    if (s.startsWith("# ")) s = s.slice(2);
    else if (s.startsWith("## ")) s = s.slice(3);
    else if (s.startsWith("### ")) s = s.slice(4);
    else if (s.startsWith("> ")) s = s.slice(2);
    out.push(s);
  }
  return out.join("\n");
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
  const tail = n ? visible.slice(Math.max(0, visible.length - n)) : visible;
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
  emit(lines.join("\n"), { raw: false });
}
