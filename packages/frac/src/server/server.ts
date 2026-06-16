import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import type {
  McpUiResourceMeta,
  McpUiToolMeta,
} from "@modelcontextprotocol/ext-apps";
import {
  Server as SdkServer,
  type ServerOptions,
} from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer as McpServerBase } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  AnySchema,
  SchemaOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ContentBlock,
  Implementation,
  RequestMeta,
  ServerNotification,
  ServerRequest,
  ServerResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { mergeWith, union } from "es-toolkit";
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
} from "express";
import ts from "typescript";
import { z } from "zod";
import { createApp } from "./express.js";
import type {
  McpExtra,
  McpExtraFor,
  McpMethodString,
  McpMiddlewareEntry,
  McpMiddlewareFilter,
  McpMiddlewareFn,
  McpResultFor,
  McpTypedMiddlewareFn,
  McpWildcard,
} from "./middleware.js";
import { buildMiddlewareChain, getHandlerMaps } from "./middleware.js";
import { templateHelper } from "./templateHelper.js";
import { WormholeBuilder, type WormholeConfig } from "./wormhole.js";

const mergeWithUnion = <T extends object, S extends object>(
  target: T,
  source: S,
): T & S => {
  return mergeWith(target, source, (targetVal, sourceVal) => {
    if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      return union(targetVal, sourceVal);
    }
  });
};

/**
 * Type marker for a registered tool — carries its input, output, and response
 * metadata shapes so views can infer types from `typeof server`.
 *
 * You normally never construct this by hand; it is produced by `registerTool`
 * and consumed by helpers like {@link InferTools} and {@link generateHelpers}.
 */
export type ToolDef<
  TInput = unknown,
  TOutput = unknown,
  TResponseMetadata = unknown,
> = {
  input: TInput;
  output: TOutput;
  responseMetadata: TResponseMetadata;
};

/**
 * Type marker for a registered Fractal — carries the props shape so renderers and
 * Fractal components can infer prop contracts from `typeof server`.
 */
export type AtomDef<TProps = unknown> = {
  props: TProps;
};

/** Which host runtime a view targets — `"apps-sdk"` (ChatGPT) or `"mcp-app"` (MCP Apps spec). */
export type ViewHostType = "apps-sdk" | "mcp-app";

/**
 * Content Security Policy origins attached to a view's resource. Each list is
 * passed through to the host's CSP for the view iframe; omit a field to inherit
 * the host's default for that directive.
 */
export interface ViewCsp {
  /** Origins for static assets (images, fonts, scripts, styles). */
  resourceDomains?: string[];
  /** Origins the view may contact via fetch/XHR. */
  connectDomains?: string[];
  /** Origins allowed for iframe embeds (opts into stricter app review). */
  frameDomains?: string[];
  /** Origins that can receive openExternal redirects without the safe-link modal. */
  redirectDomains?: string[];
  /** Origins allowed in `<base href>` tags (mcp-apps only). */
  baseUriDomains?: string[];
}

/**
 * Registry of view component names. The frac Vite plugin augments this
 * interface in the generated `.frac/views.d.ts` with one key per view
 * file, which narrows {@link ViewName} from `string` to the concrete union.
 */
// Must be exported: TS module augmentation only merges with exported
// declarations. Without `export`, `.frac/views.d.ts` augmentation
// would create a separate interface and `ViewName` would stay `string`.
// biome-ignore lint/suspicious/noEmptyInterface: register pattern — augmented by `.frac/views.d.ts` to narrow ViewName
export interface ViewNameRegistry {}

/** Union of valid view component names. Narrowed by {@link ViewNameRegistry}. */
export type ViewName = keyof ViewNameRegistry & string;

/**
 * Registry of Fractal component names. The frac Vite plugin augments this
 * interface in `.frac/atoms.d.ts` with one key per Fractal file.
 */
// biome-ignore lint/suspicious/noEmptyInterface: register pattern — augmented by `.frac/atoms.d.ts` to narrow AtomName
export interface AtomNameRegistry {}

/** Union of valid Fractal component names. Narrowed by {@link AtomNameRegistry}. */
export type AtomName = keyof AtomNameRegistry & string;

/**
 * Pass under `view` in a tool's `registerTool` config to render the tool's
 * result through a frac view instead of a plain text response.
 */
export interface ViewConfig {
  /** Filename of the view module (without extension) — matches a file in your `viewsDir`. */
  component: ViewName;
  /** Human-readable label the host may show alongside the view. */
  description?: string;
  /** Restrict where the view is rendered. Defaults to all known hosts. */
  hosts?: ViewHostType[];
  /** Apps SDK only: request a visible border around the widget. */
  prefersBorder?: boolean;
  /** Apps SDK only: override the iframe's served domain (advanced). */
  domain?: string;
  /** Per-view CSP overrides — see {@link ViewCsp}. */
  csp?: ViewCsp;
  /** Free-form metadata forwarded on the view resource's `_meta`. */
  _meta?: Record<string, unknown>;
}

/**
 * Registers a React component from the configured Fractals directory as a named
 * Fractal. Fractals are component primitives for later composition; registering one
 * does not expose an MCP tool or view by itself.
 */
export interface AtomConfig<
  TProps extends ZodRawShapeCompat,
  TComponent extends string = AtomName,
> {
  /** Filename of the Fractal module (without extension) — matches a file in your `fractalsDir`. */
  component: TComponent;
  /** Optional public name. Defaults to `component`. */
  name?: string;
  /** Zod-compatible schema describing the props this Fractal accepts. */
  propsSchema: TProps;
  /** Human-readable description of what the Fractal renders. */
  description?: string;
  /** Free-form metadata for future renderers or host integrations. */
  _meta?: Record<string, unknown>;
}

export type SecurityScheme =
  | { type: "noauth" }
  | { type: "oauth2"; scopes?: string[] };

/**
 * Well-known keys recognized by host runtimes when set on a tool's `_meta`.
 * Use {@link ToolMeta} to also pass arbitrary custom metadata alongside these.
 *
 * @see https://developers.openai.com/apps-sdk/reference#tool-descriptor-parameters
 */
export interface KnownToolMeta {
  /** Apps SDK: allow the rendered view to call this tool from inside its iframe. */
  "openai/widgetAccessible"?: boolean;
  /** Apps SDK: status text shown while the tool is running (e.g. `"Searching trips"`). */
  "openai/toolInvocation/invoking"?: string;
  /** Apps SDK: status text shown once the tool returns (e.g. `"Found 3 trips"`). */
  "openai/toolInvocation/invoked"?: string;
  /** Apps SDK: input parameters that hold file references — the host attaches uploaded files to them. */
  "openai/fileParams"?: string[];
  /** MCP Apps: control whether the tool is exposed to the model, the app, or both. */
  ui?: Pick<McpUiToolMeta, "visibility">;
  securitySchemes?: SecurityScheme[];
}

/** {@link KnownToolMeta} merged with arbitrary string-keyed metadata for custom flags. */
export type ToolMeta = KnownToolMeta & Record<string, unknown>;

/**
 * Convenient return type for tool handlers — a plain string, a single
 * {@link ContentBlock}, or an array. frac normalizes it to the MCP
 * `content: ContentBlock[]` shape before responding.
 */
export type HandlerContent = string | ContentBlock | ContentBlock[];

/** @see https://developers.openai.com/apps-sdk/reference#tool-descriptor-parameters */
type ViteManifestEntry = {
  file: string;
  name?: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  css?: string[];
  assets?: string[];
  imports?: string[];
  dynamicImports?: string[];
};

