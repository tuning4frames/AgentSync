import matter from "gray-matter";
import type { ParsedMarkdown, MarkdownSection } from "./types.js";

/**
 * Parse markdown file with optional frontmatter.
 * Handles:
 * - YAML frontmatter via gray-matter
 * - Section extraction (##, ### etc)
 * - Graceful fallback if no frontmatter
 */
export function parseMarkdown(raw: string): ParsedMarkdown {
  let frontmatter: Record<string, unknown> = {};
  let content = raw;
  let hasFrontmatter = false;

  try {
    const parsed = matter(raw);
    // gray-matter returns content without frontmatter; data is frontmatter
    if (parsed.matter && parsed.matter.trim().length > 0) {
      hasFrontmatter = true;
      frontmatter = parsed.data as Record<string, unknown>;
      content = parsed.content;
    } else if (Object.keys(parsed.data).length > 0) {
      // frontmatter existed but matter empty? still treat as frontmatter
      hasFrontmatter = true;
      frontmatter = parsed.data as Record<string, unknown>;
      content = parsed.content;
    } else {
      // No frontmatter detected - keep raw as content
      // matter still strips nothing if no delimiters
      content = parsed.content;
      hasFrontmatter = false;
    }
  } catch {
    // If gray-matter fails (invalid YAML etc), treat entire file as content
    frontmatter = {};
    content = raw;
    hasFrontmatter = false;
  }

  const sections = extractSections(content);

  return {
    raw,
    frontmatter,
    content,
    sections,
    hasFrontmatter,
  };
}

/**
 * Extract markdown sections by ATX headings.
 * Supports # through ######.
 */
export function extractSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];

  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentLines: string[] = [];
  let currentRawLines: string[] = [];

  const flush = () => {
    if (currentHeading !== null) {
      const content = currentLines.join("\n").trim();
      const raw = currentRawLines.join("\n");
      sections.push({
        heading: currentHeading,
        level: currentLevel,
        content,
        raw,
      });
    } else if (currentLines.length > 0) {
      // Preamble before first heading
      const content = currentLines.join("\n").trim();
      if (content.length > 0) {
        sections.push({
          heading: "_preamble",
          level: 0,
          content,
          raw: currentRawLines.join("\n"),
        });
      }
    }
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      // New section starts
      flush();
      currentHeading = match[2].trim();
      currentLevel = match[1].length;
      currentLines = [];
      currentRawLines = [line];
    } else {
      if (currentHeading === null && sections.length === 0) {
        // Still in preamble
        currentLines.push(line);
        currentRawLines.push(line);
      } else if (currentHeading !== null) {
        currentLines.push(line);
        currentRawLines.push(line);
      } else {
        // After preamble but no current heading? Should not happen; accumulate
        currentLines.push(line);
        currentRawLines.push(line);
      }
    }
  }
  flush();

  return sections;
}

/**
 * Serialize ParsedMarkdown back to string, preserving frontmatter if present.
 */
export function serializeMarkdown(parsed: ParsedMarkdown): string {
  if (parsed.hasFrontmatter) {
    return matter.stringify(parsed.content, parsed.frontmatter);
  }
  return parsed.raw;
}

/**
 * Compare two parsed markdown files for semantic equality (ignoring whitespace/trailing newline differences).
 */
export function markdownEqual(a: ParsedMarkdown, b: ParsedMarkdown): boolean {
  // Quick raw check
  if (a.raw === b.raw) return true;
  // Frontmatter must match
  if (JSON.stringify(a.frontmatter) !== JSON.stringify(b.frontmatter)) return false;
  // Normalized content compare
  const normA = a.content.trim().replace(/\r\n/g, "\n");
  const normB = b.content.trim().replace(/\r\n/g, "\n");
  return normA === normB;
}
