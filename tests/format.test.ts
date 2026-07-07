import { describe, it, expect } from "vitest";
import {
  langForPath,
  epochToStr,
  formatCost,
  formatTokens,
  truncate,
  renderToolPart,
  renderMessageBlock,
  renderSessionRow,
  filterVisible,
} from "../src/format.js";
import { messages } from "./fixtures.js";

describe("langForPath", () => {
  it("maps common extensions to language names", () => {
    expect(langForPath("foo.ts")).toBe("typescript");
    expect(langForPath("foo.py")).toBe("python");
    expect(langForPath("foo.rs")).toBe("rust");
    expect(langForPath("foo.go")).toBe("go");
    expect(langForPath("foo.js")).toBe("javascript");
    expect(langForPath("foo.json")).toBe("json");
    expect(langForPath("foo.yaml")).toBe("yaml");
  });

  it("handles special filenames", () => {
    expect(langForPath("Dockerfile")).toBe("dockerfile");
    expect(langForPath("Makefile")).toBe("makefile");
    expect(langForPath("dockerfile")).toBe("dockerfile");
  });

  it("returns empty string for unknown extensions", () => {
    expect(langForPath("foo.unknownext")).toBe("");
    expect(langForPath("Makefile.bak")).toBe("");
  });

  it("handles paths with directories", () => {
    expect(langForPath("/home/user/src/app.ts")).toBe("typescript");
    expect(langForPath("./lib/utils.py")).toBe("python");
  });
});

describe("epochToStr", () => {
  it("formats epoch milliseconds to ISO string", () => {
    const result = epochToStr(1719900000000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z$/);
  });

  it("returns ? for null or undefined", () => {
    expect(epochToStr(null)).toBe("?");
    expect(epochToStr(undefined)).toBe("?");
    expect(epochToStr(0)).toBe("?");
  });

  it("returns ? for invalid numbers", () => {
    expect(epochToStr(Number.NaN)).toBe("?");
    expect(epochToStr(Number.POSITIVE_INFINITY)).toBe("?");
  });
});

describe("formatCost", () => {
  it("formats numbers as dollar amounts", () => {
    expect(formatCost(0.05)).toBe("$0.05");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(0)).toBe("$0.00");
  });

  it("returns $0.00 for null or undefined", () => {
    expect(formatCost(null)).toBe("$0.00");
    expect(formatCost(undefined)).toBe("$0.00");
  });
});

describe("formatTokens", () => {
  it("formats token usage with labels", () => {
    const result = formatTokens({ total: 1500, input: 800, output: 700 });
    expect(result).toContain("1,500");
    expect(result).toContain("in:800");
    expect(result).toContain("out:700");
  });

  it("includes reasoning when present", () => {
    const result = formatTokens({ total: 100, reasoning: 50 });
    expect(result).toContain("think:50");
  });

  it("returns empty string for null", () => {
    expect(formatTokens(null)).toBe("");
    expect(formatTokens(undefined)).toBe("");
  });
});

describe("truncate", () => {
  it("returns text unchanged when under limit", () => {
    expect(truncate("short", 100)).toBe("short");
  });

  it("returns full text when expand is true", () => {
    const long = "x".repeat(200);
    expect(truncate(long, 50, true)).toBe(long);
  });

  it("truncates with head/tail and omission notice", () => {
    const long = "x".repeat(100);
    const result = truncate(long, 20, false);
    expect(result).toContain("truncated");
    expect(result.length).toBeLessThan(100);
    expect(result.startsWith("x")).toBe(true);
    expect(result.endsWith("x")).toBe(true);
  });
});

