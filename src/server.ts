import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

import { SkillRegistry } from "./skill-registry.js";
import type {
  ServerIdentity,
  SkillContentResult,
  SkillDetailsResult,
  SkillMetadata
} from "./types.js";

const defaultIdentity: ServerIdentity = {
  name: "skills-as-mcp",
  version: "0.1.0",
  instructions:
    "This server exposes Claude-style skills discovered from one or more directories. " +
    "Call get_available_skills first, then get_skill_details for a specific skill, and " +
    "get_skill_related_file when you need supporting scripts, references, or examples."
};

const skillMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  path: z.string()
});

const skillContentWithPathSchema = z.object({
  content: z.string(),
  file_path: z.string()
});

const wrappedSkillContentSchema = z.union([z.string(), skillContentWithPathSchema]);

export function createSkillsMcpServer(options: {
  registry: SkillRegistry;
  identity?: Partial<ServerIdentity>;
}): McpServer {
  const identity = {
    ...defaultIdentity,
    ...options.identity
  };
  const { registry } = options;

  const server = new McpServer(
    {
      name: identity.name,
      version: identity.version
    },
    {
      capabilities: {
        logging: {}
      },
      instructions: identity.instructions
    }
  );

  server.registerTool(
    "get_available_skills",
    {
      title: "Get Available Skills",
      description:
        "List every discovered skill with its description and filesystem path.",
      outputSchema: {
        result: z.array(skillMetadataSchema)
      }
    },
    async () => {
      const result = registry.getAvailableSkills();
      return createStructuredToolResult({ result }, result);
    }
  );

  server.registerTool(
    "get_skill_details",
    {
      title: "Get Skill Details",
      description:
        "Return the requested skill's SKILL.md content and a recursive file listing for its directory.",
      inputSchema: {
        skill_name: z.string().describe("The skill name returned by get_available_skills."),
        return_type: z
          .enum(["content", "file_path", "both"])
          .default("both")
          .describe("Whether to return SKILL.md content, path, or both.")
      },
      outputSchema: {
        skill_content: wrappedSkillContentSchema,
        files: z.array(z.string())
      }
    },
    async ({ skill_name: skillName, return_type: returnType }) => {
      const details = await registry.getSkillDetails(skillName, returnType);
      return createStructuredToolResult({ ...details }, details);
    }
  );

  server.registerTool(
    "get_skill_related_file",
    {
      title: "Get Skill Related File",
      description:
        "Read a specific file inside a discovered skill directory with directory traversal protection.",
      inputSchema: {
        skill_name: z.string().describe("The skill name returned by get_available_skills."),
        relative_path: z
          .string()
          .describe("A path inside the skill directory, for example scripts/build.sh."),
        return_type: z
          .enum(["content", "file_path", "both"])
          .default("both")
          .describe("Whether to return file content, path, or both.")
      },
      outputSchema: {
        result: wrappedSkillContentSchema
      }
    },
    async ({
      skill_name: skillName,
      relative_path: relativePath,
      return_type: returnType
    }) => {
      const result = await registry.getSkillFile(skillName, relativePath, returnType);
      return createStructuredToolResult({ result }, result);
    }
  );

  server.registerPrompt(
    "use_skill",
    {
      title: "Use Skill",
      description:
        "Create a ready-to-send user message that inlines a skill for the current task.",
      argsSchema: {
        skill_name: z.string().describe("The skill name to inline.")
      }
    },
    async ({ skill_name: skillName }) => {
      const details = (await registry.getSkillDetails(
        skillName,
        "content"
      )) as SkillDetailsResult;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use the "${skillName}" skill below when answering the next request.\n\n` +
                `${details.skill_content}`
            }
          }
        ]
      };
    }
  );

  server.registerResource(
    "skill-catalog",
    "skills://catalog",
    {
      title: "Skill Catalog",
      description: "All discovered skills as JSON metadata.",
      mimeType: "application/json"
    },
    async () => {
      const skills = registry.getAvailableSkills();
      return {
        contents: [
          {
            uri: "skills://catalog",
            mimeType: "application/json",
            text: JSON.stringify(skills, null, 2)
          }
        ]
      };
    }
  );

  for (const skill of registry.listResolvedSkills()) {
    registerSkillResource(server, registry, skill);
  }

  return server;
}

function registerSkillResource(
  server: McpServer,
  registry: SkillRegistry,
  skill: SkillMetadata
): void {
  const resourceUri = `skills://${skill.name}`;

  server.registerResource(
    `skill-${skill.name}`,
    resourceUri,
    {
      title: skill.name,
      description: skill.description,
      mimeType: "text/markdown"
    },
    async () => {
      const skillContent = registry.getSkillContent(skill.name, "content");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: "text/markdown",
            text: skillContent as string
          }
        ]
      };
    }
  );
}

function createStructuredToolResult(
  structuredContent: Record<string, unknown>,
  textPayload: SkillMetadata[] | SkillDetailsResult | SkillContentResult
) {
  return {
    structuredContent,
    content: [
      {
        type: "text" as const,
        text:
          typeof textPayload === "string"
            ? textPayload
            : JSON.stringify(textPayload, null, 2)
      }
    ]
  };
}
