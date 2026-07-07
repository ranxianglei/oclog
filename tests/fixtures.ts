import type {
  ExportPayload,
  RawMessage,
  SessionInfo,
  SessionListItem,
} from "../src/types.js";

export const sessions: SessionListItem[] = [
  {
    id: "ses_abc123def456",
    title: "Fix auth bug",
    updated: 1719900000000,
    created: 1719800000000,
    projectId: "proj_auth",
    directory: "/home/user/auth",
  },
  {
    id: "ses_xyz789ghi012",
    title: "Add dark mode",
    updated: 1719950000000,
    created: 1719900000000,
    projectId: "proj_ui",
    directory: "/home/user/ui",
  },
  {
    id: "ses_duplicate001",
    title: "Fix tests",
    updated: 1719960000000,
    created: 1719910000000,
  },
  {
    id: "ses_duplicate002",
    title: "Fix lint errors",
    updated: 1719970000000,
    created: 1719920000000,
  },
];

export const sessionInfo: SessionInfo = {
  id: "ses_abc123def456",
  title: "Fix auth bug",
  directory: "/home/user/auth",
  time: { created: 1719800000000, updated: 1719900000000 },
};

function msg(
  role: string,
  parts: RawMessage["parts"],
  overrides: Record<string, unknown> = {},
): RawMessage {
  return {
    info: {
      id: `msg_${Math.random().toString(36).slice(2, 10)}`,
      role,
      time: { created: 1719850000000 },
      ...overrides,
    },
    parts,
  };
}

export const messages: RawMessage[] = [
  msg("user", [{ type: "text", text: "Hello, can you help me?" }]),
  msg(
    "assistant",
    [
      { type: "text", text: "Sure! Let me check the code." },
      {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "ls -la", description: "List files" },
          output: "total 32\ndrwxr-xr-x  2 user user 4096 Jun  2 10:00 .",
        },
      },
      { type: "text", text: "I can see the files." },
    ],
    { cost: 0.05, tokens: { total: 1500, input: 800, output: 700 } },
  ),
  msg(
    "assistant",
    [
      {
        type: "tool",
        tool: "write",
        state: {
          status: "completed",
          input: {
            filePath: "/home/user/auth/login.ts",
            content: "export function login() { return true; }",
          },
        },
      },
    ],
    { cost: 0.03, tokens: { total: 500, output: 200 } },
  ),
  msg(
    "assistant",
    [
      {
        type: "tool",
        tool: "edit",
        state: {
          status: "completed",
          input: {
            filePath: "/home/user/auth/login.ts",
            oldString: "return true",
            newString: "return false",
          },
        },
      },
    ],
  ),
  msg("user", [{ type: "text", text: "" }]),
];

export const exportPayload: ExportPayload = {
  info: sessionInfo,
  messages,
};
