import { fileURLToPath } from "node:url";

import { SkillRegistry } from "../src/skill-registry.js";

const fixturesRoot = fileURLToPath(new URL("./fixtures/skills/", import.meta.url));
const duplicateRoot = fileURLToPath(new URL("./fixtures/duplicate-root/", import.meta.url));
const rootA = fileURLToPath(new URL("./fixtures/skills/root-a/", import.meta.url));
const rootB = fileURLToPath(new URL("./fixtures/skills/root-b/", import.meta.url));

describe("SkillRegistry", () => {
  it("loads skills from multiple roots and sorts them by name", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA, rootB]);

    expect(registry.getAvailableSkills()).toEqual([
      {
        name: "refactor-helper",
        description: "Guides safe refactors across TypeScript services.",
        path: `${fixturesRoot}root-a/refactor-helper`
      },
      {
        name: "release-helper",
        description: "Coordinates npm release preparation for MCP packages.",
        path: `${fixturesRoot}root-b/release-helper`
      }
    ]);
  });

  it("records warnings for invalid skill files without failing the whole registry", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA, rootB]);

    expect(registry.getWarnings()).toHaveLength(1);
    expect(registry.getWarnings()[0]?.message).toContain("Missing 'description' field");
  });

  it("returns skill content in content, file_path, and both modes", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA]);

    const contentOnly = registry.getSkillContent("refactor-helper", "content");
    const pathOnly = registry.getSkillContent("refactor-helper", "file_path");
    const both = registry.getSkillContent("refactor-helper", "both");

    expect(contentOnly).toContain("Refactor Helper");
    expect(pathOnly).toContain("SKILL.md");
    expect(both).toEqual({
      content: expect.stringContaining("Refactor Helper"),
      file_path: expect.stringContaining("SKILL.md")
    });
  });

  it("lists skill files as relative and absolute paths", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA]);

    await expect(registry.listSkillFiles("refactor-helper")).resolves.toEqual([
      "SKILL.md",
      "references/checklist.md"
    ]);

    const absoluteFiles = await registry.listSkillFiles("refactor-helper", false);
    expect(absoluteFiles.every((filePath) => filePath.startsWith(fixturesRoot))).toBe(true);
  });

  it("returns related skill files and blocks directory traversal", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA]);

    await expect(
      registry.getSkillFile("refactor-helper", "references/checklist.md", "content")
    ).resolves.toContain("Refactor Checklist");

    await expect(
      registry.getSkillFile("refactor-helper", "../../../etc/passwd", "content")
    ).rejects.toThrow("Invalid path");
  });

  it("fails fast when two skill roots define the same skill name", async () => {
    await expect(SkillRegistry.fromSkillRoots([rootB, duplicateRoot])).rejects.toThrow(
      'Duplicate skill name "release-helper"'
    );
  });
});

