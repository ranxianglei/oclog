#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import process from "node:process";

import {
  exportSession,
  followLatest,
  followSession,
  listSessions,
  resolveTarget,
} from "./oclog.js";
import { AmbiguousTarget, OclogError, SessionNotFound } from "./errors.js";
import {
  renderError,
  renderExport,
  renderMessageStream,
  renderSessionList,
  renderTail,
} from "./output.js";
import { renderMessageBlock, renderSessionHeader } from "./format.js";
import type { CliOptions, ExportPayload } from "./types.js";

const VERSION = "0.1.6";

const HELP = `Usage: oclog [options] [session-id|keyword]

Options:
  -f, --follow          Follow the session (poll for new messages)
  -a, --all             Show all messages (no tail limit)
  -n, --num <n>         Number of sessions to list, or messages to tail (default: 10)
  -o, --output <file>   Write markdown to file
  -j, --json            Output export as JSON
      --raw             Output raw markdown (no ANSI rendering)
  -e, --expand, --full  Expand truncated content + show full reasoning
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
      case "-e": case "--expand": case "--full": opts.expand = true; break;
      case "--pager": opts.pager = true; break;
      case "-j": case "--json": opts.json = true; break;
      case "-h": case "--help": process.stdout.write(HELP); process.exit(0);
      case "-v": case "--version": process.stdout.write(VERSION + "\n"); process.exit(0);
      case "-n": case "--num": case "--tail": opts.tail = parseInt(argv[++i] ?? "10", 10); break;
      case "-o": case "--output": opts.output = argv[++i]; break;
      case "--interval": opts.interval = parseFloat(argv[++i] ?? "2"); break;
      default:
        if (arg.startsWith("--") && arg.length > 2) {
          process.stderr.write(`Unknown option: ${arg}\n\n${HELP}`);
          process.exit(2);
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

function validateConflicts(opts: CliOptions): void {
  if (opts.follow && opts.output) {
    process.stderr.write("error: -f/--follow cannot be combined with -o/--output\n");
    process.exit(2);
  }
  if (opts.follow && opts.json) {
    process.stderr.write("error: -f/--follow cannot be combined with -j/--json\n");
    process.exit(2);
  }
  if (opts.all && opts.output) {
    process.stderr.write("error: --all cannot be combined with -o/--output (export is always full)\n");
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const { target, opts } = parseArgs(process.argv.slice(2));
  validateConflicts(opts);

  const num = opts.tail ?? 10;

  if (!target) {
    if (opts.follow) {
      await doFollowLatest(opts);
      return;
    }
    const sessions = await listSessions({ limit: num });
    if (!sessions.length) {
      process.stderr.write("No sessions found.\n");
      process.exit(1);
    }
    renderSessionList(sessions, opts);
    return;
  }

  const sessions = await listSessions({ limit: 100 });
  let sessionId: string;
  try {
    sessionId = resolveTarget(target, sessions);
  } catch (err) {
    if (err instanceof AmbiguousTarget) {
      const matches = sessions.filter(
        (s) =>
          s.id.startsWith(target) ||
          s.id.includes(target) ||
          (s.title ?? "").toLowerCase().includes(target.toLowerCase()),
      );
      process.stderr.write(`Multiple sessions match '${target}':\n\n`);
      renderSessionList(matches, opts);
      return;
    }
    if (err instanceof SessionNotFound) {
      if (/^ses_[A-Za-z0-9]{10,}$/.test(target)) {
        sessionId = target;
      } else {
        process.stderr.write(`No session found matching '${target}'.\n`);
        process.stderr.write("Run 'oclog' to see recent sessions.\n");
        process.exit(1);
      }
    } else {
      throw err;
    }
  }

  if (opts.follow) {
    await doFollow(sessionId, opts, num);
    return;
  }

  const data = await exportSession(sessionId);
  if (!data) {
    process.stderr.write(`Failed to export session ${sessionId}.\n`);
    process.exit(1);
  }

  if (opts.output) {
    writeExportFile(data, opts);
    return;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
    return;
  }

  if (opts.all) {
    renderExport(data, opts);
  } else {
    renderTail(data, num, opts);
  }
}

function writeExportFile(
  data: ExportPayload,
  opts: CliOptions,
): void {
  if (opts.json) {
    writeFileSync(opts.output!, JSON.stringify(data, null, 2) + "\n", "utf8");
  } else {
    const parts = [...renderSessionHeader(data.info), ""];
    for (const msg of data.messages) {
      parts.push(...renderMessageBlock(msg, { expand: opts.expand }));
      parts.push("");
    }
    writeFileSync(opts.output!, parts.join("\n") + "\n", "utf8");
  }
  process.stdout.write(`Written to ${opts.output}\n`);
}

function setupSigintHandler(): void {
  process.on("SIGINT", () => {
    process.stderr.write("\n(stopped)\n");
    process.exit(0);
  });
}

async function doFollow(
  sessionId: string,
  opts: CliOptions,
  num: number,
): Promise<void> {
  setupSigintHandler();
  const initial = opts.all ? null : num;
  await followSession(sessionId, {
    interval: (opts.interval ?? 2) * 1000,
    initial,
    onMessage: (msg) => renderMessageStream(msg, opts),
  });
}

async function doFollowLatest(opts: CliOptions): Promise<void> {
  setupSigintHandler();
  const initial = opts.all ? null : (opts.tail ?? 10);
  await followLatest({
    interval: (opts.interval ?? 2) * 1000,
    initial,
    onMessage: (msg) => renderMessageStream(msg, opts),
  });
}

main().catch((err: unknown) => {
  if (err instanceof OclogError) {
    process.stderr.write(`${err.message}\n`);
    if (err.hint) process.stderr.write(`💡 ${err.hint}\n`);
    process.exit(1);
  }
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal: ${msg}\n`);
  process.exit(1);
});
