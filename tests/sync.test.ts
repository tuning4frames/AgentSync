import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { sync, loadState } from "../src/sync.js";
import { computeDiff } from "../src/diff.js";
import type { ResolvedConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/config.js";

async function mkTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-sync-test-"));
  return dir;
}

function makeConfig(cwd: string): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    absAgentsPath: path.join(cwd, "AGENTS.md"),
    absClaudePath: path.join(cwd, "CLAUDE.md"),
    absAgentsSkillsDir: path.join(cwd, ".agents/skills"),
    absClaudeSkillsDir: path.join(cwd, ".claude/skills"),
    absStatePath: path.join(cwd, ".agents-sync.state.json"),
  };
}

describe("sync", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTempDir();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("copies AGENTS.md to CLAUDE.md when CLAUDE missing (initial sync)", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "# AGENTS\nHello agents", "utf-8");

    const result = await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });

    expect(result.synced.length).toBe(1);
    expect(result.synced[0].from).toContain("AGENTS.md");
    const claudeContent = await fs.readFile(config.absClaudePath, "utf-8");
    expect(claudeContent).toBe("# AGENTS\nHello agents");
  });

  it("bidirectional last-write-wins updates older file", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "agents v1", "utf-8");
    await fs.writeFile(config.absClaudePath, "claude v1", "utf-8");

    // Make agents newer by small delay + rewrite
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(config.absAgentsPath, "agents v2 newer", "utf-8");

    const result = await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });

    const claudeContent = await fs.readFile(config.absClaudePath, "utf-8");
    expect(claudeContent).toBe("agents v2 newer");
    expect(result.synced.length).toBeGreaterThan(0);
  });

  it("dryRun does not write", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "only agents", "utf-8");

    const result = await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: true,
      verbose: false,
      cwd: tmp,
    });

    expect(result.dryRun).toBe(true);
    expect(result.synced.length).toBe(1);
    // File should NOT exist
    const exists = await fs
      .access(config.absClaudePath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it("forced direction agents->claude overwrites", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "agents content", "utf-8");
    await fs.writeFile(config.absClaudePath, "claude content", "utf-8");

    await sync(tmp, config, {
      direction: "agents->claude",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });

    const claude = await fs.readFile(config.absClaudePath, "utf-8");
    expect(claude).toBe("agents content");
  });

  it("handles skills sync", async () => {
    const config = makeConfig(tmp);
    await fs.mkdir(path.join(tmp, ".agents/skills"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".agents/skills", "review.md"), "# Review skill\nDoes review", "utf-8");

    const result = await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });

    const syncedSkillExists = await fs
      .access(path.join(tmp, ".claude/skills/review.md"))
      .then(() => true)
      .catch(() => false);
    expect(syncedSkillExists).toBe(true);
    const content = await fs.readFile(path.join(tmp, ".claude/skills/review.md"), "utf-8");
    expect(content).toContain("Review skill");
    expect(result.synced.some((s) => s.from.includes("review.md"))).toBe(true);
  });

  it("check diff detects drift", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "agents", "utf-8");
    await fs.writeFile(config.absClaudePath, "claude different", "utf-8");

    const diff = await computeDiff(tmp, config);
    expect(diff.hasDiff).toBe(true);
  });

  it("state tracks hashes after sync", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "hello", "utf-8");
    await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });
    const state = await loadState(config.absStatePath);
    expect(Object.keys(state.files).length).toBeGreaterThan(0);
    expect(state.lastSync).toBeDefined();
  });

  it("skips identical files", async () => {
    const config = makeConfig(tmp);
    await fs.writeFile(config.absAgentsPath, "same", "utf-8");
    await fs.writeFile(config.absClaudePath, "same", "utf-8");

    const result = await sync(tmp, config, {
      direction: "bidirectional",
      dryRun: false,
      verbose: false,
      cwd: tmp,
    });
    expect(result.synced.length).toBe(0);
    expect(result.skipped.length).toBeGreaterThan(0);
  });
});
