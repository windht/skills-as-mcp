#!/usr/bin/env node

import { runCli } from "./cli.js";

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}

void main();

