import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { z } from "zod";
import type {
  AddTool,
  AtomDef,
  HandlerContent,
  McpServer,
  ShapeOutput,
  ToolConfig,
  ToolDef,
  ToolHandlerExtra,
  ViewConfig,
  ViewName,
} from "./server.js";

type WormholeMutationResult =
  | string
  | {
      content?: HandlerContent;
      structuredContent?: Record<string, unknown>;
      _meta?: Record<string, unknown>;
    };

type WormholeToolConfig<TInput extends ZodRawShapeCompat> = Omit<
  ToolConfig<TInput>,
  "view"
>;

type TrackedState<TState extends Record<string, unknown>> = {
  state: TState;
  wasMutated(): boolean;
};

export type WormholeToken = {
  token: string;
  tokenType: "Bearer";
  wormholeId: string;
  organizationId: string;
  exp: number;
  expiresAt: string;
};

export type WormholeConnection = {
  name: string;
  url: string;
  tokenExpiresAt: string;
};

export type WormholeToolContext<TState extends Record<string, unknown>> = {
  name: string;
  state: TState;
  message: {
    send(message: unknown): Promise<void>;
  };
  token(options?: WormholeTokenOptions): Promise<WormholeToken>;
  url(options?: WormholeTokenOptions): Promise<string>;
  setState(state: TState): void;
};

export type WormholeTokenOptions = {
  ttl?: number;
  ttlSeconds?: number;
  exp?: number | string | Date;
};

export type WormholeConfig<TState extends Record<string, unknown>> = {
  name: string;
  stateSchema: z.ZodType<TState>;
  defaultState: TState;
  ttl?: number;
};

export type WormholeWidgetConfig = Omit<ViewConfig, "component"> & {
  component: ViewName;
};

function createTrackedState<TState extends Record<string, unknown>>(
  initialState: TState,
): TrackedState<TState> {
  let mutated = false;
  const proxies = new WeakMap<object, unknown>();

  const proxify = <TValue>(value: TValue): TValue => {
    if (value === null || typeof value !== "object") {
      return value;
    }

    const existing = proxies.get(value);
    if (existing) {
      return existing as TValue;
    }

    const proxy = new Proxy(value, {
      get(target, property, receiver) {
        return proxify(Reflect.get(target, property, receiver));
      },
      set(target, property, nextValue, receiver) {
        mutated = true;
        return Reflect.set(target, property, nextValue, receiver);
      },
      deleteProperty(target, property) {
        mutated = true;
        return Reflect.deleteProperty(target, property);
      },
    });

    proxies.set(value, proxy);
    return proxy as TValue;
  };

  return {
    state: proxify(initialState),
    wasMutated: () => mutated,
  };
}

function cloneWormholeState<TState extends Record<string, unknown>>(
  state: TState,
): TState {
  return structuredClone(state);
}

function normalizeWormholeResult(result: WormholeMutationResult): {
  content?: HandlerContent;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
} {
  if (typeof result === "string") {
    return { content: result };
  }
  return result;
}

class WormholePlatformClient {
  private readonly platformUrl: string;
  private readonly fractalToken: string;

  constructor() {
    this.platformUrl = (process.env.FRACTAL_PLATFORM_URL ?? "").replace(
      /\/+$/,
      "",
    );
    this.fractalToken = process.env.FRACTAL_TOKEN ?? "";
  }

  async mintToken(
    name: string,
    options: WormholeTokenOptions | undefined,
  ): Promise<WormholeToken> {
    const body: Record<string, number | string> = {};
    if (options?.ttl !== undefined) {
      body.ttl = options.ttl;
    }
    if (options?.ttlSeconds !== undefined) {
      body.ttlSeconds = options.ttlSeconds;
    }
    if (options?.exp instanceof Date) {
      body.exp = options.exp.toISOString();
    } else if (options?.exp !== undefined) {
      body.exp = options.exp;
    }

    return this.post<WormholeToken>(name, "token", body);
  }

  async setState<TState extends Record<string, unknown>>(
    name: string,
    state: TState,
  ): Promise<void> {
    await this.post(name, "state", state);
  }

  async sendMessage(name: string, message: unknown): Promise<void> {
    await this.post(name, "message", message);
  }

