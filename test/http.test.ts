import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fileURLToPath } from "node:url";

import { startSkillsMcpHttpServer } from "../src/http.js";
import { SkillRegistry } from "../src/skill-registry.js";

const rootA = fileURLToPath(new URL("./fixtures/skills/root-a/", import.meta.url));
const rootB = fileURLToPath(new URL("./fixtures/skills/root-b/", import.meta.url));

describe("HTTP server modes", () => {
  it("serves tools over the /mcp endpoint in HTTP mode", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA, rootB]);
    const runningServer = await startSkillsMcpHttpServer({
      registry,
      host: "127.0.0.1",
      port: 0,
      type: "http",
      identity: { version: "test" }
    });
    const client = new Client(
      { name: "skills-as-mcp-http-client", version: "0.0.0" },
      { capabilities: {} }
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(runningServer.routes.mcpPath, runningServer.url)
    );

    try {
      await client.connect(transport);
      const result = await client.callTool({ name: "get_available_skills", arguments: {} });
      expect(result.structuredContent).toMatchObject({
        result: [
          expect.objectContaining({ name: "refactor-helper" }),
          expect.objectContaining({ name: "release-helper" })
        ]
      });
    } finally {
      await Promise.allSettled([client.close(), transport.close(), runningServer.close()]);
    }
  });

  it("exposes a legacy /sse endpoint in SSE compatibility mode", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA]);
    const runningServer = await startSkillsMcpHttpServer({
      registry,
      host: "127.0.0.1",
      port: 0,
      type: "sse",
      identity: { version: "test" }
    });

    try {
      const response = await fetch(new URL(runningServer.routes.ssePath!, runningServer.url));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      await response.body?.cancel();
    } finally {
      await runningServer.close();
    }
  });
});

