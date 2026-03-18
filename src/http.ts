import { randomUUID } from "node:crypto";
import type { Server as NodeHttpServer } from "node:http";
import type { Response } from "express";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Express } from "express";

import { SkillRegistry } from "./skill-registry.js";
import { createSkillsMcpServer } from "./server.js";
import type { HttpServerRouteConfig, ServerIdentity, ServerType } from "./types.js";

type SessionTransport = StreamableHTTPServerTransport | SSEServerTransport;

interface SessionRecord {
  server: ReturnType<typeof createSkillsMcpServer>;
  transport: SessionTransport;
}

export interface SkillsMcpHttpApp {
  app: Express;
  routes: HttpServerRouteConfig;
  close: () => Promise<void>;
}

export interface RunningSkillsMcpHttpServer extends SkillsMcpHttpApp {
  server: NodeHttpServer;
  url: URL;
}

const defaultRoutes = {
  mcpPath: "/mcp",
  ssePath: "/sse",
  messagesPath: "/messages"
} as const;

export function createSkillsMcpHttpApp(options: {
  registry: SkillRegistry;
  host: string;
  type: Extract<ServerType, "http" | "sse">;
  identity?: Partial<ServerIdentity>;
}): SkillsMcpHttpApp {
  const app = createMcpExpressApp({ host: options.host });
  const sessions = new Map<string, SessionRecord>();

  app.all(defaultRoutes.mcpPath, async (req, res) => {
    try {
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId =
        typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId) {
        const session = sessions.get(sessionId);

        if (!session || !(session.transport instanceof StreamableHTTPServerTransport)) {
          sendJsonRpcError(
            res,
            400,
            "Bad Request: No valid Streamable HTTP session ID provided"
          );
          return;
        }

        transport = session.transport;
      } else if (req.method === "POST" && isInitializeRequest(req.body)) {
        const server = createSkillsMcpServer(options);
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            sessions.set(newSessionId, { server, transport: newTransport });
            newTransport.onclose = () => {
              void cleanupSession(sessions, newSessionId);
            };
          }
        });
        transport = newTransport;
        await server.connect(newTransport);
      } else {
        sendJsonRpcError(
          res,
          400,
          "Bad Request: Initialize with POST /mcp before reusing a session"
        );
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      sendJsonRpcError(res, 500, toErrorMessage(error));
    }
  });

  if (options.type === "sse") {
    app.get(defaultRoutes.ssePath, async (_req, res) => {
      try {
        const transport = new SSEServerTransport(defaultRoutes.messagesPath, res);
        const server = createSkillsMcpServer(options);
        const sessionId = transport.sessionId;

        sessions.set(sessionId, { server, transport });
        transport.onclose = () => {
          void cleanupSession(sessions, sessionId);
        };

        await server.connect(transport);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).send(toErrorMessage(error));
        }
      }
    });

    app.post(defaultRoutes.messagesPath, async (req, res) => {
      const sessionId =
        typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;

      if (!sessionId) {
        res.status(400).send("Missing sessionId parameter");
        return;
      }

      const session = sessions.get(sessionId);
      if (!session || !(session.transport instanceof SSEServerTransport)) {
        res.status(404).send("Session not found");
        return;
      }

      try {
        await session.transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).send(toErrorMessage(error));
        }
      }
    });
  }

  return {
    app,
    routes:
      options.type === "sse"
        ? { ...defaultRoutes }
        : { mcpPath: defaultRoutes.mcpPath },
    close: async () => {
      await Promise.all(
        [...sessions.keys()].map((sessionId) => cleanupSession(sessions, sessionId))
      );
    }
  };
}

export async function startSkillsMcpHttpServer(options: {
  registry: SkillRegistry;
  host: string;
  port: number;
  type: Extract<ServerType, "http" | "sse">;
  identity?: Partial<ServerIdentity>;
}): Promise<RunningSkillsMcpHttpServer> {
  const httpApp = createSkillsMcpHttpApp(options);
  const server = await listen(httpApp.app, options.host, options.port);
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine listening address for HTTP server");
  }

  const host = formatHostForUrl(options.host);
  const url = new URL(`http://${host}:${address.port}`);

  return {
    ...httpApp,
    server,
    url,
    close: async () => {
      await httpApp.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function cleanupSession(
  sessions: Map<string, SessionRecord>,
  sessionId: string
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  sessions.delete(sessionId);
  await Promise.allSettled([session.server.close(), session.transport.close()]);
}

async function listen(
  app: Express,
  host: string,
  port: number
): Promise<NodeHttpServer> {
  return new Promise<NodeHttpServer>((resolve, reject) => {
    const server = app.listen(port, host, () => resolve(server));
    server.on("error", reject);
  });
}

function sendJsonRpcError(res: Response, statusCode: number, message: string): void {
  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json({
    jsonrpc: "2.0",
    error: {
      code: statusCode === 500 ? -32603 : -32000,
      message
    },
    id: null
  });
}

function formatHostForUrl(host: string): string {
  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`;
  }

  return host;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
