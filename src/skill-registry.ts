import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

import {
  dedupeStrings,
  isPathInside,
  resolveDirectoryPath,
  toPosixPath
} from "./path-utils.js";
import type {
  ResolvedSkill,
  SkillContentResult,
  SkillDetailsResult,
  SkillMetadata,
  SkillRegistryWarning,
  SkillReturnType
} from "./types.js";

const skillFileName = "SKILL.md";
const ignoredDirectories = new Set([".git", "node_modules", "dist", "build"]);

interface SkillRecord extends ResolvedSkill {
  raw_content: string;
}

export class SkillRegistry {
  private constructor(
    private readonly skillRoots: string[],
    private readonly skillsByName: Map<string, SkillRecord>,
    private readonly warnings: SkillRegistryWarning[]
  ) {}

  static async fromSkillRoots(skillRoots: Iterable<string>): Promise<SkillRegistry> {
    const requestedRoots = [...skillRoots].map((root) => root.trim()).filter(Boolean);

    if (requestedRoots.length === 0) {
      throw new Error(
        "At least one skills directory is required. Pass --skills-dir or set SKILLS_DIR / SKILLS_DIRS."
      );
    }

    const normalizedRoots = dedupeStrings(
      await Promise.all(requestedRoots.map((root) => resolveDirectoryPath(root)))
    );

    const warnings: SkillRegistryWarning[] = [];
    const skillsByName = new Map<string, SkillRecord>();

    for (const rootPath of normalizedRoots) {
      const skillFilePaths = await findSkillFiles(rootPath);

      for (const skillFilePath of skillFilePaths) {
        let skillRecord: SkillRecord;

        try {
          skillRecord = await parseSkillFile(rootPath, skillFilePath);
        } catch (error) {
          warnings.push({
            filePath: skillFilePath,
            message: toErrorMessage(error)
          });
          continue;
        }

        const existingSkill = skillsByName.get(skillRecord.name);
        if (existingSkill) {
          throw new Error(
            `Duplicate skill name "${skillRecord.name}" found in ${existingSkill.skill_file_path} and ${skillRecord.skill_file_path}.`
          );
        }

        skillsByName.set(skillRecord.name, skillRecord);
      }
    }

    return new SkillRegistry(normalizedRoots, skillsByName, warnings);
  }

  get roots(): readonly string[] {
    return this.skillRoots;
  }

  get size(): number {
    return this.skillsByName.size;
  }

  getWarnings(): SkillRegistryWarning[] {
    return [...this.warnings];
  }

  listResolvedSkills(): ResolvedSkill[] {
    return [...this.skillsByName.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(({ raw_content: _rawContent, ...skill }) => skill);
  }

  getAvailableSkills(): SkillMetadata[] {
    return this.listResolvedSkills().map(({ name, description, path: skillPath }) => ({
      name,
      description,
      path: skillPath
    }));
  }

  getSkillContent(
    skillName: string,
    returnType: SkillReturnType = "both"
  ): SkillContentResult {
    const skill = this.requireSkill(skillName);

    switch (returnType) {
      case "content":
        return skill.raw_content;
      case "file_path":
        return skill.skill_file_path;
      case "both":
        return {
          content: skill.raw_content,
          file_path: skill.skill_file_path
        };
      default:
        return assertNever(returnType);
    }
  }

  async getSkillDetails(
    skillName: string,
    returnType: SkillReturnType = "both"
  ): Promise<SkillDetailsResult> {
    return {
      skill_content: this.getSkillContent(skillName, returnType),
      files: await this.listSkillFiles(skillName, true)
    };
  }

  async listSkillFiles(skillName: string, relative = true): Promise<string[]> {
    const skill = this.requireSkill(skillName);
    const filePaths = await walkFiles(skill.path);

    return filePaths
      .map((filePath) =>
        relative ? toPosixPath(path.relative(skill.path, filePath)) : filePath
      )
      .sort(sortSkillEntries);
  }

  async getSkillFile(
    skillName: string,
    relativePath: string,
    returnType: SkillReturnType = "both"
  ): Promise<SkillContentResult> {
    const skill = this.requireSkill(skillName);
    const normalizedRelativePath = relativePath.trim();

    if (!normalizedRelativePath) {
      throw new Error("relative_path is required.");
    }

    const unresolvedFilePath = path.resolve(skill.path, normalizedRelativePath);
    if (!isPathInside(skill.path, unresolvedFilePath)) {
      throw new Error("Invalid path: attempting to access files outside skill directory");
    }

    const resolvedFilePath = await realpath(unresolvedFilePath).catch(() => unresolvedFilePath);
    if (!isPathInside(skill.path, resolvedFilePath)) {
      throw new Error("Invalid path: attempting to access files outside skill directory");
    }

    const fileStats = await stat(resolvedFilePath).catch(() => {
      throw new Error(`File not found: ${normalizedRelativePath}`);
    });

    if (!fileStats.isFile()) {
      throw new Error(`Path is not a file: ${normalizedRelativePath}`);
    }

    const fileContents = await readFile(resolvedFilePath, "utf8");

    switch (returnType) {
      case "content":
        return fileContents;
      case "file_path":
        return resolvedFilePath;
      case "both":
        return {
          content: fileContents,
          file_path: resolvedFilePath
        };
      default:
        return assertNever(returnType);
    }
  }

  private requireSkill(skillName: string): SkillRecord {
    const skill = this.skillsByName.get(skillName);

    if (!skill) {
      throw new Error(`Skill '${skillName}' not found`);
    }

    return skill;
  }
}

async function parseSkillFile(rootPath: string, skillFilePath: string): Promise<SkillRecord> {
  const rawContent = await readFile(skillFilePath, "utf8");

  if (!rawContent.startsWith("---")) {
    throw new Error("No valid YAML frontmatter found");
  }

  let frontmatter: Record<string, unknown>;

  try {
    frontmatter = matter(rawContent).data;
  } catch (error) {
    throw new Error(`Invalid YAML in frontmatter: ${toErrorMessage(error)}`);
  }

  if (typeof frontmatter.name !== "string" || !frontmatter.name.trim()) {
    throw new Error(`Missing 'name' field in ${skillFilePath}`);
  }

  if (
    typeof frontmatter.description !== "string" ||
    !frontmatter.description.trim()
  ) {
    throw new Error(`Missing 'description' field in ${skillFilePath}`);
  }

  const skillDirectoryPath = path.dirname(skillFilePath);

  return {
    name: frontmatter.name.trim(),
    description: frontmatter.description.trim(),
    path: skillDirectoryPath,
    root_path: rootPath,
    skill_file_path: skillFilePath,
    raw_content: rawContent
  };
}

async function findSkillFiles(rootPath: string): Promise<string[]> {
  const allFiles = await walkFiles(rootPath);
  return allFiles.filter((filePath) => path.basename(filePath) === skillFileName);
}

async function walkFiles(directoryPath: string): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sortSkillEntries(left: string, right: string): number {
  const leftIsSkillFile = path.basename(left) === skillFileName;
  const rightIsSkillFile = path.basename(right) === skillFileName;

  if (leftIsSkillFile && !rightIsSkillFile) {
    return -1;
  }

  if (!leftIsSkillFile && rightIsSkillFile) {
    return 1;
  }

  return left.localeCompare(right);
}
