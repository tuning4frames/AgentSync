---
title: CLAUDE.md — Project Instructions for Claude Code
description: Shared instructions for Claude
version: 1.0.0
---

# CLAUDE.md

> Instructions for Claude Code. Synced bidirectionally with `AGENTS.md` via `agents-sync`.

## Project Overview

This is a sample Next.js + TypeScript project. Follow the conventions below when contributing. This file mirrors `AGENTS.md` — any change should be synced.

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

## Claude-Specific Instructions

- Use `Read` before `Edit` — never guess file content
- When planning, use `Task` agents for parallel exploration
- Keep responses concise; use file:line references
- After edits, run `npm run build` to verify

## Architecture

- `src/app` — Next.js app router
- `src/components` — shared UI
- `src/lib` — utilities
- `.claude/skills/` — Claude skills (synced from `.agents/skills/`)

## Rules

1. **Always run `npm run lint` before opening a PR**
2. **Do not edit `dist/` or `.next/` — generated**
3. **Keep `AGENTS.md` and `CLAUDE.md` in sync** — run `npx agents-sync sync` before committing
4. **If you edit this file, `agents-sync` will propagate to `AGENTS.md` on next `sync` or `watch`**

## Skills

See `.claude/skills/` for reusable skills:

- `code-review.md` — review checklist
- `commit.md` — commit message helper

## Notes

- **Sync tool**: `agents-sync` handles frontmatter, sections, and skill files.
- **State**: `.agents-sync.state.json` tracks hashes/mtime for last-write-wins.
- **CI**: Add `npx agents-sync check` to prevent drift.
