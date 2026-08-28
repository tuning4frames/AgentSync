import { describe, it, expect } from "vitest";
import { parseMarkdown, extractSections, markdownEqual } from "../src/parser.js";

describe("parseMarkdown", () => {
  it("parses frontmatter and content", () => {
    const raw = `---
title: Test Agent
description: A test agent
---

# Hello
Content here
`;
    const parsed = parseMarkdown(raw);
    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter.title).toBe("Test Agent");
    expect(parsed.content).toContain("# Hello");
  });

  it("handles file without frontmatter", () => {
    const raw = `# AGENTS.md

This is a test.
## Section
Body
`;
    const parsed = parseMarkdown(raw);
    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.content).toContain("# AGENTS.md");
    expect(parsed.sections.length).toBeGreaterThan(0);
  });

  it("handles invalid YAML gracefully", () => {
    const raw = `---
invalid: [unclosed
---

Content`;
    const parsed = parseMarkdown(raw);
    // Should not throw, fallback to content
    expect(parsed.content).toBeDefined();
  });

  it("serializes roundtrip", () => {
    const raw = `---
name: test
---
# Title
Body`;
    const parsed = parseMarkdown(raw);
    expect(parsed.frontmatter.name).toBe("test");
    expect(markdownEqual(parsed, parseMarkdown(parsed.raw))).toBe(true);
  });
});

describe("extractSections", () => {
  it("extracts headings and preamble", () => {
    const md = `Preamble text
# Heading 1
Content 1
## Heading 2
Content 2
### Heading 3
More`;

    const sections = extractSections(md);
    expect(sections[0].heading).toBe("_preamble");
    expect(sections[1].heading).toBe("Heading 1");
    expect(sections[1].level).toBe(1);
    expect(sections[2].heading).toBe("Heading 2");
    expect(sections[2].level).toBe(2);
  });

  it("handles empty file", () => {
    const sections = extractSections("");
    expect(sections).toEqual([]);
  });

  it("handles only headings", () => {
    const sections = extractSections("# A\n## B\n### C");
    expect(sections.length).toBe(3);
    expect(sections.map((s) => s.heading)).toEqual(["A", "B", "C"]);
  });
});

describe("markdownEqual", () => {
  it("detects equal markdown", () => {
    const a = parseMarkdown("# Hello\nWorld");
    const b = parseMarkdown("# Hello\nWorld");
    expect(markdownEqual(a, b)).toBe(true);
  });

  it("detects unequal markdown", () => {
    const a = parseMarkdown("# Hello\nWorld");
    const b = parseMarkdown("# Hello\nDifferent");
    expect(markdownEqual(a, b)).toBe(false);
  });

  it("frontmatter difference matters", () => {
    const a = parseMarkdown("---\ntitle: A\n---\nContent");
    const b = parseMarkdown("---\ntitle: B\n---\nContent");
    expect(markdownEqual(a, b)).toBe(false);
  });
});