const DEFAULT_RENDER_ATOMS_TOOL_NAME = "show_dashboards";
const RENDER_ATOMS_VIEW_NAME = "__frac_render_atoms";

type OpenaiToolMeta = {
  "openai/outputTemplate": string;
  "openai/widgetAccessible"?: boolean;
  "openai/toolInvocation/invoking"?: string;
  "openai/toolInvocation/invoked"?: string;
  "openai/fileParams"?: string[];
};

/** @see https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#resource-discovery */
type McpAppsToolMeta = {
  ui: McpUiToolMeta;
};

type SecuritySchemesToolMeta = {
  securitySchemes: SecurityScheme[];
};

type InternalToolMeta = Partial<
  OpenaiToolMeta & McpAppsToolMeta & SecuritySchemesToolMeta
>;

/** @see https://developers.openai.com/apps-sdk/reference#component-resource-_meta-fields */
type OpenaiViewCSP = {
  connect_domains: string[];
  resource_domains: string[];
  frame_domains?: string[];
  redirect_domains?: string[];
};

type OpenaiResourceMeta = {
  "openai/widgetDescription"?: string;
  "openai/widgetPrefersBorder"?: boolean;
  "openai/widgetCSP"?: OpenaiViewCSP;
  "openai/widgetDomain"?: string;
};

/**
 * MCP Apps CSP extended with upcoming / frac-specific fields.
 * @see https://github.com/modelcontextprotocol/ext-apps/pull/158
 */
type ExtendedMcpUiResourceCsp = McpUiResourceMeta["csp"] & {
  /**
   * Origins that can receive openExternal redirects without the safe-link modal.
   * OpenAI-specific; mirrored into the mcp-apps CSP for cross-host parity.
   * @see https://developers.openai.com/apps-sdk/reference#component-resource-_meta-fields
   */
  redirectDomains?: string[];
};

type ExtendedMcpUiResourceMeta = Omit<McpUiResourceMeta, "csp"> & {
  csp?: ExtendedMcpUiResourceCsp;
};

type McpAppsResourceMeta = {
  ui?: ExtendedMcpUiResourceMeta;
};

type ResourceMeta = OpenaiResourceMeta | McpAppsResourceMeta;

type ViewResourceConfig<T extends ResourceMeta = ResourceMeta> = {
  hostType: ViewHostType;
  uri: string;
  mimeType: string;
  buildContentMeta: (
    defaults: {
      resourceDomains: string[];
      connectDomains: string[];
      domain: string;
      baseUriDomains: string[];
    },
    overrides: { domain?: string },
  ) => T;
};

/**
 * Type-level marker interface for cross-package type inference.
 *
 * Consumers infer tool types via the structural `$types` property rather than
 * the `McpServer` class generic, because class-generic inference breaks when
 * `McpServer` comes from different package installations (e.g. a consumer
 * with its own `frac` dep vs. the in-tree workspace version).
 *
 * Inspired by tRPC's `_def` pattern and Hono's type markers.
 */
export interface McpServerTypes<
  TTools extends Record<string, ToolDef>,
  TAtoms extends Record<string, AtomDef>,
> {
  readonly tools: TTools;
  readonly atoms: TAtoms;
}

type Simplify<T> = { [K in keyof T]: T[K] };

export type ShapeOutput<Shape extends ZodRawShapeCompat> = Simplify<
  {
    [K in keyof Shape as undefined extends SchemaOutput<Shape[K]>
      ? never
      : K]: SchemaOutput<Shape[K]>;
  } & {
    [K in keyof Shape as undefined extends SchemaOutput<Shape[K]>
      ? K
      : never]?: SchemaOutput<Shape[K]>;
  }
>;

type ExtractStructuredContent<T> = T extends { structuredContent: infer SC }
  ? Simplify<SC>
  : never;

type ExtractMeta<T> = [Extract<T, { _meta: unknown }>] extends [never]
  ? unknown
  : Extract<T, { _meta: unknown }> extends { _meta: infer M }
    ? Simplify<M>
    : unknown;

export type AddTool<
  TTools,
  TAtoms extends Record<string, AtomDef>,
  TName extends string,
  TInput extends ZodRawShapeCompat,
  TOutput,
  TResponseMetadata = unknown,
> = McpServer<
  TTools & {
    [K in TName]: ToolDef<ShapeOutput<TInput>, TOutput, TResponseMetadata>;
  },
  TAtoms
>;

type AddAtom<
  TTools extends Record<string, ToolDef>,
  TAtoms,
  TName extends string,
  TProps extends ZodRawShapeCompat,
> = McpServer<
  TTools,
  TAtoms & {
    [K in TName]: AtomDef<ShapeOutput<TProps>>;
  }
>;

type AtomRenderCorrection = {
  field: string;
  received: string;
  corrected: string;
};

type AtomRenderValidationError = {
  field?: string;
  received?: string;
  allowed?: string[];
  suggested?: string;
  message: string;
};

type AtomRenderCheckResult =
  | {
      ok: true;
      jsx: string;
      corrections: AtomRenderCorrection[];
    }
  | {
      ok: false;
      jsx: string;
      errors: AtomRenderValidationError[];
      corrections: AtomRenderCorrection[];
    };

const ATOM_VALUE_ALIASES: Record<string, string> = {
  large: "lg",
  medium: "md",
  small: "sm",
  success: "green",
};

export interface FracServerOptions extends ServerOptions {
  /** Name for the generated Fractal render tool. Defaults to `show_dashboards`. */
  fractalsRenderToolName?: string;
  /** Additional instructions prepended to the generated Fractal render tool description. */
  fractalsRenderToolDescription?: string;
  /** Directory containing Fractal component files. Defaults to `src/fractals`. */
  fractalsDir?: string;
}

/** @deprecated Use {@link FracServerOptions}. */
export type FractalServerOptions = FracServerOptions;

export interface ToolConfig<TInput extends ZodRawShapeCompat | AnySchema> {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: TInput;
  outputSchema?: ZodRawShapeCompat | AnySchema;
  annotations?: ToolAnnotations;
  view?: ViewConfig;
  /**
   * Declares which auth schemes this tool supports (e.g. `noauth`, `oauth2`).
   * Lets clients label tools that require sign-in before calling, and pass
   * the right scopes through the OAuth flow. Listing both `noauth` and
   * `oauth2` signals that the tool works for anonymous callers and gives
   * enhanced behavior to authenticated ones.
   */
  securitySchemes?: SecurityScheme[];
  _meta?: ToolMeta;
}

/**
 * Optional client-supplied hints attached to `params._meta` on every tool call
 * by the Apps SDK host. Hints only: never use for authorization, and tolerate
 * absence.
 * @see https://developers.openai.com/apps-sdk/reference#_meta-fields-the-client-provides
 */
export interface ClientHintsMeta {
  /** Requested locale (BCP-47, e.g. `"en-US"`). */
  "openai/locale"?: string;
  /** Browser user-agent */
  "openai/userAgent"?: string;
  /** Coarse user location. May be partially populated. */
  "openai/userLocation"?: {
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
    longitude?: number;
    latitude?: number;
  };
  /** Anonymized user id. */
  "openai/subject"?: string;
  /** Anonymized conversation id, stable within a ChatGPT session. */
  "openai/session"?: string;
  /** Anonymized organization id, when the user account is part of an organization. */
  "openai/organization"?: string;
  /** Stable id for the currently mounted widget instance. */
  "openai/widgetSessionId"?: string;
}

export type ToolHandlerExtra = Omit<
  RequestHandlerExtra<ServerRequest, ServerNotification>,
  "_meta"
