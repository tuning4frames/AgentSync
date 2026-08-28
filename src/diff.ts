import { promises as fs } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { createTwoFilesPatch } from "diff";
import { globby } from "globby";
import type { DiffResult, FileDiff } from "./types.js";
import type { ResolvedConfig } from "./config.js";
import { fileExists } from "./utils.js";

export async function computeDiff(
  cwd: string,
  config: ResolvedConfig,
): Promise<DiffResult> {
  const diffs: FileDiff[] = [];

  // Main files
  const mainDiff = await diffFilePair(
    config.absAgentsPath,
    config.absClaudePath,
    cwd,
  );
  if (mainDiff) diffs.push(mainDiff);

  // Skills directories
  const skillDiffs = await diffSkillsDirs(cwd, config);
  diffs.push(...skillDiffs);

  const hasDiff = diffs.some((d) => d.unifiedDiff !== undefined || d.reason !== undefined);
  // Also consider missing counterpart as diff
  return { hasDiff, diffs };
}

async function diffFilePair(
  absA: string,
  absB: string,
  cwd: string,
): Promise<FileDiff | null> {
  const relA = path.relative(cwd, absA) || path.basename(absA);
  const relB = path.relative(cwd, absB) || path.basename(absB);
  const existsA = await fileExists(absA);
  const existsB = await fileExists(absB);

  if (!existsA && !existsB) {
    return null; // neither exists, no diff
  }

  if (!existsA || !existsB) {
    return {
      fileA: relA,
      fileB: relB,
      existsA,
      existsB,
      reason: !existsA ? `${relA} missing` : `${relB} missing`,
    };
  }

  const [contentA, contentB] = await Promise.all([
    fs.readFile(absA, "utf-8"),
    fs.readFile(absB, "utf-8"),
  ]);

  if (contentA === contentB) {
    return {
      fileA: relA,
      fileB: relB,
      existsA: true,
      existsB: true,
    };
  }

  const patch = createTwoFilesPatch(relA, relB, contentA, contentB, "", "", {
    context: 3,
  });

  return {
    fileA: relA,
    fileB: relB,
    existsA: true,
    existsB: true,
    unifiedDiff: patch,
  };
}

async function diffSkillsDirs(
  cwd: string,
  config: ResolvedConfig,
): Promise<FileDiff[]> {
  const diffs: FileDiff[] = [];

  const agentsExists = await fileExists(config.absAgentsSkillsDir);
  const claudeExists = await fileExists(config.absClaudeSkillsDir);

  if (!agentsExists && !claudeExists) return diffs;

  // Collect skill files from both dirs
  const [agentsFiles, claudeFiles] = await Promise.all([
    agentsExists
      ? globby("**/*.md", { cwd: config.absAgentsSkillsDir, gitignore: false })
      : Promise.resolve([] as string[]),
    claudeExists
      ? globby("**/*.md", { cwd: config.absClaudeSkillsDir, gitignore: false })
      : Promise.resolve([] as string[]),
  ]);

  const allRelative = new Set<string>([...agentsFiles, ...claudeFiles]);

  for (const rel of allRelative) {
    const absA = path.join(config.absAgentsSkillsDir, rel);
    const absB = path.join(config.absClaudeSkillsDir, rel);
    // Apply ignore patterns via config? For simplicity, skip if matches ignore? globby already handles? Keep simple.
    const diff = await diffFilePair(absA, absB, cwd);
    if (diff) {
      // Only push if there's actual diff or missing
      const hasDiff = diff.unifiedDiff !== undefined || diff.reason !== undefined;
      // diffFilePair when contents equal returns without unifiedDiff but with exists true
      // We consider equal => not a diff to report
      if (hasDiff) diffs.push(diff);
    }
  }

  return diffs;
}

export function formatDiffResult(result: DiffResult): string {
  const lines: string[] = [];

  if (!result.hasDiff) {
    lines.push(chalk.green("✓ No drift detected — AGENTS.md and CLAUDE.md are in sync."));
    return lines.join("\n");
  }

  lines.push(chalk.yellow.bold(`Drift detected: ${result.diffs.filter((d) => d.unifiedDiff || d.reason).length} file(s) differ`));
  lines.push("");

  for (const d of result.diffs) {
    if (!d.unifiedDiff && !d.reason) continue; // in sync file, skip

    const header = `${d.fileA} ${chalk.dim("↔")} ${d.fileB}`;
    lines.push(chalk.bold(header));

    if (d.reason) {
      lines.push(chalk.yellow(`  ⚠ ${d.reason}`));
      lines.push(chalk.dim(`    → sync will copy existing file to missing location`));
      lines.push("");
      continue;
    }

    if (d.unifiedDiff) {
      const colored = colorizePatch(d.unifiedDiff);
      lines.push(colored);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function colorizePatch(patch: string): string {
  return patch
    .split("\n")
    .map((line) => {
      if (line.startsWith("+++") || line.startsWith("---")) return chalk.bold(line);
      if (line.startsWith("@@")) return chalk.cyan(line);
      if (line.startsWith("+")) return chalk.green(line);
      if (line.startsWith("-")) return chalk.red(line);
      return chalk.dim(line);
    })
    .join("\n");
}

export function hasDrift(result: DiffResult): boolean {
  return result.hasDiff;
}
