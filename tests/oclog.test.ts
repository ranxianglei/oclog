import { describe, it, expect } from "vitest";
import { resolveTarget } from "../src/oclog.js";
import { SessionNotFound, AmbiguousTarget } from "../src/errors.js";
import { sessions } from "./fixtures.js";

describe("resolveTarget", () => {
  it("matches exact session ID", () => {
    const id = resolveTarget("ses_abc123def456", sessions);
    expect(id).toBe("ses_abc123def456");
  });

  it("matches by prefix when unique", () => {
    const id = resolveTarget("ses_abc", sessions);
    expect(id).toBe("ses_abc123def456");
  });

  it("matches by title substring when unique", () => {
    const id = resolveTarget("auth bug", sessions);
    expect(id).toBe("ses_abc123def456");
  });

  it("matches by ID substring when unique", () => {
    const id = resolveTarget("xyz789", sessions);
    expect(id).toBe("ses_xyz789ghi012");
  });

  it("throws AmbiguousTarget when prefix matches multiple", () => {
    expect(() => resolveTarget("ses_dup", sessions)).toThrow(AmbiguousTarget);
  });

  it("throws AmbiguousTarget when keyword matches multiple titles", () => {
    expect(() => resolveTarget("Fix", sessions)).toThrow(AmbiguousTarget);
  });

  it("throws SessionNotFound when nothing matches", () => {
    expect(() => resolveTarget("nonexistent_id_12345", sessions)).toThrow(
      SessionNotFound,
    );
  });

  it("prefers exact ID over prefix match", () => {
    const exact = sessions[0]!;
    expect(resolveTarget(exact.id, sessions)).toBe(exact.id);
  });
});