> & {
  _meta?: RequestMeta & ClientHintsMeta;
};

type ToolHandler<
  TInput extends ZodRawShapeCompat,
  TReturn extends { content?: HandlerContent } = { content?: HandlerContent },
> = (
  args: ShapeOutput<TInput>,
  extra: ToolHandlerExtra,
) => TReturn | Promise<TReturn>;

type ErrorMiddlewareConfig = {
  path?: string;
  handlers: ErrorRequestHandler[];
};

/**
 * Coerce a tool handler's return value into an MCP `content` array. Strings
 * become a single `TextContent`; a single block is wrapped in an array;
 * `undefined` produces `[]`. Mostly used internally — exported so consumers
 * who build content lazily can apply the same normalization.
 */
export function normalizeContent(
  content: HandlerContent | undefined,
): ContentBlock[] {
  if (content === undefined) {
    return [];
  }
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content;
  }
  return [content];
}

// We Omit `registerTool` from the base class at the type level so our
// unified 2-arg signature can replace the SDK's 3-arg one without an
// incompatible override.  The runtime prototype chain is unaffected.
interface McpServerBaseOmitted
  extends Omit<McpServerBase, "registerTool" | "connect"> {}
const McpServerBaseOmitted = McpServerBase as unknown as new (
  ...args: ConstructorParameters<typeof McpServerBase>
) => McpServerBaseOmitted;

/**
 * The frac server. Extends the MCP SDK's `McpServer` with a typed tool
 * registry, view resources, an embedded Express app, and protocol-level
 * middleware. Construct it with the same `Implementation` info you would pass
 * to the SDK, chain {@link McpServer.registerTool} calls to declare tools,
 * then call {@link McpServer.run} to start the HTTP server.
 *
 * The `TTools` generic accumulates each registered tool's input/output/meta
 * shape, so `typeof server` carries enough information for view-side helpers
 * like {@link generateHelpers} to produce fully-typed hooks.
 *
 * @typeParam TTools - Accumulated tool registry. Filled in by `registerTool`
 * chaining; you almost never set this manually.
 *
 * @example
 * ```ts
 * const server = new McpServer({ name: "my-app", version: "1.0.0" }, {})
 *   .registerTool({
 *     name: "search",
 *     inputSchema: { query: z.string() },
 *     view: { component: "search" },
 *   }, async ({ query }) => ({ content: `Results for ${query}` }));
 *
 * await server.run();
 * export type AppType = typeof server;
 * ```
 *
 * @see https://docs.usefractal.dev/api-reference/mcp-server
 */
export class McpServer<
  TTools extends Record<string, ToolDef> = Record<never, ToolDef>,
  TAtoms extends Record<string, AtomDef> = Record<never, AtomDef>,