  async url(
    name: string,
    options: WormholeTokenOptions | undefined,
  ): Promise<{ connection: WormholeConnection; token: WormholeToken }> {
    this.assertConfigured();
    const token = await this.mintToken(name, options);
    const wsUrl = new URL(
      `${this.platformUrl}/wormholes/${encodeURIComponent(name)}/ws`,
    );
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.searchParams.set("token", token.token);

    return {
      token,
      connection: {
        name,
        url: wsUrl.href,
        tokenExpiresAt: token.expiresAt,
      },
    };
  }

  private async post<TResponse = unknown>(
    name: string,
    endpoint: "token" | "state" | "message",
    body: unknown,
  ): Promise<TResponse> {
    this.assertConfigured();

    const response = await fetch(
      `${this.platformUrl}/wormholes/${encodeURIComponent(name)}/${endpoint}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.fractalToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Fractal platform wormhole ${endpoint} failed with ${response.status}: ${text}`,
      );
    }

    return (await response.json()) as TResponse;
  }

  private assertConfigured() {
    if (!this.platformUrl) {
      throw new Error(
        "Missing Fractal platform URL. Set FRACTAL_PLATFORM_URL.",
      );
    }
    if (!this.fractalToken) {
      throw new Error("Missing Fractal platform token. Set FRACTAL_TOKEN.");
    }
  }
}

export class WormholeBuilder<
  TState extends Record<string, unknown>,
  TTools extends Record<string, ToolDef>,
  TAtoms extends Record<string, AtomDef>,
> {
  private widgetConfig: WormholeWidgetConfig | undefined;
  private readonly platform: WormholePlatformClient;
  private currentState: TState;

  constructor(
    private readonly server: McpServer<TTools, TAtoms>,
    private readonly config: WormholeConfig<TState>,
  ) {
    this.platform = new WormholePlatformClient();
    this.currentState = this.config.stateSchema.parse(this.config.defaultState);
  }

  widget(config: WormholeWidgetConfig): this {
    this.widgetConfig = config;
    return this;
  }

  tool<
    TName extends string,
    TInput extends ZodRawShapeCompat,
    TReturn extends WormholeMutationResult,
  >(
    config: WormholeToolConfig<TInput> & { name: TName },
    handler: (
      wormhole: WormholeToolContext<TState>,
      args: ShapeOutput<TInput>,
      extra: ToolHandlerExtra,
    ) => TReturn | Promise<TReturn>,
  ): AddTool<
    TTools,
    TAtoms,
    TName,
    TInput,
    Record<string, unknown>,
    { wormhole: WormholeConnection }
  > {
    const view = this.widgetConfig;
    return this.server.registerTool(
      {
        ...config,
        ...(view && { view }),
      },
      async (args, extra) => {
        const workingState = cloneWormholeState(this.currentState);
        const tracked = createTrackedState(workingState);
        let explicitState: TState | undefined;

        const getTokenOptions = (options?: WormholeTokenOptions) => ({
          ttl: this.config.ttl,
          ...options,
        });

        const wormhole: WormholeToolContext<TState> = {
          name: this.config.name,
          state: tracked.state,
          message: {
            send: (message) =>
              this.platform.sendMessage(this.config.name, message),
          },
          token: (options) =>
            this.platform.mintToken(this.config.name, getTokenOptions(options)),
          url: async (options) => {
            const { connection } = await this.platform.url(
              this.config.name,
              getTokenOptions(options),
            );
            return connection.url;
          },
          setState: (state) => {
            explicitState = state;
          },
        };

        const rawResult = await handler(wormhole, args, extra);
        const result = normalizeWormholeResult(rawResult);
        const stateToSync = explicitState ?? workingState;

        this.config.stateSchema.parse(stateToSync);

        if (explicitState !== undefined || tracked.wasMutated()) {
          await this.platform.setState(this.config.name, stateToSync);
          this.currentState = cloneWormholeState(stateToSync);
        }

        const { connection } = await this.platform.url(this.config.name, {
          ttl: this.config.ttl,
        });

        return {
          ...result,
          structuredContent: {
            ...result.structuredContent,
            wormhole: {
              name: this.config.name,
            },
          },
          _meta: {
            ...result._meta,
            wormhole: connection,
          },
        };
      },
    ) as AddTool<
      TTools,
      TAtoms,
      TName,
      TInput,
      Record<string, unknown>,
      { wormhole: WormholeConnection }
    >;
  }
}
