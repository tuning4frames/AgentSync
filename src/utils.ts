import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Compute hash for file content
 */
export function hashContent(content: string | Buffer, algorithm: "sha256" | "md5" = "sha256"): string {
  return createHash(algorithm).update(content).digest("hex");
}

export async function hashFile(
  filePath: string,
  algorithm: "sha256" | "md5" = "sha256",
): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath);
    return hashContent(buf, algorithm);
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function getMtimeMs(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

export function resolveFromCwd(cwd: string, p: string): string {
  if (path.isAbsolute(p)) return p;
  return path.resolve(cwd, p);
}

export function relativeToCwd(cwd: string, absPath: string): string {
  return path.relative(cwd, absPath) || ".";
}

export function normalizePosix(p: string): string {
  return p.split(path.sep).join(path.posix.sep);
}

/**
 * Ensure parent directory exists for file path then write
 */
export async function writeFileEnsureDir(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Compare two strings for equality via hash (fast path for large files)
 */
export function contentsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return hashContent(a) === hashContent(b);
}
