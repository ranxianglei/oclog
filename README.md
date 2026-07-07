# oclog

**OpenCode session log viewer** — tail, follow, search, and export your [OpenCode](https://github.com/opencode-ai/opencode) session logs from the terminal.

## Install

```bash
npm install -g oclog
```

## Quick Start

```bash
oclog                                    # list recent sessions
oclog <session-id>                       # view session (tail mode)
oclog <session-id> --all                 # full session export
oclog -f <session-id>                    # follow session (live tail)
oclog <keyword>                          # search by title/ID
oclog <session-id> -o session.md         # export to markdown file
oclog <session-id> -j                    # raw JSON export
```

## Commands

| Command | Description |
|---------|-------------|
| `oclog` | List the 10 most recent sessions |
| `oclog <target>` | View session (tail last 10 messages by default) |
| `oclog <target> --all` | View full session |
| `oclog -f <target>` | Follow session live (polls every 2s) |
| `oclog <target> -n <N>` | Tail last N messages |
| `oclog <target> -j` | Export session as JSON |
| `oclog <target> -o <file>` | Write session to file |

`<target>` can be a full session ID, an ID prefix, or a title keyword.

## Options

| Flag | Description |
|------|-------------|
| `-n, --tail <N>` | Number of messages to show (default: 10) |
| `-a, --all` | Show all messages |
| `-f, --follow` | Follow session live |
| `-j, --json` | Output raw JSON |
| `-r, --raw` | Raw markdown output (no ANSI colors) |
| `-e, --expand` | Expand truncated content, show reasoning |
| `-p, --pager` | Use pager (less) |
| `-o, --output <file>` | Write output to file |
| `-i, --interval <sec>` | Follow poll interval (default: 2) |
| `--version` | Show version |
| `--help` | Show help |

## Development

```bash
git clone <repo-url>
cd oclog
npm install
npm run dev          # run via tsx (no build needed)
npm test             # run tests
npm run lint         # type check
npm run build        # build to dist/
```

## Tech Stack

- **TypeScript** (strict mode)
- **chalk** — terminal colors
- **tsup** — bundler
- **vitest** — test framework

## License

MIT
