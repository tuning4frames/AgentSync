import { promises as fs } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { globby } from "globby";
import type { ResolvedConfig } from "./config.js";
import type { SyncOptions, SyncResult, SyncState, SyncOperation, ConflictInfo } from "./types.js";
import { fileExists, hashContent, hashFile, getMtimeMs, writeFileEnsureDir } from "./utils.js";

export async function sync(
  cwd: string,
  config: ResolvedConfig,
  opts: SyncOptions,
): Promise<SyncResult> {
  const state = await loadState(config.absStatePath);
  const result: SyncResult = {
    synced: [],
    skipped: [],
    conflicts: [],
    dryRun: opts.dryRun,
  };

  // Sync main files
  await syncPair(
    config.absAgentsPath,
    config.absClaudePath,
    cwd,
    config,
    state,
    opts,
    result,
  );

  // Sync skills dirs
  await syncSkills(cwd, config, state, opts, result);

  if (!opts.dryRun) {
    state.lastSync = new Date().toISOString();
    await saveState(config.absStatePath, state);
  }

  if (opts.verbose) {
    printResult(result, opts.dryRun);
  }

  return result;
}

async function syncPair(
  absAgents: string,
  absClaude: string,
  cwd: string,
  config: ResolvedConfig,
  state: SyncState,
  opts: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const relAgents = path.relative(cwd, absAgents) || config.agentsPath;
  const relClaude = path.relative(cwd, absClaude) || config.claudePath;

  const existsAgents = await fileExists(absAgents);
  const existsClaude = await fileExists(absClaude);

  if (!existsAgents && !existsClaude) {
    result.skipped.push(`${relAgents} ↔ ${relClaude} (neither exists)`);
    return;
  }

  // One side missing => copy existing to missing
  if (existsAgents && !existsClaude) {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "missing-target", config, state, opts, result);
    return;
  }
  if (!existsAgents && existsClaude) {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "missing-target", config, state, opts, result);
    return;
  }

  // Both exist
  const [hashAgents, hashClaude] = await Promise.all([
    hashFile(absAgents, config.hashAlgorithm),
    hashFile(absClaude, config.hashAlgorithm),
  ]);

  if (hashAgents === null || hashClaude === null) {
    result.skipped.push(`${relAgents} ↔ ${relClaude} (hash failed)`);
    return;
  }

  if (hashAgents === hashClaude) {
    // Already same content
    result.skipped.push(`${relAgents} ↔ ${relClaude} (identical)`);
    // Update state to reflect current hash
    await updateStateEntry(state, relAgents, hashAgents);
    await updateStateEntry(state, relClaude, hashClaude);
    // For main files we store under normalized keys
    state.files[relAgents] = { hash: hashAgents, mtimeMs: (await getMtimeMs(absAgents)) ?? Date.now(), syncedAt: new Date().toISOString() };
    state.files[relClaude] = { hash: hashClaude, mtimeMs: (await getMtimeMs(absClaude)) ?? Date.now(), syncedAt: new Date().toISOString() };
    return;
  }

  // Hashes differ -> need to decide winner
  const direction = opts.direction;

  if (direction === "agents->claude") {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "forced-direction", config, state, opts, result);
    return;
  }
  if (direction === "claude->agents") {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "forced-direction", config, state, opts, result);
    return;
  }

  // bidirectional: last-write-wins with hash tracking
  const prevAgentsHash = state.files[relAgents]?.hash ?? null;
  const prevClaudeHash = state.files[relClaude]?.hash ?? null;

  const agentsChanged = prevAgentsHash !== null ? hashAgents !== prevAgentsHash : true;
  const claudeChanged = prevClaudeHash !== null ? hashClaude !== prevClaudeHash : true;

  // Cases:
  // - Neither in state (first sync): use mtime
  // - One changed, one didn't: copy changed to unchanged
  // - Both changed: last-write-wins via mtime
  // - Neither changed but hashes differ and state missing? fallback to mtime

  if (!agentsChanged && !claudeChanged) {
    // State hashes equal to current but files differ? shouldn't happen because we checked hash equality above
    // but if state stale, fallback to mtime
    result.skipped.push(`${relAgents} ↔ ${relClaude} (state mismatch, fallback to mtime)`);
  }

  if (agentsChanged && !claudeChanged) {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "agents-newer", config, state, opts, result);
    return;
  }
  if (!agentsChanged && claudeChanged) {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "claude-newer", config, state, opts, result);
    return;
  }

  // Both changed or both not in state -> mtime wins
  const [mtimeAgents, mtimeClaude] = await Promise.all([
    getMtimeMs(absAgents),
    getMtimeMs(absClaude),
  ]);

  const agentsMtime = mtimeAgents ?? 0;
  const claudeMtime = mtimeClaude ?? 0;

  let winnerFrom: string;
  let winnerTo: string;
  let winnerAbsFrom: string;
  let winnerAbsTo: string;
  let reason: SyncOperation["reason"];

  if (agentsMtime >= claudeMtime) {
    winnerFrom = relAgents;
    winnerTo = relClaude;
    winnerAbsFrom = absAgents;
    winnerAbsTo = absClaude;
    reason = "agents-newer";
  } else {
    winnerFrom = relClaude;
    winnerTo = relAgents;
    winnerAbsFrom = absClaude;
    winnerAbsTo = absAgents;
    reason = "claude-newer";
  }

  // Record conflict if both changed
  if (agentsChanged && claudeChanged) {
    result.conflicts.push({
      fileA: relAgents,
      fileB: relClaude,
      reason: "both-modified",
      winner: winnerFrom,
      loser: winnerTo,
    });
  }

  await copyWithState(winnerAbsFrom, winnerAbsTo, winnerFrom, winnerTo, reason, config, state, opts, result);
}

