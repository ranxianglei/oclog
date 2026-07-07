// snake_case fields mirror the opencode JSON wire format verbatim — do not "fix" to camelCase.

export interface SessionListItem {
  id: string;
  title?: string | null;
  updated?: number | null;
  created?: number | null;
  projectId?: string | null;
  directory?: string | null;
}

export interface ExportPayload {
  info: SessionInfo;
  messages: RawMessage[];
}

export interface SessionInfo {
  id?: string;
  slug?: string;
  projectID?: string;
  directory?: string;
  path?: string;
  title?: string;
  version?: string;
  summary?: { additions?: number; deletions?: number; files?: number };
  time?: { created?: number; updated?: number };
  [k: string]: unknown;
}

export type Role = "user" | "assistant" | "system" | string;

export interface RawMessage {
  info: MessageInfo;
  parts?: RawPart[];
}

export interface MessageInfo {
  id?: string;
  parentID?: string;
  role?: Role;
  mode?: string;
  agent?: string;
  path?: string;
  cost?: number;
  tokens?: TokenUsage;
  modelID?: string;
  providerID?: string;
  model?: { providerID?: string; modelID?: string };
  time?: { created?: number; updated?: number };
  finish?: string;
  sessionID?: string;
  [k: string]: unknown;
}

export interface TokenUsage {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { write?: number; read?: number };
}

export type RawPart = TextPart | ToolPart | ReasoningPart | StepPart;

export interface TextPart {
  type: "text";
  text?: string;
  id?: string;
}

export interface ToolPart {
  type: "tool";
  tool?: string;
  callID?: string;
  state?: ToolState;
  id?: string;
  sessionID?: string;
  messageID?: string;
}

export interface ToolState {
  status?: "completed" | "running" | "error" | string;
  input?: Record<string, unknown>;
  output?: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text?: string;
  id?: string;
}

export interface StepPart {
  type: "step-start" | "step-finish";
  id?: string;
}

export interface CliOptions {
  raw?: boolean;
  expand?: boolean;
  pager?: boolean;
  follow?: boolean;
  json?: boolean;
  output?: string;
  tail?: number;
  all?: boolean;
  interval?: number;
}
