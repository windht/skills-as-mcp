# Skills-as-MCP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and publish a TypeScript MCP server that exposes Claude-style skills from one or more directories over `stdio` and HTTP transports, including a `/sse` endpoint for server deployments.

**Architecture:** Use a small TypeScript core that discovers and parses `SKILL.md` files, validates file access, and builds an MCP server with three Python-compatible tools plus optional resources/prompts. Wrap that core with a CLI entrypoint that supports repeated `--skills-dir` flags and a `--type` transport selector for `stdio`, `sse`, and modern HTTP server modes.

**Tech Stack:** Node.js 22, TypeScript, `@modelcontextprotocol/sdk`, Express, Commander, Gray Matter, Vitest, TSUP, GitHub Actions

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `src/`
- Create: `test/fixtures/`

**Step 1: Initialize package metadata**

Run: `npm init -y`
Expected: `package.json` exists with baseline npm fields.

**Step 2: Install runtime dependencies**

Run: `npm install @modelcontextprotocol/sdk commander express gray-matter zod`
Expected: runtime packages are added to `package.json`.

**Step 3: Install development dependencies**

Run: `npm install -D @types/express @types/node tsup tsx typescript vitest`
Expected: TypeScript build and test tooling is available.

**Step 4: Configure package build output**

Write `package.json`, `tsconfig.json`, and `tsup.config.ts` so `npm run build` emits `dist/cli.js` and reusable library entrypoints.

**Step 5: Commit**

Run: `git add . && git commit -m "chore: scaffold skills-as-mcp package"`

### Task 2: Skill discovery core

**Files:**
- Create: `src/types.ts`
- Create: `src/skill-registry.ts`
- Create: `src/path-utils.ts`
- Test: `test/skill-registry.test.ts`
- Test: `test/fixtures/skills/`

**Step 1: Write failing registry tests**

Cover:
- recursive `SKILL.md` discovery across one or many roots
- YAML frontmatter parsing for `name` and `description`
- duplicate skill-name detection
- secure file access blocking directory traversal
- relative and absolute file listing behavior

**Step 2: Run tests to verify they fail**

Run: `npm test -- --runInBand`
Expected: failures for missing registry implementation.

**Step 3: Write minimal implementation**

Implement a registry that:
- normalizes skill roots
- parses frontmatter from each `SKILL.md`
- returns Python-compatible shapes for metadata, details, and file reads
- protects against traversal and access outside the owning skill directory

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: registry tests pass.

**Step 5: Commit**

Run: `git add . && git commit -m "feat: add skill discovery registry"`

### Task 3: MCP server layer

**Files:**
- Create: `src/server.ts`
- Create: `src/http.ts`
- Modify: `src/types.ts`
- Test: `test/server.test.ts`

**Step 1: Write failing server tests**

Cover:
- server registers `get_available_skills`
- server registers `get_skill_details`
- server registers `get_skill_related_file`
- tool responses match Python reference structure

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures for missing MCP server wiring.

**Step 3: Write minimal implementation**

Build an MCP server factory that:
- uses the official TypeScript SDK
- exposes the three core tools
- optionally exposes resources/prompts for skill discovery
- supports `stdio`
- supports an HTTP server mode with `/sse` and a modern HTTP endpoint

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: server tests pass.

**Step 5: Commit**

Run: `git add . && git commit -m "feat: add MCP server transports"`

### Task 4: CLI and packaging

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Test: `test/cli.test.ts`

**Step 1: Write failing CLI tests**

Cover:
- repeated `--skills-dir`
- environment variable fallback
- `--type stdio`
- `--type sse`
- helpful error when no skill roots are provided

**Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures for missing CLI entrypoint.

**Step 3: Write minimal implementation**

Implement `npx skills-as-mcp --skills-dir <dir> --type <stdio|sse|http>` with:
- repeated `--skills-dir`
- `--host`, `--port`, and `--path` options
- version/help output
- clear startup logs for server modes

**Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: CLI tests pass.

**Step 5: Commit**

Run: `git add . && git commit -m "feat: add publishable CLI"`

### Task 5: CI and repository hygiene

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `.editorconfig`

**Step 1: Add CI workflow**

Run jobs for `npm ci`, `npm run lint`, `npm run test`, and `npm run build`.

**Step 2: Add release workflow**

Prepare npm publishing on tagged releases using `NPM_TOKEN` and `NODE_AUTH_TOKEN`.

**Step 3: Verify workflow syntax**

Run: `npm run build`
Expected: local build passes before CI relies on it.

**Step 4: Commit**

Run: `git add . && git commit -m "ci: add GitHub workflows"`

### Task 6: Documentation and examples

**Files:**
- Create: `README.md`
- Create: `examples/skills/example-skill/SKILL.md`
- Create: `examples/skills/example-skill/references/example-notes.md`

**Step 1: Draft README**

Document:
- what the project does
- comparison to the Python version
- install and `npx` usage
- `stdio`, `/sse`, and HTTP deployment modes
- Claude Desktop / Codex / MCP Inspector examples
- development commands
- publishing and CI notes

**Step 2: Add example skill fixture**

Use the same structure the tool expects so users can run the project immediately.

**Step 3: Verify docs against the built CLI**

Run: `npm run build && node dist/cli.js --help`
Expected: README commands reflect actual CLI output.

**Step 4: Commit**

Run: `git add . && git commit -m "docs: add README and examples"`