async function syncSkills(
  cwd: string,
  config: ResolvedConfig,
  state: SyncState,
  opts: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const agentsExists = await fileExists(config.absAgentsSkillsDir);
  const claudeExists = await fileExists(config.absClaudeSkillsDir);

  if (!agentsExists && !claudeExists) {
    return;
  }

  const [agentsFiles, claudeFiles] = await Promise.all([
    agentsExists ? globby("**/*.md", { cwd: config.absAgentsSkillsDir }) : Promise.resolve([] as string[]),
    claudeExists ? globby("**/*.md", { cwd: config.absClaudeSkillsDir }) : Promise.resolve([] as string[]),
  ]);

  const all = new Set<string>([...agentsFiles, ...claudeFiles]);

  // Also handle ignore patterns? Simple filter
  for (const rel of all) {
    // skip if matches ignore? naive check
    if (config.ignore.some((pat) => rel.includes(pat.replace("**", "").replace("/*", "")))) {
      continue;
    }
    const absA = path.join(config.absAgentsSkillsDir, rel);
    const absB = path.join(config.absClaudeSkillsDir, rel);
    const relA = path.posix.join(config.agentsSkillsDir, rel);
    const relB = path.posix.join(config.claudeSkillsDir, rel);

    // Use syncPair-like but with skill-specific keys
    // We call generic sync for each skill file
    await syncSkillFile(absA, absB, relA, relB, cwd, config, state, opts, result);
  }
}

