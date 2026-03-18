#!/usr/bin/env node

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Command, InvalidArgumentError } from "commander";

import { startSkillsMcpHttpServer } from "./http.js";
import { parseMultiValueEnv } from "./path-utils.js";
import { createSkillsMcpServer } from "./server.js";
import { SkillRegistry } from "./skill-registry.js";
import { serverTypes, type ServerType } from "./types.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

export interface ParsedCliOptions {
  skillsDir: string[];
  type: string;
  host: string;
  port: number;
}

export interface CliConfig {
  skillDirs: string[];
  type: ServerType;
  host: string;
  port: number;
}

export function createProgram(env: NodeJS.ProcessEnv = process.env): Command {
  const program = new Command();

  program
    .name("skills-as-mcp")
    .description("Expose Claude-style skills as an MCP server.")
    .version(packageJson.version)
    .option(
      "-s, --skills-dir <path>",
      "Path to a skill root. Repeat the flag to load multiple roots.",
      collectOptionValue,
      []
    )
    .option(
      "-t, --type <type>",
      "Transport type: stdio, sse, or http.",
      env.SKILLS_AS_MCP_TYPE ?? env.MCP_TRANSPORT ?? "stdio"
    )
    .option(
      "--host <host>",
      "Host interface for HTTP server modes.",
      env.SKILLS_AS_MCP_HOST ?? env.MCP_HOST ?? "127.0.0.1"
    )
    .option(
      "--port <port>",
      "Port for HTTP server modes.",
      parsePort,
      parsePort(env.SKILLS_AS_MCP_PORT ?? env.MCP_PORT ?? env.PORT ?? "3000")
    );

  return program;
}

export function buildCliConfig(
  options: ParsedCliOptions,
  env: NodeJS.ProcessEnv = process.env
): CliConfig {
  const type = normalizeServerType(options.type);
  const skillDirs = [
    ...options.skillsDir,
    ...(env.SKILLS_DIR ? [env.SKILLS_DIR] : []),
    ...parseMultiValueEnv(env.SKILLS_DIRS)
  ];

  if (skillDirs.length === 0) {
    throw new Error(
      "At least one --skills-dir is required. You can also set SKILLS_DIR or SKILLS_DIRS."
    );
  }

  return {
    skillDirs,
    type,
    host: options.host,
    port: options.port
  };
}

export async function runCli(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const program = createProgram(env);
  program.parse(argv);

  const config = buildCliConfig(program.opts<ParsedCliOptions>(), env);
  const registry = await SkillRegistry.fromSkillRoots(config.skillDirs);

  for (const warning of registry.getWarnings()) {
    writeStderr(
      `[skills-as-mcp] Skipping invalid skill${warning.filePath ? ` (${warning.filePath})` : ""}: ${warning.message}`
    );
  }

  if (registry.size === 0) {
    writeStderr("[skills-as-mcp] No valid skills were discovered in the configured roots.");
  }

  if (config.type === "stdio") {
    const server = createSkillsMcpServer({ registry });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  const runningServer = await startSkillsMcpHttpServer({
    registry,
    host: config.host,
    port: config.port,
    type: config.type
  });

  setupShutdownHooks(async () => {
    await runningServer.close();
  });

  writeStderr(
    `[skills-as-mcp] Listening on ${new URL(runningServer.routes.mcpPath, runningServer.url).href}`
  );

  if (config.type === "sse") {
    writeStderr(
      `[skills-as-mcp] Legacy SSE endpoints: ${new URL(runningServer.routes.ssePath!, runningServer.url).href} and ${new URL(runningServer.routes.messagesPath!, runningServer.url).href}`
    );
  }
}

function collectOptionValue(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError(`Invalid port: ${value}`);
  }

  return port;
}

function normalizeServerType(value: string): ServerType {
  const normalizedValue = value.trim().toLowerCase();

  if ((serverTypes as readonly string[]).includes(normalizedValue)) {
    return normalizedValue as ServerType;
  }

  throw new Error(
    `Invalid --type "${value}". Expected one of: ${serverTypes.join(", ")}.`
  );
}

function setupShutdownHooks(onShutdown: () => Promise<void>): void {
  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await onShutdown();
    } finally {
      process.exit(0);
    }
  };

  process.once("SIGINT", () => {
    void shutdown();
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });
}

function writeStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    writeStderr(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
