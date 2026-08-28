/**
 * Core types for agents-sync-cli
 */

export type SyncDirection = "bidirectional" | "agents->claude" | "claude->agents";

export interface SyncConfig {
  /** Path to AGENTS.md relative to project root */
  agentsPath: string;
  /** Path to CLAUDE.md relative to project root */
  claudePath: string;
  /** Directory for agent skills */
  agentsSkillsDir: string;
  /** Directory for claude skills */
  claudeSkillsDir: string;
  /** Glob patterns to ignore */
  ignore: string[];
  /** Hash algorithm */
  hashAlgorithm: "sha256" | "md5";
  /** State file path */
  statePath: string;
}

export interface SyncState {
  version: number;
  lastSync?: string;
  files: Record<string, FileState>;
}

export interface FileState {
  hash: string;
  mtimeMs: number;
  syncedAt: string;
}

export interface ParsedMarkdown {
  /** Raw file content */
  raw: string;
  /** Frontmatter data (if any) */
  frontmatter: Record<string, unknown>;
  /** Content without frontmatter */
  content: string;
  /** Top-level sections keyed by heading */
  sections: MarkdownSection[];
  /** Whether file had frontmatter */
  hasFrontmatter: boolean;
}

export interface MarkdownSection {
  heading: string;
  level: number;
  content: string;
  raw: string;
}

export interface SyncOptions {
  direction: SyncDirection;
  dryRun: boolean;
  verbose: boolean;
  cwd: string;
  configPath?: string;
}

export interface SyncResult {
  synced: SyncOperation[];
  skipped: string[];
  conflicts: ConflictInfo[];
  dryRun: boolean;
}

export interface SyncOperation {
  from: string;
  to: string;
  reason: "agents-newer" | "claude-newer" | "missing-target" | "forced-direction" | "initial-sync";
  hash: string;
}

export interface ConflictInfo {
  fileA: string;
  fileB: string;
  reason: "both-modified";
  winner: string;
  loser: string;
}

export interface DiffResult {
  hasDiff: boolean;
  diffs: FileDiff[];
}

export interface FileDiff {
  fileA: string;
  fileB: string;
  existsA: boolean;
  existsB: boolean;
  unifiedDiff?: string;
  reason?: string;
}

export interface CheckResult {
  inSync: boolean;
  diff: DiffResult;
}
