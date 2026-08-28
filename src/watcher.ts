import path from "node:path";
import chalk from "chalk";
import chokidar from "chokidar";
import type { ResolvedConfig } from "./config.js";
import type { SyncOptions } from "./types.js";
import { sync } from "./sync.js";

export async function watch(
  cwd: string,
  config: ResolvedConfig,
  opts: SyncOptions,
): Promise<void> {
  const watchPaths = [
    config.absAgentsPath,
    config.absClaudePath,
    config.absAgentsSkillsDir,
    config.absClaudeSkillsDir,
  ];

  console.log(chalk.cyan.bold("👀 Watching for changes..."));
  console.log(chalk.dim(`  AGENTS.md: ${path.relative(cwd, config.absAgentsPath)}`));
  console.log(chalk.dim(`  CLAUDE.md: ${path.relative(cwd, config.absClaudePath)}`));
  console.log(chalk.dim(`  .agents/skills: ${path.relative(cwd, config.absAgentsSkillsDir)}`));
  console.log(chalk.dim(`  .claude/skills: ${path.relative(cwd, config.absClaudeSkillsDir)}`));
  console.log(chalk.dim(`  Direction: ${opts.direction} | Press Ctrl+C to exit\n`));

  let debounceTimer: NodeJS.Timeout | null = null;
  let isSyncing = false;
  let pending = false;

  const triggerSync = (changedPath?: string) => {
    if (changedPath) {
      console.log(chalk.dim(`\n[change] ${path.relative(cwd, changedPath)}`));
    }
    if (isSyncing) {
      pending = true;
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      isSyncing = true;
      try {
        const result = await sync(cwd, config, { ...opts, verbose: true });
        if (result.synced.length > 0) {
          console.log(chalk.green(`  ↳ Synced ${result.synced.length} file(s) at ${new Date().toLocaleTimeString()}`));
        }
        if (result.conflicts.length > 0) {
          console.log(chalk.yellow(`  ⚠ ${result.conflicts.length} conflict(s) resolved via last-write-wins`));
        }
      } catch (err) {
        console.error(chalk.red(`  ✖ Sync failed: ${(err as Error).message}`));
      } finally {
        isSyncing = false;
        if (pending) {
          pending = false;
          triggerSync();
        }
      }
    }, 250);
  };

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    ignored: (p: string) => p.includes(".agents-sync.state.json") || p.includes("node_modules"),
  });

  watcher
    .on("add", (p) => triggerSync(p))
    .on("change", (p) => triggerSync(p))
    .on("unlink", (p) => triggerSync(p))
    .on("error", (err) => console.error(chalk.red(`Watcher error: ${err}`)));

  // Initial sync on start?
  console.log(chalk.dim("Performing initial sync..."));
  await sync(cwd, config, { ...opts, verbose: true });

  // Keep process alive
  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\n\nStopping watcher..."));
    await watcher.close();
    process.exit(0);
  });
}
