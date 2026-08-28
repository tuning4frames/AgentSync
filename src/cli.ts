#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import path from "node:path";
import { loadConfig, resolveConfigPaths, createDefaultConfig } from "./config.js";
import { sync } from "./sync.js";
import { computeDiff, formatDiffResult } from "./diff.js";
import { watch } from "./watcher.js";
import type { SyncDirection } from "./types.js";

const program = new Command();

program
  .name("agents-sync")
  .description(
    "Bidirectional sync between AGENTS.md (Codex/Cursor/Copilot) and CLAUDE.md/.claude/skills (Claude Code)\n" +
      "Solves drift from GitHub Issue #6235 — 3,020 upvotes, 60k+ repos",
  )
  .version("1.0.0");

program
  .command("sync")
  .description("Bidirectional sync (last-write-wins with hash tracking)")
  .option("-d, --direction <direction>", "sync direction: bidirectional | agents->claude | claude->agents", "bidirectional")
  .option("--dry-run", "show what would be synced without writing", false)
  .option("-v, --verbose", "verbose output", false)
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory", process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.cwd);
    const direction = opts.direction as SyncDirection;
    if (!["bidirectional", "agents->claude", "claude->agents"].includes(direction)) {
      console.error(chalk.red(`Invalid direction: ${direction}`));
      process.exit(1);
    }
    try {
      const rawConfig = await loadConfig(cwd, opts.config);
      const config = resolveConfigPaths(cwd, rawConfig);
      const result = await sync(cwd, config, {
        direction,
        dryRun: Boolean(opts.dryRun),
        verbose: Boolean(opts.verbose) || Boolean(opts.dryRun),
        cwd,
        configPath: opts.config,
      });

      if (!opts.verbose && !opts.dryRun) {
        if (result.synced.length > 0) {
          console.log(chalk.green(`✓ Synced ${result.synced.length} file(s)`));
          for (const op of result.synced) {
            console.log(`  ${chalk.cyan(op.from)} → ${chalk.cyan(op.to)} (${op.reason})`);
          }
        } else {
          console.log(chalk.green("✓ Already in sync"));
        }
        if (result.conflicts.length > 0) {
          console.log(chalk.yellow(`⚠ ${result.conflicts.length} conflict(s) resolved via last-write-wins`));
          for (const c of result.conflicts) {
            console.log(`  ${c.fileA} ↔ ${c.fileB} winner: ${c.winner}`);
          }
        }
      }

      if (opts.dryRun && result.synced.length > 0) {
        console.log(chalk.yellow("\n(dry-run) no files were written"));
      }
    } catch (err) {
      console.error(chalk.red(`Sync failed: ${(err as Error).message}`));
      if (opts.verbose) console.error(err);
      process.exit(1);
    }
  });

program
  .command("check")
  .description("Check if files are in sync (exit 1 if drift detected, for CI)")
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory", process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.cwd);
    try {
      const rawConfig = await loadConfig(cwd, opts.config);
      const config = resolveConfigPaths(cwd, rawConfig);
      const diff = await computeDiff(cwd, config);
      if (diff.hasDiff) {
        console.log(formatDiffResult(diff));
        console.log(chalk.red("\n✖ Drift detected — run `agents-sync sync` to fix"));
        process.exit(1);
      } else {
        console.log(chalk.green("✓ No drift — AGENTS.md and CLAUDE.md are in sync"));
        process.exit(0);
      }
    } catch (err) {
      console.error(chalk.red(`Check failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("diff")
  .description("Show colored diff between AGENTS.md ↔ CLAUDE.md and skills")
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory", process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.cwd);
    try {
      const rawConfig = await loadConfig(cwd, opts.config);
      const config = resolveConfigPaths(cwd, rawConfig);
      const diff = await computeDiff(cwd, config);
      console.log(formatDiffResult(diff));
      process.exit(diff.hasDiff ? 1 : 0);
    } catch (err) {
      console.error(chalk.red(`Diff failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("watch")
  .description("Watch files and auto-sync on change")
  .option("-d, --direction <direction>", "sync direction", "bidirectional")
  .option("-v, --verbose", "verbose output", true)
  .option("-c, --config <path>", "path to config file")
  .option("--cwd <path>", "working directory", process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.cwd);
    const direction = opts.direction as SyncDirection;
    if (!["bidirectional", "agents->claude", "claude->agents"].includes(direction)) {
      console.error(chalk.red(`Invalid direction: ${direction}`));
      process.exit(1);
    }
    try {
      const rawConfig = await loadConfig(cwd, opts.config);
      const config = resolveConfigPaths(cwd, rawConfig);
      await watch(cwd, config, {
        direction,
        dryRun: false,
        verbose: true,
        cwd,
        configPath: opts.config,
      });
    } catch (err) {
      console.error(chalk.red(`Watch failed: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("init")
  .description("Create default .agents-sync.config.json")
  .option("-f, --force", "overwrite existing config", false)
  .option("--cwd <path>", "working directory", process.cwd())
  .action(async (opts) => {
    const cwd = path.resolve(opts.cwd);
    try {
      const target = await createDefaultConfig(cwd, Boolean(opts.force));
      console.log(chalk.green(`✓ Created config at ${target}`));
      console.log(chalk.dim("\nEdit the file to customize paths:"));
      console.log(chalk.dim("  agentsPath: AGENTS.md"));
      console.log(chalk.dim("  claudePath: CLAUDE.md"));
      console.log(chalk.dim("  agentsSkillsDir: .agents/skills"));
      console.log(chalk.dim("  claudeSkillsDir: .claude/skills"));
      console.log(chalk.dim("\nNext: run `agents-sync sync` or `agents-sync check`"));
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program.parse();
