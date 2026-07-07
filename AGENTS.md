# oclog Development Specification

> **This document is the highest-priority specification for this project. All developers (including AI Agents) MUST comply unconditionally.**

---

## 1. Project Overview

### 1.1 What Is oclog

**oclog** is a terminal-based session log viewer for [OpenCode](https://opencode.ai). It wraps the `opencode session list` and `opencode export` CLI commands, rendering session data as readable Markdown in the terminal — with ANSI colors, syntax-highlighted code blocks, live follow mode, and multi-format export.

Think of it as `tail -f` for OpenCode sessions: list recent sessions, tail a session's messages, follow live updates, search by keyword, and export to file.

### 1.2 Tech Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript (strict, ESM) |
| Runtime | Node.js >= 18 |
| Build | `tsup` (ESM bundling + DTS) |
| Test Runner | `vitest` |
| Package Manager | npm |
| Type Checking | `tsc --noEmit` |
| Terminal Colors | `chalk` |
| Linting | `tsc` (strict mode — no ESLint configured yet) |

### 1.3 Repository Info

| Field | Value |
|-------|-------|
| npm package | `oclog` |
| Current version | 0.1.0 |
| GitHub | https://github.com/ranxianglei/oclog |
| License | MIT |
| Entry point | `dist/cli.js` (bin: `oclog`) |

---

## 2. Architecture

### 2.1 Module Map

```
oclog/
├── src/
│   ├── cli.ts          # CLI entry — arg parsing + command routing + process exit
│   ├── oclog.ts        # Core I/O: listSessions, exportSession, resolveTarget, followSession
│   ├── format.ts       # Pure formatting: renderToolPart, renderMessageBlock, truncate, etc.
│   ├── output.ts       # Terminal output: emit (raw/render/strip), renderSessionList, renderExport
│   ├── types.ts        # Type definitions mirroring opencode JSON wire format
│   └── errors.ts       # Error class hierarchy (OclogError → specific errors)
├── tests/
│   ├── fixtures.ts     # Shared test data (sessions, messages, export payload)
│   ├── format.test.ts  # Pure function tests (31 tests)
│   └── oclog.test.ts   # resolveTarget tests (8 tests)
├── tsup.config.ts      # Build config (ESM, node18, DTS)
├── tsconfig.json       # TypeScript strict config
├── vitest.config.ts    # Test config
└── package.json
```

### 2.2 Core Data Flow

```
User runs: oclog <target>
    │
    ▼
cli.ts — parse args, route command
    │
    ├─► [list mode] oclog.listSessions()
    │       └─► spawn: opencode session list -n N --format json
    │       └─► output.renderSessionList() → emit to stdout
    │
    ├─► [view mode] oclog.resolveTarget(target, sessions)
    │       └─► exact ID → prefix match → title/keyword match
    │       └─► oclog.exportSession(id)
    │           └─► spawn: opencode export <id>  (stdout → temp file for large output)
    │       └─► output.renderExport() or renderTail() → emit
    │
    ├─► [follow mode] oclog.followSession(id, interval)
    │       └─► poll loop: exportSession → diff new messages → renderMessageStream
    │
    └─► [error] errors.ts → output.renderError() → process.exit(1)
```

### 2.3 Key Concepts

#### Target Resolution

`resolveTarget(target, sessions)` resolves a user-provided string to a session ID using a three-tier strategy:

1. **Exact match**: `target === session.id` → return immediately
2. **Prefix match**: `session.id.startsWith(target)` — if exactly one match, return; if multiple, throw `AmbiguousTarget`
3. **Keyword match**: `session.id.includes(target) || session.title.includes(target)` — same single/ambiguous logic

If nothing matches, throw `SessionNotFound`.

#### Tool Part Rendering

opencode messages use a **unified tool part** format (not separate `tool_use`/`tool_result`):

```typescript
{ type: "tool", tool: "bash", state: { status: "completed", input: {...}, output: "..." } }
```

`renderToolPart()` dispatches by `tool` name (`bash`, `read`, `write`, `edit`, `glob`, `grep`, `todowrite`, fallback) and renders Markdown blocks with appropriate code fences.

#### Truncation Strategy

Long content is truncated with head/tail preservation:

```
[first N/2 chars]

… [truncated X chars]

[last N/2 chars]
```

Constants: `TRUNCATE_DIFF = 4000`, `TRUNCATE_CODE = 4000`, `TRUNCATE_OUTPUT = 2000`. The `--expand` flag bypasses all truncation.

#### Output Modes

| Mode | Flag | Behavior |
|------|------|----------|
| Render (default) | — | Inline Markdown rendered to ANSI colors via `chalk` |
| Raw | `--raw` | Markdown output as-is, no ANSI codes (for piping to file/other tools) |
| JSON | `--json` | Raw `opencode export` JSON passthrough |

#### Bun Large Output Handling

`opencode export` can produce very large stdout (>256KB). On Bun, pipe-based `execFile` truncates output. The workaround redirects stdout to a temp file via `openSync` + `stdio` configuration, then reads the file. This is in `oclog.ts:exportSession()`.

### 2.4 Type System

Types in `types.ts` mirror the opencode JSON wire format **verbatim** — field names use snake_case (`projectID`, `parentID`, `modelID`) to match the API exactly. Do NOT rename to camelCase; the mismatch with wire format would require runtime mapping.

Key types:
- `SessionListItem` — session summary from `session list`
- `ExportPayload` — `{ info: SessionInfo, messages: RawMessage[] }` from `export`
- `RawMessage` — `{ info: MessageInfo, parts?: RawPart[] }`
- `RawPart` — union of `TextPart | ToolPart | ReasoningPart | StepPart`

---

## 3. Development Standards

### 3.1 Build Commands

```bash
npm run dev          # Run via tsx (no build needed for development)
npm run build        # tsup → dist/cli.js (ESM, node18, DTS)
npm run lint         # tsc --noEmit (type check only)
npm test             # vitest run
npm run test:watch   # vitest watch mode
```

### 3.2 Testing

**Test runner**: vitest

**Test structure**: Flat `tests/` directory. Two test files:

| File | Tests | Scope |
|------|-------|-------|
| `format.test.ts` | 31 | Pure formatting functions (no I/O, no side effects) |
| `oclog.test.ts` | 8 | `resolveTarget` logic (exact/prefix/keyword/ambiguous/not-found) |

**Test fixtures**: `tests/fixtures.ts` provides shared mock data (`sessions`, `messages`, `exportPayload`). Tests should import from fixtures rather than constructing ad-hoc data.

**Coverage philosophy**: Pure functions (formatting, resolution) get full unit test coverage. I/O functions (spawning opencode, terminal output) are tested via manual regression against real sessions.

**Regression test checklist** (run manually before release):
- `oclog` — lists recent sessions
- `oclog <id>` — tails session messages
- `oclog <id> --all` — full session
- `oclog -f <id>` — follow mode (verify polling + new message detection)
- `oclog <keyword>` — search by title
- `oclog <id> -j` — JSON export
- `oclog <id> --raw` — raw markdown (no ANSI)
- `oclog <id> --expand` — expanded content
- `oclog <id> -o file.md` — file output
- `oclog nonexistent` — error handling
- `oclog --help` / `oclog --version`

### 3.3 Build Output

- `dist/cli.js` — bundled ESM JavaScript (entry point, ~21KB)
- `dist/cli.d.ts` — TypeScript declarations
- `dist/cli.js.map` — source map

Published files (per `files` field): `dist/`, `README.md`, `LICENSE`

---

## 4. Code Change Guidelines

### 4.1 Module Dependencies

```
types.ts        ← (leaf — no internal deps, consumed by all)
errors.ts       ← (leaf — no internal deps)
    ↑
format.ts       ← depends on types only (pure functions)
    ↑
oclog.ts        ← depends on types, errors (I/O + resolution logic)
    ↑
output.ts       ← depends on types, format (terminal rendering)
    ↑
cli.ts          ← depends on all (entry point, orchestration)
```

**Rules**:
- `format.ts` functions MUST be pure — no `process`, no `console`, no I/O. This keeps them unit-testable.
- `oclog.ts` handles all `opencode` CLI interaction (spawn, JSON parsing).
- `output.ts` handles all terminal output (stdout/write/ANSI).
- `cli.ts` is the only module that calls `process.exit()`.
- `errors.ts` classes carry user-friendly messages + hints. Never throw raw `Error`.

### 4.2 Common Patterns

**Error handling**: Throw specific `OclogError` subclasses. `cli.ts` catches all errors at the top level and renders them via `output.renderError()`.

```typescript
// Good
throw new SessionNotFound(target);
throw new AmbiguousTarget(target, matches.length);

// Bad
throw new Error("session not found");
```

**Tool rendering dispatch**: `renderToolState()` uses if/else chains by tool name. When adding support for a new tool, add a branch in this function. Unknown tools fall back to JSON rendering.

**Optional catch binding**: Use `catch {}` (no parameter) when the error value is unused. Do not write `catch (_err) {}` or `catch (err) { /* unused */ }`.

**Type narrowing for tool input**: Tool input is `Record<string, unknown>`. Always narrow with `typeof` before use:

```typescript
const path = typeof input.filePath === "string" ? input.filePath : "";
```

### 4.3 Adding a New CLI Flag

1. Parse it in `cli.ts` arg parser
2. Add to `CliOptions` interface in `types.ts`
3. Thread it through to the relevant `format.ts` or `output.ts` function
4. Document in `--help` text and README options table
5. Add a test if it affects pure formatting logic

---

## 5. Contributing

### 5.1 Before Making Changes

1. Run `npm run lint` to ensure no type errors
2. Run `npm test` to ensure all tests pass
3. Understand the module dependency graph (Section 4.1)

### 5.2 Development Workflow

1. Create a feature branch from `main` (naming: `YYYY-MM-DD_short-title` or `feat/description`)
2. Implement changes
3. Ensure `npm run lint` and `npm run build` pass
4. Ensure `npm test` passes
5. Run manual regression tests (Section 3.2) if touching I/O or output
6. Commit with descriptive messages (conventional commits style)
7. Push branch and create a GitHub PR

### 5.3 Commit Convention

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat: add --grep flag for message content search
fix: resolve ambiguous prefix matching when exact ID exists
refactor: extract truncation constants to module level
chore: bump version to 0.2.0
docs: add AGENTS.md development guide
test: add renderMessageBlock reasoning visibility tests
```

### 5.4 Code Review

All changes should be reviewed before merge. Key checklist:

| Category | What to Check |
|----------|---------------|
| **Type safety** | No `as any`, no `@ts-ignore`, no `// eslint-disable` |
| **Pure vs I/O** | Formatting logic stays in `format.ts` (pure), I/O stays in `oclog.ts`/`output.ts` |
| **Error classes** | Specific `OclogError` subclasses, not raw `Error` |
| **Wire format** | Type field names match opencode JSON (snake_case) — no camelCase renaming |
| **Truncation** | Long outputs use `truncate()` with appropriate constants, not inline magic numbers |
| **Help text** | New flags documented in `--help` output and README |

### 5.5 Git Safety Rules

| Rule | Enforcement |
|------|-------------|
| **NEVER force-push to `main`** | Create a PR instead |
| **NEVER commit secrets** | No API keys, tokens, passwords, or credentials |
| **NEVER commit `node_modules/`** | Ensure `.gitignore` covers it |
| **NEVER disable type checking** | No `as any`, `@ts-ignore`, or `ts-expect-error` |

### 5.6 Privacy / Open Source Readiness

This project is open source. Before committing:

- No hardcoded absolute paths (`/home/user/...`) in source code (test fixtures are OK if they use generic placeholders)
- No IP addresses, tokens, or credentials in any file
- No internal/hosted service URLs
- Run `grep -rn -E '(192\.168|10\.0\.|token|secret|password|api[_-]?key)' src/` before release

---

## 6. Release Checklist

Before publishing a new version:

1. [ ] `npm run lint` passes (zero type errors)
2. [ ] `npm test` passes (all tests green)
3. [ ] `npm run build` succeeds
4. [ ] Manual regression tests pass (Section 3.2)
5. [ ] Privacy scan clean (Section 5.6)
6. [ ] Version bumped in `package.json`
7. [ ] `CHANGELOG.md` updated (if present)
8. [ ] README reflects current CLI flags
9. [ ] Git working tree clean, on `main`, synced with remote
10. [ ] Tag created: `git tag -a v{VERSION} -m "release v{VERSION}"`
