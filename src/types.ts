export const skillReturnTypes = ["content", "file_path", "both"] as const;
export type SkillReturnType = (typeof skillReturnTypes)[number];

export const serverTypes = ["stdio", "sse", "http"] as const;
export type ServerType = (typeof serverTypes)[number];

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

export interface SkillContentWithPath {
  content: string;
  file_path: string;
}

export type SkillContentResult = string | SkillContentWithPath;

export interface SkillDetailsResult {
  skill_content: SkillContentResult;
  files: string[];
}

export interface ResolvedSkill extends SkillMetadata {
  root_path: string;
  skill_file_path: string;
}

export interface SkillRegistryWarning {
  message: string;
  filePath?: string;
}

export interface ServerIdentity {
  name: string;
  version: string;
  instructions?: string;
}

export interface HttpServerRouteConfig {
  mcpPath: string;
  ssePath?: string;
  messagesPath?: string;
}

