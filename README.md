# skills-as-mcp

`skills-as-mcp` is a TypeScript MCP server that turns Claude-style skill folders
into MCP tools, resources, and prompts.

It is inspired by the Python project
[`biocontext-ai/skill-to-mcp`](https://github.com/biocontext-ai/skill-to-mcp),
but built for the TypeScript ecosystem and aligned with the official
[Model Context Protocol server guidance](https://modelcontextprotocol.io/docs/develop/build-server).

## What it does

- Recursively discovers `SKILL.md` files from one or many skill roots
- Parses YAML frontmatter for `name` and `description`
- Exposes three Python-compatible tools:
  - `get_available_skills`
  - `get_skill_details`
  - `get_skill_related_file`
- Exposes MCP resources for the catalog and each discovered skill
- Exposes a `use_skill` prompt for clients that support prompts
- Supports:
  - `stdio` for local coding tools and desktop clients
  - `http` for Streamable HTTP on `/mcp`
  - `sse` for a compatibility server that exposes `/mcp`, `/sse`, and `/messages`

## Installation

Run it directly with `npx`:

```bash
npx skills-as-mcp --skills-dir /absolute/path/to/skills --type stdio
```

Or install it into a project:

```bash
npm install skills-as-mcp
```

## Quick Start

### 1. Create a skill directory

Your skills can live anywhere. Each skill needs its own directory and a
`SKILL.md` file with frontmatter:

```text
my-skills/
└── release-helper/
    ├── SKILL.md
    ├── references/
    └── scripts/
```

```md
---
name: release-helper
description: Helps prepare package releases and changelogs.
---

# Release Helper

Instructions go here...
```

### 2. Run as a local MCP server

```bash
npx skills-as-mcp --skills-dir /absolute/path/to/my-skills --type stdio
```

### 3. Run as a remote server

Streamable HTTP only:

```bash
npx skills-as-mcp --skills-dir /absolute/path/to/my-skills --type http --host 0.0.0.0 --port 3000
```

Compatibility mode with legacy SSE:

```bash
npx skills-as-mcp --skills-dir /absolute/path/to/my-skills --type sse --host 0.0.0.0 --port 3000
```

In `sse` mode the server exposes:

- `/mcp` for Streamable HTTP clients
- `/sse` for legacy SSE clients
- `/messages` for legacy POST requests

## CLI Reference

```bash
npx skills-as-mcp --skills-dir <path> [--skills-dir <path> ...] --type <stdio|http|sse>
```

### Options

- `--skills-dir <path>`: Add a skill root. Repeat the flag to load multiple roots.
- `--type <stdio|http|sse>`: Select the transport mode.
- `--host <host>`: Host interface for HTTP modes. Default: `127.0.0.1`.
- `--port <port>`: Port for HTTP modes. Default: `3000`.

### Environment variables

- `SKILLS_DIR`: Single skill root
- `SKILLS_DIRS`: Multiple skill roots joined by your OS path delimiter
- `SKILLS_AS_MCP_TYPE`: Same values as `--type`
- `SKILLS_AS_MCP_HOST`: Same as `--host`
- `SKILLS_AS_MCP_PORT`: Same as `--port`

`SKILLS_DIRS` uses `:` on macOS/Linux and `;` on Windows.

## MCP Surface Area

### Tools

`get_available_skills`

- Returns every discovered skill with `name`, `description`, and `path`

`get_skill_details`

- Returns the `SKILL.md` content and the recursive file listing for a skill
- Supports `return_type` values of `content`, `file_path`, and `both`

`get_skill_related_file`

- Reads a specific file inside a skill directory
- Blocks directory traversal outside the skill root
- Supports `return_type` values of `content`, `file_path`, and `both`

### Resources

- `skills://catalog`
- `skills://<skill-name>`

### Prompts

- `use_skill`

## Example MCP Client Config

For clients that spawn local MCP servers over `stdio`, the shape is typically:

```json
{
  "mcpServers": {
    "skills-as-mcp": {
      "command": "npx",
      "args": [
        "skills-as-mcp",
        "--skills-dir",
        "/absolute/path/to/my-skills",
        "--type",
        "stdio"
      ]
    }
  }
}
```

For multiple skill roots:

```json
{
  "mcpServers": {
    "skills-as-mcp": {
      "command": "npx",
      "args": [
        "skills-as-mcp",
        "--skills-dir",
        "/absolute/path/to/team-skills",
        "--skills-dir",
        "/absolute/path/to/project-skills",
        "--type",
        "stdio"
      ]
    }
  }
}
```

## Included Example

An example skill is included at
[`examples/skills/example-skill/SKILL.md`](examples/skills/example-skill/SKILL.md)
so you can try the package immediately:

```bash
npx skills-as-mcp --skills-dir ./examples/skills --type stdio
```

## Library Usage

You can also import the core pieces directly:

```ts
import { SkillRegistry, createSkillsMcpServer } from "skills-as-mcp";

const registry = await SkillRegistry.fromSkillRoots(["./examples/skills"]);
const server = createSkillsMcpServer({ registry });
```

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

Useful commands:

- `npm run dev -- --skills-dir ./examples/skills --type stdio`
- `npm run dev -- --skills-dir ./examples/skills --type http --port 3000`
- `npm run dev -- --skills-dir ./examples/skills --type sse --port 3000`

## Publishing

The repo includes:

- `CI` workflow for lint, test, and build on pushes and pull requests
- `Release` workflow that publishes to npm on `v*` tags

To publish from GitHub Actions, set `NPM_TOKEN` in repository secrets.

## Notes

- Invalid skills are skipped with warnings instead of crashing the whole server.
- Duplicate skill names across roots are treated as a startup error.
- In `stdio` mode all human-readable logs go to `stderr` so MCP traffic on `stdout`
  stays clean.