describe("renderToolPart", () => {
  it("renders bash tool with command", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "echo hello", description: "Say hello" },
          output: "hello",
        },
      },
      false,
    );
    expect(lines.some((l) => l.includes("Say hello"))).toBe(true);
    expect(lines.some((l) => l === "```bash")).toBe(true);
    expect(lines.some((l) => l === "echo hello")).toBe(true);
  });

  it("renders edit tool with diff", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "edit",
        state: {
          status: "completed",
          input: {
            filePath: "src/app.ts",
            oldString: "const x = 1",
            newString: "const x = 2",
          },
        },
      },
      false,
    );
    expect(lines.some((l) => l.includes("Edit"))).toBe(true);
    expect(lines.some((l) => l === "```diff")).toBe(true);
    expect(lines.some((l) => l === "- const x = 1")).toBe(true);
    expect(lines.some((l) => l === "+ const x = 2")).toBe(true);
  });

  it("renders read tool with file path", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "read",
        state: {
          status: "completed",
          input: { filePath: "src/app.ts" },
        },
      },
      false,
    );
    expect(lines.some((l) => l.includes("Read"))).toBe(true);
    expect(lines.some((l) => l.includes("src/app.ts"))).toBe(true);
  });

  it("renders write tool with content", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "write",
        state: {
          status: "completed",
          input: {
            filePath: "test.ts",
            content: "export const x = 1;",
          },
        },
      },
      false,
    );
    expect(lines.some((l) => l === "```typescript")).toBe(true);
    expect(lines.some((l) => l === "export const x = 1;")).toBe(true);
  });

  it("renders todowrite tool", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "todowrite",
        state: {
          status: "completed",
          input: {
            todos: [
              { content: "Task 1", status: "completed", priority: "high" },
              { content: "Task 2", status: "in_progress", priority: "medium" },
            ],
          },
        },
      },
      false,
    );
    expect(lines[0]).toBe("**Todos:**");
    expect(lines.some((l) => l.includes("✓ Task 1"))).toBe(true);
    expect(lines.some((l) => l.includes("▶ Task 2"))).toBe(true);
  });

  it("renders unknown tools as JSON", () => {
    const lines = renderToolPart(
      {
        type: "tool",
        tool: "custom_tool",
        state: {
          status: "completed",
          input: { key: "value" },
        },
      },
      false,
    );
    expect(lines.some((l) => l === "```json")).toBe(true);
    expect(lines.some((l) => l.includes('"key"'))).toBe(true);
  });
});

describe("renderMessageBlock", () => {
  it("renders user messages as plain text", () => {
    const lines = renderMessageBlock(messages[0]!, {});
    expect(lines).toContain("Hello, can you help me?");
  });

  it("renders assistant messages with text and tools", () => {
    const lines = renderMessageBlock(messages[1]!, {});
    expect(lines.some((l) => l.includes("Sure! Let me check"))).toBe(true);
    expect(lines.some((l) => l === "```bash")).toBe(true);
    expect(lines.some((l) => l.includes("I can see the files"))).toBe(true);
  });

  it("hides reasoning when expand is false", () => {
    const lines = renderMessageBlock(
      {
        info: { role: "assistant" },
        parts: [
          { type: "reasoning", text: "secret thought" },
          { type: "text", text: "public answer" },
        ],
      },
      { expand: false },
    );
    expect(lines.some((l) => l.includes("secret thought"))).toBe(false);
    expect(lines).toContain("public answer");
  });

  it("shows reasoning when expand is true", () => {
    const lines = renderMessageBlock(
      {
        info: { role: "assistant" },
        parts: [
          { type: "reasoning", text: "secret thought" },
          { type: "text", text: "public answer" },
        ],
      },
      { expand: true },
    );
    expect(lines.some((l) => l.includes("Reasoning"))).toBe(true);
    expect(lines.some((l) => l.includes("secret thought"))).toBe(true);
  });
});

describe("renderSessionRow", () => {
  it("renders session with title, timestamps, and directory", () => {
    const lines = renderSessionRow(
      {
        id: "ses_test123",
        title: "Test Session",
        updated: 1719900000000,
        created: 1719800000000,
        directory: "/home/user/project",
      },
      0,
    );
    expect(lines[0]).toBe("### 1. `ses_test123`");
    expect(lines.some((l) => l.includes("Test Session"))).toBe(true);
    expect(lines.some((l) => l.includes("/home/user/project"))).toBe(true);
  });

  it("handles missing directory", () => {
    const lines = renderSessionRow(
      {
        id: "ses_test456",
        title: "No Dir",
        updated: 1719900000000,
        created: 1719800000000,
      },
      2,
    );
    expect(lines[0]).toBe("### 3. `ses_test456`");
    expect(lines.every((l) => !l.includes("dir:"))).toBe(true);
  });

  it("handles missing title", () => {
    const lines = renderSessionRow(
      { id: "ses_notitle", updated: 1719900000000 },
      0,
    );
    expect(lines.some((l) => l.includes("(untitled)"))).toBe(true);
  });
});

describe("filterVisible", () => {
  it("filters out messages with empty text", () => {
    const visible = filterVisible(messages);
    const emptyMsg = messages.find(
      (m) =>
        m.info.role === "user" &&
        m.parts?.some(
          (p) => p.type === "text" && (p as { text?: string }).text === "",
        ),
    );
    expect(emptyMsg).toBeDefined();
    expect(visible).not.toContain(emptyMsg);
  });

  it("keeps messages with tool output", () => {
    const visible = filterVisible(messages);
    const toolMsg = messages.find(
      (m) =>
        m.info.role === "assistant" &&
        m.parts?.some((p) => p.type === "tool"),
    );
    expect(toolMsg).toBeDefined();
    expect(visible).toContain(toolMsg);
  });

  it("returns all non-empty messages", () => {
    const visible = filterVisible(messages);
    expect(visible.length).toBe(messages.length - 1);
  });
});