> extends McpServerBaseOmitted {
  declare readonly $types: McpServerTypes<TTools, TAtoms>;
  /**
   * The underlying Express app. Use this to extend the HTTP server with
   * custom routes, middleware, or settings — e.g.
   * `server.express.get("/health", ...)`.
   *
   * `express.json()` is pre-applied. Register your handlers before `run()`;
   * after `run()`, dev-mode middleware, the `/mcp` route, and the default
   * error handler are appended in that order.
   *
   * Note: some hosted MCP environments only route traffic to `/mcp`;
   * custom routes work locally and on self-hosted deployments.
   */
  readonly express: Express;
  private customErrorMiddleware: ErrorMiddlewareConfig[] = [];
  private mcpMiddlewareEntries: McpMiddlewareEntry[] = [];
  private mcpMiddlewareApplied = false;
  private renderAtomsToolRegistered = false;
  private claimedViews = new Map<string, string>();
  private atoms = new Map<string, AtomConfig<ZodRawShapeCompat, string>>();
  private viewMetaBuilders = new Map<
    string,
    (extra: McpExtra | undefined) => ResourceMeta
  >();
  private viteManifest: Record<string, ViteManifestEntry> | null = null;
  private readonly serverInfo: Implementation;
  private readonly serverOptions?: FracServerOptions;
  private readonly fractalsRenderToolName: string;
  private readonly fractalComponentDirs: string[];

  constructor(serverInfo: Implementation, options?: FracServerOptions) {
    super(serverInfo, options);
    this.serverInfo = serverInfo;
    this.serverOptions = options;
    this.fractalsRenderToolName =
      options?.fractalsRenderToolName ?? DEFAULT_RENDER_ATOMS_TOOL_NAME;
    this.fractalComponentDirs = this.resolveFractalComponentDirs(options);
    this.express = express();
    this.express.use(express.json());
  }

  /**
   * Create a named wormhole for syncing live state and messages between a tool
   * handler and its rendered widget.
   */
  wormhole<TState extends Record<string, unknown>>(
    config: WormholeConfig<TState>,
  ): WormholeBuilder<TState, TTools, TAtoms> {
    return new WormholeBuilder(this, config);
  }

  /**
   * Register Express middleware on the underlying app. Mirrors `app.use` —
   * pass handlers directly or a path-prefixed handler list. Register before
   * {@link McpServer.run}; ordering matches Express.
   *
   * Note: some hosted MCP environments only route traffic to `/mcp`.
   * Custom paths work locally and on self-hosted deployments.
   */
  use(...handlers: RequestHandler[]): this;
  use(path: string, ...handlers: RequestHandler[]): this;
  use(
    pathOrHandler: string | RequestHandler,
    ...handlers: RequestHandler[]
  ): this {
    // Branching is load-bearing: Express's `app.use` overloads can't be
    // resolved against a `string | RequestHandler` union, so we narrow.
    if (typeof pathOrHandler === "string") {
      this.express.use(pathOrHandler, ...handlers);
    } else {
      this.express.use(pathOrHandler, ...handlers);
    }
    return this;
  }

  /**
   * Register Express error-handling middleware to run after the built-in
   * `/mcp` route (or your custom route). Use this to log or transform errors
   * thrown by tool handlers before the default error handler responds.
   *
   * @example
   * ```ts
   * server.useOnError((err, _req, _res, next) => {
   *   logger.error(err);
   *   next(err);
   * });
   * ```
   */
  useOnError(...handlers: ErrorRequestHandler[]): this;
  useOnError(path: string, ...handlers: ErrorRequestHandler[]): this;
  useOnError(
    pathOrHandler: string | ErrorRequestHandler,
    ...handlers: ErrorRequestHandler[]
  ): this {
    if (typeof pathOrHandler === "string") {
      this.customErrorMiddleware.push({ path: pathOrHandler, handlers });
    } else {
      this.customErrorMiddleware.push({
        handlers: [pathOrHandler, ...handlers],
      });
    }
    return this;
  }

  /** Register MCP protocol-level middleware (catch-all). */
  mcpMiddleware(handler: McpMiddlewareFn): this;
  /** Register MCP protocol-level middleware for all requests (`extra` is `McpExtra`). */
  mcpMiddleware(
    filter: "request",
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: McpExtra,
      next: () => Promise<ServerResult>,
    ) => Promise<unknown> | unknown,
  ): this;
  /** Register MCP protocol-level middleware for all notifications (`extra` is `undefined`). */
  mcpMiddleware(
    filter: "notification",
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: undefined,
      next: () => Promise<undefined>,
    ) => Promise<unknown> | unknown,
  ): this;
  /**
   * Register MCP protocol-level middleware for an exact method.
   * Narrows `params`, `extra`, and `next()` result based on the method string.
   */
  mcpMiddleware<M extends McpMethodString>(
    filter: M,
    handler: McpTypedMiddlewareFn<M>,
  ): this;
  /**
   * Register MCP protocol-level middleware for a wildcard pattern (e.g. `"tools/*"`).
   * `next()` returns the union of result types for matching methods.
   */
  mcpMiddleware<W extends McpWildcard>(
    filter: W,
    handler: (
      request: { method: string; params: Record<string, unknown> },
      extra: McpExtraFor<W>,
      next: () => Promise<McpResultFor<W>>,
    ) => Promise<unknown> | unknown,
  ): this;
  /**
   * Register MCP protocol-level middleware with a method filter.
   * Filter can be an exact method (`"tools/call"`), wildcard (`"tools/*"`),
   * category (`"request"` | `"notification"`), or an array of those.
   */
  mcpMiddleware(filter: McpMiddlewareFilter, handler: McpMiddlewareFn): this;
  mcpMiddleware(
    filterOrHandler: McpMiddlewareFilter | McpMiddlewareFn,
    // biome-ignore lint/suspicious/noExplicitAny: overloads narrow the handler type at call sites; implementation must accept all variants
    maybeHandler?: any,
  ): this {
    if (this.mcpMiddlewareApplied) {
      throw new Error(
        "Cannot register MCP middleware after run() or connect() has been called",
      );
    }

    const handler = maybeHandler as McpMiddlewareFn | undefined;

    if (typeof filterOrHandler === "function") {
      this.mcpMiddlewareEntries.push({
        filter: null,
        handler: filterOrHandler,
      });
    } else if (handler) {
      this.mcpMiddlewareEntries.push({
        filter: filterOrHandler,
        handler,
      });
    } else {
      throw new Error(
        "mcpMiddleware requires a handler function when a filter is provided",
      );
    }

    return this;
  }

  private applyMcpMiddleware(): void {
    if (this.mcpMiddlewareApplied) {
      return;
    }
    this.mcpMiddlewareApplied = true;

    // Surface view-resource _meta on `resources/list` (per ext-apps spec:
    // hosts/checkers read CSP & domain at list time before fetching content).
    const viewListMetaEntry: McpMiddlewareEntry = {
      filter: "resources/list",
      handler: async (_req, extra, next) => {
        const result = (await next()) as {
          resources: Array<Record<string, unknown> & { uri: string }>;
        };
        for (const resource of result.resources) {
          const builder = this.viewMetaBuilders.get(resource.uri);
          if (!builder) {
            continue;
          }
          const meta = builder(extra);
          resource._meta = {
            ...((resource._meta as Record<string, unknown>) ?? {}),
            ...meta,
          };
        }
        return result;
      },
    };

    const entries = [viewListMetaEntry, ...this.mcpMiddlewareEntries];

    if (entries.length === 0) {
      return;
    }

    const { requestHandlers, notificationHandlers } = getHandlerMaps(
      this.server,
    );

    const instrumentMap = (
      map: Map<string, (...args: unknown[]) => Promise<unknown>>,
      isNotification: boolean,
    ) => {
      for (const [method, handler] of map) {
        map.set(
          method,
          buildMiddlewareChain(method, isNotification, handler, entries),
        );
      }
      const originalSet = map.set.bind(map);
      map.set = (
        method: string,
        handler: (...args: unknown[]) => Promise<unknown>,
      ) =>
        originalSet(
          method,
          buildMiddlewareChain(method, isNotification, handler, entries),
        );
    };

    instrumentMap(requestHandlers, false);
    instrumentMap(notificationHandlers, true);
  }

  /**
   * Register a React component from `fractalsDir` as a Fractal. The component name is
   * generated by the frac Vite plugin from files in `src/fractals` by default.
   */
  registerFractal<TName extends string, Props extends ZodRawShapeCompat>(
    config: AtomConfig<Props, string> & { name: TName },
  ): AddAtom<TTools, TAtoms, TName, Props>;
  registerFractal<TComponent extends AtomName, Props extends ZodRawShapeCompat>(
    config: AtomConfig<Props, TComponent> & {
      component: TComponent;
      name?: undefined;
    },
  ): AddAtom<TTools, TAtoms, TComponent, Props>;
  registerFractal(config: AtomConfig<ZodRawShapeCompat, string>): unknown {
    return this.registerFractalConfig(config);
  }

  registerAtom<TName extends string, Props extends ZodRawShapeCompat>(
    config: AtomConfig<Props, string> & { name: TName },
  ): AddAtom<TTools, TAtoms, TName, Props>;
  registerAtom<TComponent extends AtomName, Props extends ZodRawShapeCompat>(
    config: AtomConfig<Props, TComponent> & {
      component: TComponent;
      name?: undefined;
    },
  ): AddAtom<TTools, TAtoms, TComponent, Props>;
  registerAtom(config: AtomConfig<ZodRawShapeCompat, string>): unknown {
    return this.registerFractalConfig(config);
  }

  private registerFractalConfig(
    config: AtomConfig<ZodRawShapeCompat, string>,
  ): unknown {
    const name = config.name ?? config.component;
    this.assertValidAtomJsxName(name);
    if (this.atoms.has(name)) {
      throw new Error(`frac: Fractal "${name}" is already registered.`);
    }
    this.atoms.set(name, config);
    return this;
  }

  private assertValidAtomJsxName(name: string): void {
    if (/^[A-Z][A-Za-z0-9_$]*$/.test(name)) {
      return;
    }

    throw new Error(
      `frac: Fractal name "${name}" cannot be used as a JSX component. Use a PascalCase Fractal name, e.g. registerFractal({ name: "ProductCard", component: "${name}", propsSchema: ... }).`,
    );
  }

  private ensureRenderAtomsToolRegistered(): void {
    if (this.renderAtomsToolRegistered || this.atoms.size === 0) {
      return;
    }

    this.renderAtomsToolRegistered = true;
    this.registerTool(
      {
        name: this.fractalsRenderToolName,
        description: this.buildRenderAtomsToolDescription(),
        inputSchema: {
          jsx: z
            .string()
            .describe(
              "A single valid JSX tree using only registered Fractal component names and their documented props. Do not include imports, exports, function definitions, markdown, code fences, or comments. Use string props in quotes, number props in braces, and pass arrays or objects through the `props` object instead of inline literals.",
            ),
          props: z.record(z.string(), z.unknown()).optional(),
        },
        view: {
          component: RENDER_ATOMS_VIEW_NAME as ViewName,
          description: "Renders JSX composed from registered Fractals.",
        },
      },
      async ({ jsx, props }) => {
        const atomList = [...this.atoms.entries()].map(([name, atom]) => ({
          name,
          component: atom.component,
          filePath: this.resolveAtomFile(atom.component),
          propsSchema: atom.propsSchema,
        }));
        const check = this.checkAtomJsx({
          jsx,
          props: props ?? {},
          atoms: atomList,
        });

        if (!check.ok) {
          return {
            content: this.formatAtomRenderErrors(check.errors),
            isError: true,
            structuredContent: {
              jsx: check.jsx,
              props: props ?? {},
              errors: check.errors,
              corrections: check.corrections,
            },
          };
        }

        return {
          content:
            check.corrections.length > 0
              ? `Rendered JSX from registered Fractals. Applied ${check.corrections.length} correction(s).`
              : "Rendered JSX from registered Fractals.",
          structuredContent: {
            jsx: check.jsx,
            props: props ?? {},
            corrections: check.corrections,
          },
        };
      },
    );
  }

  private resolveAtomFile(component: string): string {
    const candidates = this.fractalComponentDirs.flatMap((dir) => {
      const fractalsDir = path.isAbsolute(dir)
        ? dir
        : path.join(process.cwd(), dir);

      return [
        path.join(fractalsDir, `${component}.tsx`),
        path.join(fractalsDir, `${component}.jsx`),
        path.join(fractalsDir, component, "index.tsx"),
        path.join(fractalsDir, component, "index.jsx"),
      ];
    });
    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new Error(
        `frac: Fractal component "${component}" was registered but no matching file was found in ${this.fractalComponentDirs.join(" or ")}.`,
      );
    }
    return found;
  }

  private resolveFractalComponentDirs(options?: FracServerOptions): string[] {
    const configuredDir = options?.fractalsDir;
    if (configuredDir) {
      return [configuredDir];
    }

    return ["src/fractals"];
  }

  private checkAtomJsx({
    jsx,
    props,
    atoms,
  }: {
    jsx: string;
    props: Record<string, unknown>;
    atoms: Array<{
      name: string;
      filePath: string;
      propsSchema: ZodRawShapeCompat;
    }>;
  }): AtomRenderCheckResult {
    const normalized = this.normalizeAtomJsx({ jsx, atoms });
    if (normalized.errors.length > 0) {
      return {
        ok: false,
        jsx: normalized.jsx,
        errors: normalized.errors,
        corrections: normalized.corrections,
      };
    }

    const fileName = path.join(process.cwd(), ".frac", "render-atoms.tsx");
    const atomImports = atoms
      .map((atom, index) => {
        return `import Atom${index} from ${JSON.stringify(this.stripJsxExtension(atom.filePath))};`;
      })
      .join("\n");
    const atomAliases = atoms
      .map((atom, index) => {
        return `const ${atom.name} = Atom${index};`;
      })
      .join("\n");
    const source = [
      'import * as React from "react";',
      atomImports,
      atomAliases,
      this.buildAtomTypesSnippet(),
      "const __fracAtomTypes = null as unknown as RegisteredAtoms;",
      "void __fracAtomTypes;",
      `const props = ${JSON.stringify(props)} as const;`,
      `const __fracNode = <>${normalized.jsx}</>;`,
      "void __fracNode;",
    ].join("\n");

    const compilerOptions: ts.CompilerOptions = {
      ...this.readAppCompilerOptions(),
      allowJs: true,
      allowImportingTsExtensions: true,
      checkJs: true,
      composite: false,
      declaration: false,
      declarationMap: false,
      incremental: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noUnusedLocals: false,
      noUnusedParameters: false,
      outDir: undefined,
      rootDir: undefined,
      sourceMap: false,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      tsBuildInfoFile: undefined,
    };
    const host = ts.createCompilerHost(compilerOptions, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (
      requestedFileName,
      languageVersionOrOptions,
      onError,
      shouldCreateNewSourceFile,
    ) => {
      if (path.resolve(requestedFileName) === path.resolve(fileName)) {
        return ts.createSourceFile(
          fileName,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      }
      return originalGetSourceFile(
        requestedFileName,
        languageVersionOrOptions,
        onError,
        shouldCreateNewSourceFile,
      );
    };

    const program = ts.createProgram([fileName], compilerOptions, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length === 0) {
      return {
        ok: true,
        jsx: normalized.jsx,
        corrections: normalized.corrections,
      };
    }

    return {
      ok: false,
      jsx: normalized.jsx,
      errors: diagnostics.map((diagnostic) => ({
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      })),
      corrections: normalized.corrections,
    };
  }

  private normalizeAtomJsx({
    jsx,
    atoms,
  }: {
    jsx: string;
    atoms: Array<{
      name: string;
      propsSchema: ZodRawShapeCompat;
    }>;
  }): {
    jsx: string;
    corrections: AtomRenderCorrection[];
    errors: AtomRenderValidationError[];
  } {
    const sourcePrefix = "<>";
    const sourceFile = ts.createSourceFile(
      "render-atoms-input.tsx",
      `${sourcePrefix}${jsx}</>`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const atomSchemas = new Map(
      atoms.map((atom) => [atom.name, atom.propsSchema]),
    );
    const corrections: AtomRenderCorrection[] = [];
    const errors: AtomRenderValidationError[] = [];
    const replacements: Array<{ start: number; end: number; text: string }> =
      [];

    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        const propsSchema = atomSchemas.get(tagName);
        if (propsSchema) {
          for (const property of node.attributes.properties) {
            if (!ts.isJsxAttribute(property)) {
              continue;
            }
            const propName = property.name.getText(sourceFile);
            const allowed = this.getEnumValues(propsSchema[propName]);
            if (!allowed) {
              continue;
            }

            const value = this.readJsxAttributeValue(
              property.initializer,
              sourceFile,
            );
            if (!value) {
              continue;
            }

            const field = `${tagName}.${propName}`;
            if (allowed.includes(value.value)) {
              if (value.needsStringLiteral) {
                replacements.push({
                  start: value.start - sourcePrefix.length,
                  end: value.end - sourcePrefix.length,
                  text: JSON.stringify(value.value),
                });
                corrections.push({
                  field,
                  received: `{${value.value}}`,
                  corrected: value.value,
                });
              }
              continue;
            }

            const suggested = this.suggestAtomPropValue(value.value, allowed);
            if (suggested) {
              replacements.push({
                start: value.start - sourcePrefix.length,
                end: value.end - sourcePrefix.length,
                text: JSON.stringify(suggested),
              });
              corrections.push({
                field,
                received: value.value,
                corrected: suggested,
              });
              continue;
            }

            errors.push({
              field,
              received: value.value,
              allowed,
              message: `${field} received ${JSON.stringify(value.value)}, but allowed values are ${allowed.map((item) => JSON.stringify(item)).join(", ")}.`,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    let normalized = jsx;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      normalized =
        normalized.slice(0, replacement.start) +
        replacement.text +
        normalized.slice(replacement.end);
    }

    return { jsx: normalized, corrections, errors };
  }

  private readJsxAttributeValue(
    initializer: ts.JsxAttribute["initializer"],
    sourceFile: ts.SourceFile,
  ):
    | {
        value: string;
        start: number;
        end: number;
        needsStringLiteral?: boolean;
      }
    | undefined {
    if (!initializer) {
      return {
        value: "true",
        start: 0,
        end: 0,
      };
    }

    if (ts.isStringLiteral(initializer)) {
      return {
        value: initializer.text,
        start: initializer.getStart(sourceFile),
        end: initializer.getEnd(),
      };
    }

    if (!ts.isJsxExpression(initializer) || !initializer.expression) {
      return undefined;
    }

    const expression = initializer.expression;
    if (ts.isNumericLiteral(expression)) {
      return {
        value: expression.text,
        start: initializer.getStart(sourceFile),
        end: initializer.getEnd(),
        needsStringLiteral: true,
      };
    }

    if (ts.isStringLiteral(expression)) {
      return {
        value: expression.text,
        start: initializer.getStart(sourceFile),
        end: initializer.getEnd(),
      };
    }

    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
      return {
        value: "true",
        start: initializer.getStart(sourceFile),
        end: initializer.getEnd(),
      };
    }

    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
      return {
        value: "false",
        start: initializer.getStart(sourceFile),
        end: initializer.getEnd(),
      };
    }

    return undefined;
  }

  private suggestAtomPropValue(
    received: string,
    allowed: string[],
  ): string | undefined {
    if (allowed.includes(received)) {
      return received;
    }

    const alias = ATOM_VALUE_ALIASES[received];
    if (alias && allowed.includes(alias)) {
      return alias;
    }

    return undefined;
  }

  private getEnumValues(schema: unknown): string[] | undefined {
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
      return this.getEnumValues((schema as { unwrap: () => unknown }).unwrap());
    }

    if (schema instanceof z.ZodEnum) {
      return schema.options.filter((option): option is string => {
        return typeof option === "string";
      });
    }

    return undefined;
  }

  private formatAtomRenderErrors(errors: AtomRenderValidationError[]): string {
    return errors
      .map((error) => {
        if (!error.field) {
          return error.message;
        }

        const details = [
          error.message,
          error.allowed ? `Allowed: ${error.allowed.join(", ")}` : undefined,
          error.suggested ? `Suggested: ${error.suggested}` : undefined,
        ].filter(Boolean);

        return details.join("\n");
      })
      .join("\n\n");
  }

  private stripJsxExtension(filePath: string): string {
    return filePath.replace(/\.[cm]?[jt]sx$/, "");
  }

  private readAppCompilerOptions(): ts.CompilerOptions {
    const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists);
    if (!configPath) {
      return {};
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      return {};
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );
    return parsed.options;
  }

  private buildRenderAtomsToolDescription(): string {
    const customDescription = this.serverOptions?.fractalsRenderToolDescription;

    const contractDescription = [
      "Allowed prop values:",
      this.buildAtomEnumValuesDescription(),
      "",
      "Registered Fractal prop contract:",
      "```ts",
      this.buildAtomTypesSnippet(),
      "```",
    ];

    if (customDescription) {
      return [customDescription, "", ...contractDescription].join("\n");
    }

    return [
      "Render a useful UI for natural user requests using this app's registered Fractals.",
      "Use this tool when the user asks for a dashboard, report, KPI view, metrics panel, status update, weekly brief, summary, table, timeline, checklist, risk view, or visual layout.",
      'The user does not need to ask for JSX or mention Fractals. If they say something like "Give me a dashboard for Activation Rate, Support Tickets, Conversion Rate", infer an appropriate layout and generate the JSX yourself.',
      "Use only registered Fractals and their prop contracts. The JSX is TypeScript-checked before rendering.",
      "Use the `props` object for dynamic arrays, objects, or larger data values that should be referenced from JSX expressions.",
      "",
      "Example natural requests this tool should handle:",
      "- Give me a dashboard for Activation Rate, Support Tickets, Conversion Rate.",
      "- Show launch health.",
      "- Summarize these KPIs.",
      "- Make a weekly business brief.",
      "- Create a support status view.",
      "",
      "Layout recipes:",
      "- 1-3 metrics: use `Stack`, a `HeroPanel`, and a `Grid` of `MetricCard` Fractals.",
      "- Metrics plus risks or recommendations: add a `Callout`.",
      "- Observations or takeaways: add an `InsightList`.",
      "- Ordered events: use a `Timeline`.",
      "- Tasks or next steps: use a `Checklist`.",
      "- Facts, settings, or attributes: use a `KeyValueList`.",
      "- Structured rows and columns: use a `DataTable`.",
      "",
      ...contractDescription,
    ].join("\n");
  }

  private buildAtomEnumValuesDescription(): string {
    const entries = [...this.atoms.entries()].flatMap(([atomName, atom]) => {
      return Object.entries(atom.propsSchema).flatMap(([propName, schema]) => {
        const allowed = this.getEnumValues(schema);
        if (!allowed || allowed.length === 0) {
          return [];
        }

        return `- \`${atomName}.${propName}\`: ${allowed.map((value) => `\`${value}\``).join(", ")}`;
      });
    });

    if (entries.length === 0) {
      return "- No enum props are registered.";
    }

    return entries.join("\n");
  }

  private buildAtomTypesSnippet(): string {
    const entries = [...this.atoms.entries()]
      .map(([name, atom]) => {
        return `  ${JSON.stringify(name)}: ${this.propsSchemaToTypeLiteral(atom.propsSchema)};`;
      })
      .join("\n");

    return ["type RegisteredAtoms = {", entries, "};"].join("\n");
  }

  private propsSchemaToTypeLiteral(shape: ZodRawShapeCompat): string {
    const entries = Object.entries(shape).map(([name, schema]) => {
      const optional = this.isOptionalSchema(schema);
      return `  ${JSON.stringify(name)}${optional ? "?" : ""}: ${this.schemaToType(schema)};`;
    });

    return ["{", entries.join("\n"), "}"].join("\n");
  }

  private isOptionalSchema(schema: unknown): boolean {
    return schema instanceof z.ZodOptional;
  }

  private schemaToType(schema: unknown): string {
    if (schema instanceof z.ZodString) {
      return "string";
    }
    if (schema instanceof z.ZodNumber) {
      return "number";
    }
    if (schema instanceof z.ZodBoolean) {
      return "boolean";
    }
    if (schema instanceof z.ZodNull) {
      return "null";
    }
    if (schema instanceof z.ZodUndefined) {
      return "undefined";
    }
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
      const inner = (schema as { unwrap: () => unknown }).unwrap();
      return `${this.schemaToType(inner)}${schema instanceof z.ZodNullable ? " | null" : ""}`;
    }
    if (schema instanceof z.ZodArray) {
      const element = (schema as { element: unknown }).element;
      return `${this.schemaToType(element)}[]`;
    }
    if (schema instanceof z.ZodObject) {
      const objectShape = (schema as { shape: ZodRawShapeCompat }).shape;
      return this.propsSchemaToTypeLiteral(objectShape);
    }
    return "unknown";
  }

  /**
   * Connect to an MCP transport (override of the SDK's `connect`). Use this
   * when you're embedding frac in a host that already manages its own
   * transport (e.g. stdio for desktop apps); for HTTP, prefer {@link McpServer.run}
   * which sets the transport up for you. Locks in any middleware registered
   * via {@link McpServer.mcpMiddleware} — further calls to that method will
   * throw afterwards.
   */
  async connect(
    transport: Parameters<typeof McpServerBase.prototype.connect>[0],
  ): Promise<void> {
    this.ensureRenderAtomsToolRegistered();
    this.applyMcpMiddleware();
    return McpServerBase.prototype.connect.call(this, transport);
  }

  /**
   * Per-request stateless connect. The SDK's `Protocol` only allows one
   * transport per instance, so we can't reuse this `McpServer` across
   * concurrent requests. The SDK's idiomatic fix is a `() => McpServer`
   * factory, but that would break frac's singleton API — so instead
   * we build a fresh underlying `Server` per request and share the main
   * server's handler maps by reference. The cast is unavoidable: there's
   * no public API to inject handler maps. `getHandlerMaps` validates the
   * read side and fails fast on SDK field renames.
   */
  async connectStatelessTransport(
    transport: Parameters<typeof McpServerBase.prototype.connect>[0],
  ): Promise<void> {
    this.ensureRenderAtomsToolRegistered();
    this.applyMcpMiddleware();

    const { requestHandlers, notificationHandlers } = getHandlerMaps(
      this.server,
    );
    const fresh = new SdkServer(this.serverInfo, this.serverOptions);
    const target = fresh as unknown as {
      _requestHandlers: unknown;
      _notificationHandlers: unknown;
    };
    target._requestHandlers = requestHandlers;
    target._notificationHandlers = notificationHandlers;

    await fresh.connect(transport);
  }

  /**
   * Start the HTTP server. Listens on `process.env.__PORT` (default `3000`),
   * mounts the `/mcp` route, applies any custom Express middleware registered
   * via {@link McpServer.use} / {@link McpServer.useOnError}, and locks in
   * any MCP middleware registered via {@link McpServer.mcpMiddleware}.
   *
   * On Cloudflare Workers / workerd, returns an object exposing `fetch` so
   * the runtime can bridge incoming requests to the Node HTTP server. On
   * Node, returns `undefined` once listening.
   */
  async run(): Promise<{ fetch: (...args: unknown[]) => unknown } | undefined> {
    this.ensureRenderAtomsToolRegistered();
    this.applyMcpMiddleware();
    const httpServer = http.createServer();

    await createApp({
      mcpServer: this,
      httpServer,
      errorMiddleware: this.customErrorMiddleware,
    });

    httpServer.on("request", this.express);
    const port = parseInt(process.env.__PORT ?? "3000", 10);
    await new Promise<void>((resolve, reject) => {
      httpServer.on("error", (error: Error) => {
        console.error("Failed to start server:", error);
        reject(error);
      });
      httpServer.listen(port, () => {
        resolve();
      });
    });

    // On workerd, bridge the Node http server to a Workers fetch handler.
    // The specifier is held in a variable to sidestep tsc's module resolution
    // (`cloudflare:node` only exists under wrangler/workerd).
    if (
      typeof navigator !== "undefined" &&
      navigator.userAgent === "Cloudflare-Workers"
    ) {
      const cloudflareNode = "cloudflare:node";
      const { httpServerHandler } = await import(cloudflareNode);
      return httpServerHandler({ port });
    }

    const shutdown = () => {
      // Drop both handlers so a second signal falls through to Node's default
      // (force-quit on a second Ctrl+C while drain is hanging).
      process.off("SIGTERM", shutdown);
      process.off("SIGINT", shutdown);
      httpServer.close(() => process.exit(0));
      // Force exit if connections don't drain in time so the port is still
      // released promptly (e.g. for nodemon restarts).
      setTimeout(() => process.exit(0), 3000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
    return undefined;
  }

  private enforceOneToolPerView(component: string, toolName: string): void {
    const existingTool = this.claimedViews.get(component);
    if (existingTool) {
      throw new Error(
        `frac: view "${component}" is already used by tool "${existingTool}". Tool "${toolName}" cannot also reference it — each view backs exactly one tool.`,
      );
    }
    this.claimedViews.set(component, toolName);
  }

  private resolveViewRequestContext(extra: McpExtra | undefined): {
    serverUrl: string;
    connectDomains: string[];
    contentMetaOverrides: { domain?: string };
  } {
    const isProduction = process.env.NODE_ENV === "production";
    const headers = extra?.requestInfo?.headers || {};
    const header = (key: string) => {
      const val = headers[key];
      return Array.isArray(val) ? val[0] : val;
    };
    const isClaude = header("user-agent") === "Claude-User";

    let serverUrl: string;
    const forwardedHost = header("x-forwarded-host");
    const origin = header("origin");
    const host = header("host");

    if (forwardedHost) {
      const proto = header("x-forwarded-proto") || "https";
      serverUrl = `${proto}://${forwardedHost}`;
    } else if (origin) {
      serverUrl = origin;
    } else if (host) {
      const proto = ["127.0.0.1:", "localhost:"].some((p) => host.startsWith(p))
        ? "http"
        : "https";
      serverUrl = `${proto}://${host}`;
    } else {
      const devPort = process.env.__PORT || "3000";
      serverUrl = `http://localhost:${devPort}`;
    }

    const connectDomains = [serverUrl];
    if (!isProduction) {
      const wsUrl = new URL(serverUrl);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      connectDomains.push(wsUrl.origin);
    }

    let contentMetaOverrides: { domain?: string } = {};
    if (isClaude) {
      const pathname = extra?.requestInfo?.url?.pathname ?? "";
      const rawUrl = header("x-forwarded-url") ?? `${serverUrl}${pathname}`;
      // Strip a lone trailing slash so the hash matches the connector URL
      // as registered with Claude (which has no trailing slash on bare origins).
      const url = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
      const hash = crypto
        .createHash("sha256")
        .update(url)
        .digest("hex")
        .slice(0, 32);
      contentMetaOverrides = { domain: `${hash}.claudemcpcontent.com` };
    }

    return { serverUrl, connectDomains, contentMetaOverrides };
  }

  private registerViewResources(
    toolName: string,
    view: ViewConfig,
    toolMeta: InternalToolMeta,
  ): void {
    const hosts = view.hosts ?? (["apps-sdk", "mcp-app"] as const);

    // Append a content-derived version param so hosts (e.g. ChatGPT) bust
    // their cache when the bundle changes, but keep the URI stable across
    // `tools/list` calls when the bundle hasn't changed.
    const versionParam = this.computeViewVersionParam(view.component);

    if (hosts.includes("apps-sdk")) {
      const viewResource: ViewResourceConfig<OpenaiResourceMeta> = {
        hostType: "apps-sdk",
        uri: `ui://views/apps-sdk/${view.component}.html${versionParam}`,
        mimeType: "text/html+frac",
        buildContentMeta: (
          { resourceDomains, connectDomains, domain },
          overrides,
        ) => {
          const defaults: OpenaiResourceMeta = {
            "openai/widgetCSP": {
              resource_domains: resourceDomains,
              connect_domains: connectDomains,
            },
            "openai/widgetDomain": domain,
            "openai/widgetDescription": view.description,
          };

          const fromView: Partial<
            Omit<
              OpenaiResourceMeta,
              "openai/widgetCSP" | "openai/widgetDescription"
            > & {
              "openai/widgetCSP": Partial<OpenaiViewCSP>;
            }
          > = {
            "openai/widgetCSP": {
              resource_domains: view.csp?.resourceDomains,
              connect_domains: view.csp?.connectDomains,
              frame_domains: view.csp?.frameDomains,
              redirect_domains: view.csp?.redirectDomains,
            },
            "openai/widgetDomain": view.domain,
            "openai/widgetPrefersBorder": view.prefersBorder,
          };

          const base = mergeWithUnion(mergeWithUnion(defaults, fromView), {
            "openai/widgetDomain": overrides.domain,
          });

          if (view._meta) {
            return { ...base, ...view._meta } as OpenaiResourceMeta;
          }
          return base;
        },
      };
      this.registerViewResource({
        name: toolName,
        viewResource,
        view,
      });
      toolMeta["openai/outputTemplate"] = viewResource.uri;
    }

    if (hosts.includes("mcp-app")) {
      const viewResource: ViewResourceConfig<McpAppsResourceMeta> = {
        hostType: "mcp-app",
        uri: `ui://views/ext-apps/${view.component}.html${versionParam}`,
        mimeType: "text/html;profile=mcp-app",
        buildContentMeta: (
          { resourceDomains, connectDomains, domain, baseUriDomains },
          overrides,
        ) => {
          const defaults: McpAppsResourceMeta = {
            ui: {
              csp: {
                resourceDomains,
                connectDomains,
                baseUriDomains,
              },
              domain,
            },
          };

          const fromView: McpAppsResourceMeta = {
            ui: {
              ...(view.description && { description: view.description }),
              ...(view.prefersBorder !== undefined && {
                prefersBorder: view.prefersBorder,
              }),
              ...(view.domain && { domain: view.domain }),
              csp: {
                ...(view.csp?.resourceDomains && {
                  resourceDomains: view.csp.resourceDomains,
                }),
                ...(view.csp?.connectDomains && {
                  connectDomains: view.csp.connectDomains,
                }),
                ...(view.csp?.frameDomains && {
                  frameDomains: view.csp.frameDomains,
                }),
                ...(view.csp?.baseUriDomains && {
                  baseUriDomains: view.csp.baseUriDomains,
                }),
                ...(view.csp?.redirectDomains && {
                  redirectDomains: view.csp.redirectDomains,
                }),
              },
            },
          };

          const base = mergeWithUnion(mergeWithUnion(defaults, fromView), {
            ui: overrides,
          });

          if (view._meta) {
            return { ...base, ...view._meta } as McpAppsResourceMeta;
          }
          return base;
        },
      };
      this.registerViewResource({
        name: toolName,
        viewResource,
        view,
      });
      // @ts-expect-error - For backwards compatibility with Claude current implementation of the specs
      toolMeta["ui/resourceUri"] = viewResource.uri;

      toolMeta.ui = { ...toolMeta.ui, resourceUri: viewResource.uri };
    }
  }

  private registerViewResource({
    name,
    viewResource,
    view,
  }: {
    name: string;
    viewResource: ViewResourceConfig;
    view: ViewConfig;
  }): void {
    const { hostType, uri: viewUri, mimeType, buildContentMeta } = viewResource;

    const buildMeta = (extra: McpExtra | undefined): ResourceMeta => {
      const { serverUrl, connectDomains, contentMetaOverrides } =
        this.resolveViewRequestContext(extra);
      return buildContentMeta(
        {
          resourceDomains: [serverUrl],
          connectDomains,
          domain: serverUrl,
          baseUriDomains: [serverUrl],
        },
        contentMetaOverrides,
      );
    };
    this.viewMetaBuilders.set(viewUri, buildMeta);

    this.registerResource(
      name,
      viewUri,
      { description: view.description },
      async (uri, extra) => {
        const isProduction = process.env.NODE_ENV === "production";
        const { serverUrl } = this.resolveViewRequestContext(extra);

        const html = isProduction
          ? templateHelper.renderProduction({
              hostType,
              serverUrl,
              viewFile: this.lookupViewFile(view.component),
              styleFile: this.lookupDistFile("style.css") ?? "",
            })
          : templateHelper.renderDevelopment({
              hostType,
              serverUrl,
              viewName: view.component,
            });

        return {
          contents: [
            { uri: uri.href, mimeType, text: html, _meta: buildMeta(extra) },
          ],
        };
      },
    );
  }

  private wrapHandler<InputArgs extends ZodRawShapeCompat>(
    cb: ToolHandler<InputArgs>,
    { attachViewUUID }: { attachViewUUID: boolean },
  ): ToolHandler<InputArgs> {
    return async (args, extra) => {
      const result = await cb(args, extra);
      return {
        ...result,
        content: normalizeContent(result.content),
        ...(attachViewUUID && {
          _meta: {
            ...(result as { _meta?: Record<string, unknown> })._meta,
            viewUUID: crypto.randomUUID(),
          },
        }),
      };
    };
  }

  private computeViewVersionParam(viewName: string): string {
    if (process.env.NODE_ENV !== "production") {
      return "";
    }
    try {
      const viewFile = this.lookupViewFile(viewName);
      const styleFile = this.lookupDistFile("style.css") ?? "";
      const hash = crypto
        .createHash("sha256")
        .update(viewFile)
        .update("\0")
        .update(styleFile)
        .digest("hex")
        .slice(0, 8);
      return `?v=${hash}`;
    } catch {
      return "";
    }
  }

  private lookupViewFile(viewName: string) {
    const manifest = this.readManifest();
    for (const entry of Object.values(manifest)) {
      if (entry?.isEntry && entry.name === viewName && entry.file) {
        return entry.file;
      }
    }
    throw new Error(
      `View "${viewName}" not found in Vite manifest. Did the build complete successfully? Look for an entry with name "${viewName}" in dist/assets/.vite/manifest.json.`,
    );
  }

  private lookupDistFile(key: string) {
    const manifest = this.readManifest();
    return manifest[key]?.file;
  }

  /**
   * Inject the Vite manifest as a value rather than letting `readManifest()`
   * load it from disk. Required for runtimes without a usable filesystem
   * (Cloudflare Workers, etc.) — the user's `frac build` emits the
   * manifest as a JS module which the entry imports and passes here.
   */
  setViteManifest(manifest: Record<string, { file: string }>): this {
    this.viteManifest = manifest as Record<string, ViteManifestEntry>;
    return this;
  }

  private readManifest(): Record<string, ViteManifestEntry> {
    if (this.viteManifest) {
      return this.viteManifest;
    }
    return JSON.parse(
      readFileSync(
        path.join(process.cwd(), "dist", "assets", ".vite", "manifest.json"),
        "utf-8",
      ),
    );
  }

  /**
   * Register a tool. Pass a `config` describing the tool (name, schemas,
   * optional {@link ViewConfig}, optional {@link ToolMeta}) and a handler that
   * returns the tool's result.
   *
   * Chain calls to build up a server: each call returns a new `McpServer`
   * type that captures the tool's input/output/`_meta` shape so the
   * resulting `typeof server` can drive {@link generateHelpers}.
   *
   * The handler's return shape determines the output types: the
   * `structuredContent` field becomes the tool's typed output, and `_meta`
   * becomes its `responseMetadata`. The `content` field is normalized through
   * {@link normalizeContent}.
   *
   * @example
   * ```ts
   * server.registerTool({
   *   name: "search",
   *   inputSchema: { query: z.string() },
   *   outputSchema: { results: z.array(z.string()) },
   *   view: { component: "search" },
   * }, async ({ query }) => ({
   *   content: `Found results for ${query}`,
   *   structuredContent: { results: [...] },
   * }));
   * ```
   *
   * @see https://docs.usefractal.dev/api-reference/register-tool
   */
  registerTool<
    TName extends string,
    InputArgs extends ZodRawShapeCompat,
    TReturn extends { content?: HandlerContent },
  >(
    config: ToolConfig<InputArgs> & { name: TName },
    cb: ToolHandler<InputArgs, TReturn>,
  ): AddTool<
    TTools,
    TAtoms,
    TName,
    InputArgs,
    ExtractStructuredContent<TReturn>,
    ExtractMeta<TReturn>
  >;
  registerTool<InputArgs extends ZodRawShapeCompat>(
    config: ToolConfig<InputArgs>,
    cb: ToolHandler<InputArgs>,
  ): this;
  registerTool(...args: unknown[]): unknown {
    const baseFn = McpServerBase.prototype.registerTool as (
      ...args: unknown[]
    ) => unknown;

    if (typeof args[0] === "string") {
      baseFn.call(this, args[0], args[1], args[2]);
      return this;
    }

    const config = args[0] as ToolConfig<ZodRawShapeCompat>;
    const cb = args[1] as ToolHandler<ZodRawShapeCompat>;

    const {
      name,
      view,
      securitySchemes,
      _meta: userToolMeta,
      ...toolFields
    } = config;

    const toolMeta: InternalToolMeta = { ...userToolMeta };

    if (securitySchemes) {
      // SEP-1488 puts `securitySchemes` at the top level of the tool
      // descriptor, but the SDK's `registerTool` drops unknown top-level
      // fields, so the canonical spot isn't reachable without intercepting
      // `tools/list`. Use the `_meta` back-compat mirror documented in the
      // Apps SDK reference until SEP-1488 lands in the spec.
      toolMeta.securitySchemes = securitySchemes;
    }

    if (view) {
      this.enforceOneToolPerView(view.component, name);
      this.registerViewResources(name, view, toolMeta);
    }

    const wrappedCb = this.wrapHandler(cb, { attachViewUUID: Boolean(view) });

    baseFn.call(this, name, { ...toolFields, _meta: toolMeta }, wrappedCb);

    return this;
  }
}
