---
title: AGENTS.md — Project Instructions for Codex/Cursor/Copilot
description: Shared agent instructions
version: 1.0.0
---

# AGENTS.md

> Instructions for AI coding agents (Codex, Cursor, Copilot, Windsurf). Synced bidirectionally with `CLAUDE.md` via `agents-sync`.

## Project Overview

This is a sample Next.js + TypeScript project. Follow the conventions below when contributing.

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS
- **Testing**: Vitest + Playwright

## Commands

```bash
npm install        # install deps
npm run dev        # start dev server
npm run build      # production build
npm test           # unit tests
npm run lint       # eslint
```

## Code Style

- Use ESM (`import`/`export`), `type` imports where possible
- Strict TypeScript: no `any`, prefer `unknown`
- Components: functional + hooks, colocate tests as `*.test.tsx`
- Commits: conventional commits (`feat:`, `fix:`, `chore:`)

## Architecture

- `src/app` — Next.js app router
- `src/components` — shared UI
- `src/lib` — utilities
- `src/skills` — agent skills (synced to `.claude/skills` and `.agents/skills`)

## Rules for Agents

1. **Always run `npm run lint` before opening a PR**
2. **Do not edit `dist/` or `.next/` — generated**
3. **Keep `AGENTS.md` and `CLAUDE.md` in sync** — run `npx agents-sync sync` before committing
4. **Prefer editing existing files over creating new ones**

## Skills

See `.agents/skills/` for reusable prompts:

- `code-review.md` — review checklist
- `commit.md` — commit message helper

## Notes

This file is intentionally similar to `CLAUDE.md`. Drift is resolved via `agents-sync` (last-write-wins, hash-tracked, supports `check --ci`).