async function syncSkillFile(
  absAgents: string,
  absClaude: string,
  relAgents: string,
  relClaude: string,
  _cwd: string,
  config: ResolvedConfig,
  state: SyncState,
  opts: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const existsAgents = await fileExists(absAgents);
  const existsClaude = await fileExists(absClaude);

  if (!existsAgents && !existsClaude) return;

  if (existsAgents && !existsClaude) {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "missing-target", config, state, opts, result);
    return;
  }
  if (!existsAgents && existsClaude) {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "missing-target", config, state, opts, result);
    return;
  }

  const [hashA, hashB] = await Promise.all([
    hashFile(absAgents, config.hashAlgorithm),
    hashFile(absClaude, config.hashAlgorithm),
  ]);
  if (hashA === null || hashB === null) {
    result.skipped.push(`${relAgents} ↔ ${relClaude} (hash failed)`);
    return;
  }
  if (hashA === hashB) {
    result.skipped.push(`${relAgents} ↔ ${relClaude} (identical)`);
    state.files[relAgents] = { hash: hashA, mtimeMs: (await getMtimeMs(absAgents)) ?? Date.now(), syncedAt: new Date().toISOString() };
    state.files[relClaude] = { hash: hashB, mtimeMs: (await getMtimeMs(absClaude)) ?? Date.now(), syncedAt: new Date().toISOString() };
    return;
  }

  const direction = opts.direction;
  if (direction === "agents->claude") {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "forced-direction", config, state, opts, result);
    return;
  }
  if (direction === "claude->agents") {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "forced-direction", config, state, opts, result);
    return;
  }

  const prevA = state.files[relAgents]?.hash ?? null;
  const prevB = state.files[relClaude]?.hash ?? null;
  const changedA = prevA !== null ? hashA !== prevA : true;
  const changedB = prevB !== null ? hashB !== prevB : true;

  if (changedA && !changedB) {
    await copyWithState(absAgents, absClaude, relAgents, relClaude, "agents-newer", config, state, opts, result);
    return;
  }
  if (!changedA && changedB) {
    await copyWithState(absClaude, absAgents, relClaude, relAgents, "claude-newer", config, state, opts, result);
    return;
  }

  const [mtimeA, mtimeB] = await Promise.all([getMtimeMs(absAgents), getMtimeMs(absClaude)]);
  const mA = mtimeA ?? 0;
  const mB = mtimeB ?? 0;

  let from: string, to: string, absFrom: string, absTo: string, reason: SyncOperation["reason"];
  if (mA >= mB) {
    from = relAgents; to = relClaude; absFrom = absAgents; absTo = absClaude; reason = "agents-newer";
  } else {
    from = relClaude; to = relAgents; absFrom = absClaude; absTo = absAgents; reason = "claude-newer";
  }

  if (changedA && changedB) {
    result.conflicts.push({ fileA: relAgents, fileB: relClaude, reason: "both-modified", winner: from, loser: to });
  }

  await copyWithState(absFrom, absTo, from, to, reason, config, state, opts, result);
}

async function copyWithState(
  absFrom: string,
  absTo: string,
  relFrom: string,
  relTo: string,
  reason: SyncOperation["reason"],
  config: ResolvedConfig,
  state: SyncState,
  opts: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const content = await fs.readFile(absFrom, "utf-8");
  const hash = hashContent(content, config.hashAlgorithm);
  const op: SyncOperation = { from: relFrom, to: relTo, reason, hash };

  if (opts.dryRun) {
    result.synced.push(op);
    return;
  }

  await writeFileEnsureDir(absTo, content);
  result.synced.push(op);

  const mtime = (await getMtimeMs(absTo)) ?? Date.now();
  const now = new Date().toISOString();
  state.files[relFrom] = { hash, mtimeMs: (await getMtimeMs(absFrom)) ?? mtime, syncedAt: now };
  state.files[relTo] = { hash, mtimeMs: mtime, syncedAt: now };
}

async function updateStateEntry(state: SyncState, key: string, hash: string): Promise<void> {
  // placeholder, actual update done in callers
  if (!state.files[key]) {
    state.files[key] = { hash, mtimeMs: Date.now(), syncedAt: new Date().toISOString() };
  } else {
    state.files[key].hash = hash;
  }
}

export async function loadState(statePath: string): Promise<SyncState> {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw) as SyncState;
    if (!parsed.files) parsed.files = {};
    if (!parsed.version) parsed.version = 1;
    return parsed;
  } catch {
    return { version: 1, files: {} };
  }
}

export async function saveState(statePath: string, state: SyncState): Promise<void> {
  await writeFileEnsureDir(statePath, JSON.stringify(state, null, 2) + "\n");
}

function printResult(result: SyncResult, dryRun: boolean): void {
  const prefix = dryRun ? chalk.yellow("[dry-run] ") : "";
  for (const op of result.synced) {
    console.log(`${prefix}${chalk.green("sync")} ${chalk.cyan(op.from)} ${chalk.dim("→")} ${chalk.cyan(op.to)} ${chalk.dim(`(${op.reason})`)}`);
  }
  for (const s of result.skipped) {
    console.log(`${prefix}${chalk.dim("skip")} ${s}`);
  }
  for (const c of result.conflicts) {
    console.log(`${prefix}${chalk.yellow("conflict")} ${c.fileA} ↔ ${c.fileB} both modified, winner: ${chalk.bold(c.winner)}`);
  }
  if (result.synced.length === 0 && result.conflicts.length === 0) {
    console.log(chalk.green("✓ Already in sync"));
  } else if (dryRun) {
    console.log(chalk.yellow(`\n${result.synced.length} file(s) would be synced (dry-run)`));
  }
}
