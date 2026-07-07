#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import process from "node:process";

import {
  exportSession,
  followSession,
  listSessions,
  resolveTarget,
} from "./oclog.js";
import { OclogError } from "./errors.js";
import {
  renderError,
  renderExport,
  renderMessageStream,
  renderSessionList,
  renderTail,
} from "./output.js";
import { renderMessageBlock } from "./format.js";
import type { CliOptions } from "./types.js";

const VERSION = "0.1.2";

const HELP = `Usage: oclog [options] [session-id|keyword]

Options:
  -f, --follow          Follow the session (poll for new messages)
  -a, --all             Show all messages (no tail limit)
  -n, --tail <n>        Show last N messages (default: 10)
  -o, --output <file>   Write markdown to file
  -j, --json            Output export as JSON
      --raw             Output raw markdown (no ANSI rendering)
      --expand          Expand truncated content + show reasoning
      --pager           Pipe through pager (less)
      --interval <sec>  Follow interval in seconds (default: 2)
  -h, --help            Show this help
  -v, --version         Show version

Commands:
  (no args)             List recent sessions
  <session-id>          Show session messages (tail mode by default)
  -f                    Follow the latest session
`;

function parseArgs(argv: string[]): { target?: string; opts: CliOptions } {
  const opts: CliOptions = {};
  const positional: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    switch (arg) {
      case "-f": case "--follow": opts.follow = true; break;
      case "-a": case "--all": opts.all = true; break;
      case "--raw": opts.raw = true; break;
      case "--expand": opts.expand = true; break;
      case "--pager": opts.pager = true; break;
      case "-j": case "--json": opts.json = true; break;
      case "-h": case "--help": process.stdout.write(HELP); process.exit(0);
      case "-v": case "--version": process.stdout.write(VERSION + "\n"); process.exit(0);
      case "-n": case "--tail": opts.tail = parseInt(argv[++i] ?? "10", 10); break;
      case "-o": case "--output": opts.output = argv[++i]; break;
      case "--interval": opts.interval = parseFloat(argv[++i] ?? "2"); break;
      default:
        if (arg.startsWith("--")) {
          const eq = arg.indexOf("=");
          if (eq > 0) {
            (opts as Record<string, unknown>)[arg.slice(2, eq)] = arg.slice(eq + 1);
          } else {
            (opts as Record<string, unknown>)[arg.slice(2)] = true;
          }
        } else if (arg.startsWith("-") && arg.length > 1) {
          process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
          process.exit(2);
        } else {
          positional.push(arg);
        }
    }
    i++;
  }
  return { target: positional[0], opts };
}

async function main(): Promise<void> {
  const { target, opts } = parseArgs(process.argv.slice(2));

  if (!target) {
    const sessions = await listSessions({ limit: 10 });
    if (opts.follow) {
      const latest = sessions[0];
      if (!latest) {
        renderError("No sessions found to follow.");
        return;
      }
      await doFollow(latest.id, opts);
    } else {
      renderSessionList(sessions, opts);
    }
    return;
  }

  const sessions = await listSessions({ limit: 20 });
  let sessionId: string;
  try {
    sessionId = resolveTarget(target, sessions);
  } catch {
    sessionId = target;
  }

  const data = await exportSession(sessionId);
  if (!data) {
    renderError(
      `Session \`${sessionId}\` not found or empty.`,
      "Run `oclog` with no args to list available sessions.",
    );
    return;
  }

  if (opts.output) {
    const content = opts.json
      ? JSON.stringify(data, null, 2)
      : data.messages.map((m) => renderMessageBlock(m, { expand: true }).join("\n")).join("\n\n");
    writeFileSync(opts.output, content + "\n", "utf8");
    process.stderr.write(`Wrote ${opts.output}\n`);
    return;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }

  if (opts.follow) {
    await doFollow(sessionId, opts);
    return;
  }

  if (opts.all) {
    renderExport(data, opts);
  } else {
    renderTail(data, opts.tail ?? 10, opts);
  }
}

async function doFollow(sessionId: string, opts: CliOptions): Promise<void> {
  await followSession(sessionId, {
    interval: (opts.interval ?? 2) * 1000,
    initial: opts.tail ?? 10,
    onMessage: (msg) => renderMessageStream(msg, opts),
  });
}

main().catch((err: unknown) => {
  if (err instanceof OclogError) {
    renderError(err.message, err.hint);
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(1);
});
