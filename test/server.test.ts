import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { fileURLToPath } from "node:url";

import { createSkillsMcpServer } from "../src/server.js";
import { SkillRegistry } from "../src/skill-registry.js";

const rootA = fileURLToPath(new URL("./fixtures/skills/root-a/", import.meta.url));
const rootB = fileURLToPath(new URL("./fixtures/skills/root-b/", import.meta.url));

describe("createSkillsMcpServer", () => {
  it("registers the Python-compatible tools and returns structured results", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA, rootB]);
    const server = createSkillsMcpServer({ registry, identity: { version: "test" } });
    const client = new Client(
      { name: "skills-as-mcp-test-client", version: "0.0.0" },
      { capabilities: {} }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          "get_available_skills",
          "get_skill_details",
          "get_skill_related_file"
        ])
      );

      const availableSkills = await client.callTool({ name: "get_available_skills", arguments: {} });
      expect(availableSkills.structuredContent).toMatchObject({
        result: [
          expect.objectContaining({ name: "refactor-helper" }),
          expect.objectContaining({ name: "release-helper" })
        ]
      });

      const details = await client.callTool({
        name: "get_skill_details",
        arguments: {
          skill_name: "release-helper",
          return_type: "content"
        }
      });
      expect(details.structuredContent).toMatchObject({
        skill_content: expect.stringContaining("Release Helper"),
        files: ["SKILL.md", "scripts/publish.sh"]
      });

      const fileResult = await client.callTool({
        name: "get_skill_related_file",
        arguments: {
          skill_name: "release-helper",
          relative_path: "scripts/publish.sh",
          return_type: "both"
        }
      });
      expect(fileResult.structuredContent).toMatchObject({
        result: {
          content: expect.stringContaining("publish placeholder"),
          file_path: expect.stringContaining("publish.sh")
        }
      });
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });

  it("registers resources and prompts for clients that support them", async () => {
    const registry = await SkillRegistry.fromSkillRoots([rootA]);
    const server = createSkillsMcpServer({ registry, identity: { version: "test" } });
    const client = new Client(
      { name: "skills-as-mcp-test-client", version: "0.0.0" },
      { capabilities: {} }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual(
        expect.arrayContaining(["skills://catalog", "skills://refactor-helper"])
      );

      const catalog = await client.readResource({ uri: "skills://catalog" });
      expect(catalog.contents[0]).toMatchObject({
        uri: "skills://catalog",
        text: expect.stringContaining("refactor-helper")
      });

      const prompt = await client.getPrompt({
        name: "use_skill",
        arguments: { skill_name: "refactor-helper" }
      });
      expect(prompt.messages[0]?.content).toMatchObject({
        type: "text",
        text: expect.stringContaining('Use the "refactor-helper" skill below')
      });
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  });
});

