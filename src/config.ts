import { promises as fs } from "node:fs";
import path from "node:path";
import type { SyncConfig } from "./types.js";
import { fileExists } from "./utils.js";

export const DEFAULT_CONFIG: SyncConfig = {
  agentsPath: "AGENTS.md",
  claudePath: "CLAUDE.md",
  agentsSkillsDir: ".agents/skills",
  claudeSkillsDir: ".claude/skills",
  ignore: ["node_modules/**", ".git/**", "dist/**"],
  hashAlgorithm: "sha256",
  statePath: ".agents-sync.state.json",
};

export const CONFIG_FILE_NAMES = [".agents-sync.config.json", ".agents-sync.json"];

export async function loadConfig(cwd: string, explicitPath?: string): Promise<SyncConfig> {
  let configPath: string | null = null;

  if (explicitPath) {
    configPath = path.isAbsolute(explicitPath) ? explicitPath : path.resolve(cwd, explicitPath);
    if (!(await fileExists(configPath))) {
      throw new Error(`Config file not found: ${configPath}`);
    }
  } else {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.resolve(cwd, name);
      if (await fileExists(candidate)) {
        configPath = candidate;
        break;
      }
    }
  }

  if (!configPath) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = await fs.readFile(configPath, "utf-8");
  let parsed: Partial<SyncConfig>;
  try {
    parsed = JSON.parse(raw) as Partial<SyncConfig>;
  } catch (err) {
    throw new Error(`Invalid JSON in ${configPath}: ${(err as Error).message}`);
  }

  return { ...DEFAULT_CONFIG, ...parsed };
}

export async function createDefaultConfig(cwd: string, overwrite = false): Promise<string> {
  const target = path.resolve(cwd, ".agents-sync.config.json");
  if (!overwrite && (await fileExists(target))) {
    throw new Error(`Config already exists at ${target}. Use --force to overwrite.`);
  }
  const content = JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n";
  await fs.writeFile(target, content, "utf-8");
  return target;
}

export function resolveConfigPaths(cwd: string, config: SyncConfig): ResolvedConfig {
  return {
    ...config,
    absAgentsPath: path.resolve(cwd, config.agentsPath),
    absClaudePath: path.resolve(cwd, config.claudePath),
    absAgentsSkillsDir: path.resolve(cwd, config.agentsSkillsDir),
    absClaudeSkillsDir: path.resolve(cwd, config.claudeSkillsDir),
    absStatePath: path.resolve(cwd, config.statePath),
  };
}

export interface ResolvedConfig extends SyncConfig {
  absAgentsPath: string;
  absClaudePath: string;
  absAgentsSkillsDir: string;
  absClaudeSkillsDir: string;
  absStatePath: string;
}
