import type {
  CliOptions,
  ExportPayload,
  MessageInfo,
  RawMessage,
  RawPart,
  SessionInfo,
  SessionListItem,
  TokenUsage,
  ToolPart,
  ToolState,
} from "./types.js";

const TRUNCATE_DIFF = 4000;
const TRUNCATE_CODE = 4000;
const TRUNCATE_PROSE = 8000;
const TRUNCATE_OUTPUT = 2000;

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
  kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", h: "c",
  cs: "csharp", php: "php", scala: "scala", sh: "bash",
  bash: "bash", zsh: "bash", yaml: "yaml", yml: "yaml",
  json: "json", toml: "toml", xml: "xml", html: "html",
  css: "css", scss: "scss", md: "markdown", sql: "sql",
  dockerfile: "dockerfile", makefile: "makefile",
};

export function langForPath(path: string): string {
  const name = path.split("/").pop() ?? path;
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return LANG_MAP[ext] ?? "";
}

export function epochToStr(ms: number | null | undefined): string {
  if (!ms || typeof ms !== "number") return "?";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "?";
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function formatCost(cost: number | null | undefined): string {
  if (cost == null || typeof cost !== "number") return "$0.00";
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: TokenUsage | null | undefined): string {
  if (!tokens) return "";
  const parts: string[] = [];
  if (tokens.total != null) parts.push(`${tokens.total.toLocaleString()}`);
  if (tokens.input != null) parts.push(`in:${tokens.input.toLocaleString()}`);
  if (tokens.output != null) parts.push(`out:${tokens.output.toLocaleString()}`);
  if (tokens.reasoning != null) parts.push(`think:${tokens.reasoning.toLocaleString()}`);
  return parts.join(" ");
}

export function truncate(
  text: string,
  limit: number,
  expand: boolean = false,
): string {
  if (expand || text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  const omitted = text.length - limit;
  return `${text.slice(0, half)}\n\n… [truncated ${omitted} chars]\n\n${text.slice(-half)}`;
}

function messageHasText(msg: RawMessage): boolean {
  const parts = msg.parts;
  if (!parts || parts.length === 0) return false;
  return parts.some((p) => {
    if (p.type === "text") return (p.text?.trim().length ?? 0) > 0;
    if (p.type === "tool") return p.state?.output != null || p.state?.input != null;
    if (p.type === "reasoning") return (p.text?.trim().length ?? 0) > 0;
    return false;
  });
}

function renderTodoList(todos: unknown): string[] {
  if (!Array.isArray(todos)) return [];
  const lines: string[] = ["**Todos:**"];
  for (const raw of todos) {
    const item = raw as { content?: string; status?: string; priority?: string };
    const status = item.status ?? "pending";
    const icon =
      status === "completed" ? "✓" :
      status === "in_progress" ? "▶" :
      status === "cancelled" ? "✗" : "○";
    const priority = item.priority ? ` [${item.priority}]` : "";
    const content = item.content ?? "(no description)";
    lines.push(`- ${icon} ${content}${priority}`);
  }
  return lines;
}

export function renderToolPart(
  part: ToolPart,
  expand: boolean,
): string[] {
  const toolName = part.tool ?? "unknown";
  const state = part.state;
  if (!state) return [`🔧 ${toolName}`];
  return renderToolState(toolName, state, expand);
}

function renderToolState(
  toolName: string,
  state: ToolState,
  expand: boolean,
): string[] {
  const lines: string[] = [];
  const input = state.input ?? {};
  const output = state.output;
  const isError = state.status === "error";

  if (toolName === "todowrite" || toolName === "todo_write") {
    const todos = input.todos;
    if (Array.isArray(todos) && todos.length > 0) {
      lines.push(...renderTodoList(todos));
    }
  } else if (toolName === "bash") {
    const cmd = (input.command as string) ?? "";
    const workdir = (input.workdir as string) ?? "";
    const desc = (input.description as string) ?? "";
    if (desc) lines.push(`> ${desc}`);
    lines.push("```bash");
    lines.push(truncate(workdir ? `cd ${workdir} && ${cmd}` : cmd, TRUNCATE_CODE, expand));
    lines.push("```");
  } else if (toolName === "read") {
    const path = typeof input.filePath === "string" ? input.filePath : "";
    lines.push(`📖 Read \`${path}\``);
  } else if (toolName === "write" || toolName === "create_file" || toolName === "create") {
    const path = typeof input.filePath === "string" ? input.filePath : "";
    const content = typeof input.content === "string" ? input.content : "";
    lines.push(`✏️ Write \`${path}\``);
    if (content) {
      lines.push("```" + langForPath(path));
      lines.push(truncate(content, TRUNCATE_CODE, expand));
      lines.push("```");
    }
  } else if (toolName === "edit") {
    const path = typeof input.filePath === "string" ? input.filePath : "";
    const oldStr = typeof input.oldString === "string" ? input.oldString : null;
    const newStr = typeof input.newString === "string" ? input.newString : null;
    const replaceAll = input.replaceAll === true;
    if (oldStr !== null && newStr !== null) {
      lines.push(`✏️ Edit \`${path}\`${replaceAll ? " (replaceAll)" : ""}`);
      lines.push(...renderEditDiff(oldStr, newStr, path, expand));
    } else {
      lines.push(`✏️ Edit \`${path}\``);
    }
  } else if (toolName === "glob") {
    const pattern = (input.pattern as string) ?? "";
    const path = (input.path as string) ?? "";
    lines.push(`🔍 Glob \`${pattern}\`${path ? ` in \`${path}\`` : ""}`);
  } else if (toolName === "grep") {
    const pattern = (input.pattern as string) ?? "";
    const include = (input.include as string) ?? "";
    const path = (input.path as string) ?? "";
    let header = `🔍 Grep \`${pattern}\``;
    if (include) header += ` [${include}]`;
    if (path) header += ` in \`${path}\``;
    lines.push(header);
  } else {
    lines.push(`🔧 ${toolName}`);
    const json = JSON.stringify(input, null, 2);
    if (json !== "{}") {
      lines.push("```json");
      lines.push(truncate(json, TRUNCATE_OUTPUT, expand));
      lines.push("```");
    }
  }

  if (output && typeof output === "string" && output.trim()) {
    lines.push("");
    if (isError) lines.push("❌ Error:");
    lines.push("```");
    lines.push(truncate(output, TRUNCATE_OUTPUT, expand));
    lines.push("```");
  }

  return lines;
}

function renderEditDiff(
  oldStr: string,
  newStr: string,
  path: string,
  expand: boolean,
): string[] {
  const lines: string[] = ["", "```diff"];
  for (const line of oldStr.split("\n")) {
    lines.push(`- ${truncate(line, 200, expand)}`);
  }
  for (const line of newStr.split("\n")) {
    lines.push(`+ ${truncate(line, 200, expand)}`);
  }
  lines.push("```");
  return lines;
}

export function renderMessageBlock(
  msg: RawMessage,
  opts: CliOptions = {},
): string[] {
  const lines: string[] = [];
  const info = msg.info;
  const role = info.role ?? "unknown";
  const parts = msg.parts;
  if (!parts || parts.length === 0) return lines;

  if (role === "user") {
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        lines.push(part.text);
      }
    }
    return lines;
  }

  if (role === "assistant") {
    for (const part of parts) {
      if (part.type === "reasoning" && part.text) {
        if (opts.expand) {
          lines.push("> 💭 **Reasoning:**");
          for (const ln of part.text.split("\n")) {
            lines.push(`> ${ln}`);
          }
          lines.push("");
        }
      } else if (part.type === "text" && part.text) {
        lines.push(part.text);
      } else if (part.type === "tool") {
        lines.push(...renderToolPart(part, opts.expand ?? false));
        lines.push("");
      }
    }
    return lines;
  }

  for (const part of parts) {
    if (part.type === "text" && part.text) lines.push(part.text);
  }
  return lines;
}

export function renderSessionRow(
  session: SessionListItem,
  index: number,
): string[] {
  const id = session.id;
  const title = session.title ?? "(untitled)";
  const updated = epochToStr(session.updated);
  const created = epochToStr(session.created);
  const dir = session.directory ?? "";
  return [
    `### ${index + 1}. \`${id}\``,
    `- **${title}**`,
    `- updated: ${updated}`,
    `- created: ${created}`,
    ...(dir ? [`- dir: \`${dir}\``] : []),
  ];
}

export function renderSessionHeader(
  info: SessionInfo,
): string[] {
  const lines: string[] = [];
  const title = info.title ?? "(untitled)";
  const id = info.id ?? "?";
  lines.push(`# ${title}`, "");
  lines.push(`- session: \`${id}\``);
  if (info.time?.created) {
    lines.push(`- created: ${epochToStr(info.time.created)}`);
  }
  if (info.time?.updated) {
    lines.push(`- updated: ${epochToStr(info.time.updated)}`);
  }
  if (info.directory) {
    lines.push(`- directory: \`${info.directory}\``);
  }
  return lines;
}

export function filterVisible(msgs: RawMessage[]): RawMessage[] {
  return msgs.filter(messageHasText);
}
