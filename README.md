# AgentSync

A little CLI I made because `AGENTS.md` (Codex / Cursor / Copilot) and `CLAUDE.md` (Claude Code) kept drifting apart in the same repo.

It keeps them in sync bidirectionally and also mirrors `.agents/skills/*.md` ↔ `.claude/skills/*.md` so you don't have to edit two places.

## Features

- bidirectional sync, last-write-wins with hash tracking in `.agents-sync.state.json`
- maps `AGENTS.md` ↔ `CLAUDE.md` and `.agents/skills/*.md` ↔ `.claude/skills/*.md`
- frontmatter-aware (YAML) and section-aware
- `check` for CI (exit 1 on drift), `diff` with colored unified diff, `watch` with auto-sync
- dry-run, explicit direction (`agents->claude` / `claude->agents`), custom cwd/config
- no telemetry, no network access

## Requirements

- Windows 10/11 or macOS/Linux
- Node.js 18+

## Getting started

```bash
# one-off
npx agents-sync-cli sync
npx agents-sync-cli check   # CI: exit 1 if drift

# project
npm i -D agents-sync-cli
npx agents-sync sync --verbose
```

Or install globally:

```bash
npm i -g agents-sync-cli
agents-sync --help
```

## Commands

**init** — create config:

```bash
agents-sync init
# creates .agents-sync.config.json
```

```json
{
  "agentsPath": "AGENTS.md",
  "claudePath": "CLAUDE.md",
  "agentsSkillsDir": ".agents/skills",
  "claudeSkillsDir": ".claude/skills"
}
```

**sync** — bidirectional sync:

```bash
agents-sync sync                          # bidirectional, last-write-wins
agents-sync sync --direction agents->claude
agents-sync sync --dry-run                # preview without writing
agents-sync sync --verbose --cwd ./my-project
```

**check** — CI guard:

```bash
agents-sync check
```

**diff** — show drift:

```bash
agents-sync diff
```

**watch** — auto-sync on change:

```bash
agents-sync watch
```

## How it works

1. Loads `.agents-sync.config.json` (or defaults) and `.agents-sync.state.json` (hashes + mtime of last sync).
2. For each pair (`AGENTS.md` ↔ `CLAUDE.md`, each `*.md` under skills dirs):
   - hashes equal → skip
   - one side missing → copy existing to missing
   - `--direction` forced → copy accordingly
   - otherwise bidirectional: if only one changed since last sync → copy changed to unchanged, if both changed → last-write-wins via `mtimeMs`
3. Writes files (ensuring parent dirs) and updates state.

Hash tracking avoids churn from `git checkout` resetting mtimes.

## Project layout

All source lives in `src/`, tests in `tests/`. Examples in `examples/`.

| Path | Purpose |
|------|---------|
| `src/cli.ts` | commander program: sync/check/diff/watch/init |
| `src/sync.ts` | sync logic, hash tracking, skills glob |
| `src/parser.ts` | frontmatter + section extraction |
| `src/config.ts` | load config, defaults, path resolution |
| `src/diff.ts` | unified diff with chalk |
| `src/watcher.ts` | chokidar watch, debounced 250ms |
| `src/utils.ts` | hashing, file helpers |

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest
```

Examples: `examples/AGENTS.md` and `examples/CLAUDE.md`.

## License

MIT
