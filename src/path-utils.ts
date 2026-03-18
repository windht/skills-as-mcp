import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export async function resolveDirectoryPath(inputPath: string): Promise<string> {
  const trimmedPath = inputPath.trim();

  if (!trimmedPath) {
    throw new Error("Skills directory paths cannot be empty.");
  }

  const resolvedPath = path.resolve(trimmedPath);
  const stats = await stat(resolvedPath).catch(() => {
    throw new Error(`Skills directory does not exist: ${resolvedPath}`);
  });

  if (!stats.isDirectory()) {
    throw new Error(`Skills directory is not a directory: ${resolvedPath}`);
  }

  return realpath(resolvedPath).catch(() => resolvedPath);
}

export function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep);
}

export function dedupeStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function parseMultiValueEnv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

