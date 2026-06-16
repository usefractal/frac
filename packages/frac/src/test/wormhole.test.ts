import { McpServer as McpServerBase } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { McpServer } from "../server/server.js";
import { createMockExtra } from "./utils.js";

type RegisteredToolHandler = (
  args: { projectId: string },
  extra: ReturnType<typeof createMockExtra>,
) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
}>;

const tokenResponse = {
  token: "wormhole-token",
  tokenType: "Bearer",
  wormholeId: "board",
  organizationId: "org_123",
  exp: 1781577600,
  expiresAt: "2026-06-16T01:00:00.000Z",
};

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("McpServer.wormhole", () => {
  beforeEach(() => {
    vi.stubEnv("FRACTAL_PLATFORM_URL", "https://platform.example.test");
    vi.stubEnv("FRACTAL_TOKEN", "fractal-token");
    vi.spyOn(McpServerBase.prototype, "registerTool");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/token")) {
          return createJsonResponse(tokenResponse);
        }
        return createJsonResponse({
          success: true,
          requestBody: init?.body,
        });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("syncs tracked state mutations after the user handler and returns wormhole metadata", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });

    server
      .wormhole({
        name: "board",
        stateSchema: z.object({
          selectedId: z.string().nullable(),
          filters: z.object({
            projectId: z.string().optional(),
          }),
        }),
        defaultState: {
          selectedId: null,
          filters: {},
        },
        ttl: 3600,
      })
      .tool(
        {
          name: "show_board",
          description: "Show board",
          inputSchema: {
            projectId: z.string(),
          },
        },
        async (wormhole, args) => {
          wormhole.state.selectedId = "item_123";
          wormhole.state.filters.projectId = args.projectId;

          return "Opened board";
        },
      );

    const registerToolMock = vi.mocked(McpServerBase.prototype.registerTool);
    const handler = registerToolMock.mock.calls[0]?.[2] as
      | RegisteredToolHandler
      | undefined;

    expect(handler).toBeDefined();

    const result = await handler?.(
      { projectId: "project_123" },
      createMockExtra("localhost:3000"),
    );

    expect(result).toMatchObject({
      content: [{ type: "text", text: "Opened board" }],
      structuredContent: {
        wormhole: {
          name: "board",
        },
      },
      _meta: {
        wormhole: {
          name: "board",
          tokenExpiresAt: "2026-06-16T01:00:00.000Z",
          url: "wss://platform.example.test/wormholes/board/ws?token=wormhole-token",
        },
      },
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://platform.example.test/wormholes/board/state",
      expect.objectContaining({
        body: JSON.stringify({
          selectedId: "item_123",
          filters: {
            projectId: "project_123",
          },
        }),
        headers: expect.objectContaining({
          authorization: "Bearer fractal-token",
        }),
        method: "POST",
      }),
    );
  });

  it("starts subsequent calls from the last synced state", async () => {
    const server = new McpServer({ name: "test", version: "1.0.0" });

    server
      .wormhole({
        name: "board",
        stateSchema: z.object({
          selectedId: z.string().nullable(),
          filters: z.object({
            projectId: z.string().optional(),
          }),
        }),
        defaultState: {
          selectedId: null,
          filters: {},
        },
      })
      .tool(
        {
          name: "show_board",
          description: "Show board",
          inputSchema: {
            projectId: z.string(),
          },
        },
        async (wormhole, args) => {
          wormhole.state.filters.projectId = args.projectId;

          if (wormhole.state.selectedId === null) {
            wormhole.state.selectedId = "first";
          }

          return "Opened board";
        },
      );

    const registerToolMock = vi.mocked(McpServerBase.prototype.registerTool);
    const handler = registerToolMock.mock.calls[0]?.[2] as
      | RegisteredToolHandler
      | undefined;

    expect(handler).toBeDefined();

    await handler?.({ projectId: "one" }, createMockExtra("localhost:3000"));
    await handler?.({ projectId: "two" }, createMockExtra("localhost:3000"));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://platform.example.test/wormholes/board/state",
      expect.objectContaining({
        body: JSON.stringify({
          selectedId: "first",
          filters: {
            projectId: "two",
          },
        }),
      }),
    );
  });
});
