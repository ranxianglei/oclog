export class OclogError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "OclogError";
  }
}

export class SessionNotFound extends OclogError {
  constructor(readonly target: string) {
    super(
      `Session not found: ${target}`,
      "Run `oclog` with no args to list sessions, or use a longer ID prefix.",
    );
    this.name = "SessionNotFound";
  }
}

export class OpencodeUnavailable extends OclogError {
  constructor() {
    super(
      "`opencode` command not found or not executable",
      "Install opencode and ensure it's on your PATH.",
    );
    this.name = "OpencodeUnavailable";
  }
}

export class ExportError extends OclogError {
  constructor(readonly sessionId: string, detail: string) {
    super(`Failed to export session ${sessionId}: ${detail}`);
    this.name = "ExportError";
  }
}

export class AmbiguousTarget extends OclogError {
  constructor(readonly target: string, readonly count: number) {
    super(
      `Ambiguous target "${target}" — matches ${count} sessions`,
      "Use a longer ID prefix to disambiguate.",
    );
    this.name = "AmbiguousTarget";
  }
}
