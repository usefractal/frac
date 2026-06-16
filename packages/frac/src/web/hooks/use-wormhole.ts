import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToolInfo } from "./use-tool-info.js";

export type WormholeConnection = {
  name: string;
  url: string;
  tokenExpiresAt?: string;
};

export type WormholeStateStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "expired"
  | "error";

export type WormholeEvent<TState, TMessage> =
  | {
      type: "wormhole:state";
      state: TState;
      updatedAt: string;
    }
  | {
      type: "wormhole:message";
      message: TMessage;
      sentAt: string;
    }
  | {
      type: "pong";
      ts: number;
    };

export type UseWormholeOptions<TState, TMessage> = {
  reconnect?: boolean;
  onState?: (state: TState) => void;
  onMessage?: (message: TMessage) => void;
  onEvent?: (event: WormholeEvent<TState, TMessage>) => void;
};

export type UseWormholeResult<TState, TMessage> = {
  name: string | null;
  state: TState | null;
  status: WormholeStateStatus;
  error: Error | null;
  tokenExpired: boolean;
  lastMessage: TMessage | null;
  send(message: TMessage): void;
  reconnect(): void;
  refresh(): void;
  close(): void;
};

type WormholeToolPayload = {
  wormhole?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readWormholeConnection(
  value: unknown,
): WormholeConnection | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const wormhole = value.wormhole;
  if (!isRecord(wormhole)) {
    return undefined;
  }

  if (typeof wormhole.name !== "string" || typeof wormhole.url !== "string") {
    return undefined;
  }

  return {
    name: wormhole.name,
    url: wormhole.url,
    tokenExpiresAt:
      typeof wormhole.tokenExpiresAt === "string"
        ? wormhole.tokenExpiresAt
        : undefined,
  };
}

function parseWormholeEvent<TState, TMessage>(
  data: string,
): WormholeEvent<TState, TMessage> | undefined {
  const parsed = JSON.parse(data) as unknown;
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return undefined;
  }

  if (
    parsed.type === "wormhole:state" &&
    typeof parsed.updatedAt === "string" &&
    "state" in parsed
  ) {
    return {
      type: "wormhole:state",
      state: parsed.state as TState,
      updatedAt: parsed.updatedAt,
    };
  }

  if (
    parsed.type === "wormhole:message" &&
    typeof parsed.sentAt === "string" &&
    "message" in parsed
  ) {
    return {
      type: "wormhole:message",
      message: parsed.message as TMessage,
      sentAt: parsed.sentAt,
    };
  }

  if (parsed.type === "pong" && typeof parsed.ts === "number") {
    return parsed as WormholeEvent<TState, TMessage>;
  }

  return undefined;
}

/**
 * Connect to the wormhole returned by the tool invocation that rendered this
 * widget. The server SDK places the private WebSocket URL in `_meta.wormhole`.
 */
export function useWormhole<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TMessage = unknown,
>(
  options: UseWormholeOptions<TState, TMessage> = {},
): UseWormholeResult<TState, TMessage> {
  const toolInfo = useToolInfo<{
    output: WormholeToolPayload;
    responseMetadata: WormholeToolPayload;
  }>();
  const [state, setState] = useState<TState | null>(null);
  const [status, setStatus] = useState<WormholeStateStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [lastMessage, setLastMessage] = useState<TMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const optionsRef = useRef(options);
  const reconnectNonceRef = useRef(0);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  optionsRef.current = options;

  const connection = useMemo(
    () => readWormholeConnection(toolInfo.responseMetadata),
    [toolInfo.responseMetadata],
  );

  const close = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const reconnect = useCallback(() => {
    reconnectNonceRef.current += 1;
    setReconnectNonce(reconnectNonceRef.current);
  }, []);

  useEffect(() => {
    void reconnectNonce;

    if (!connection) {
      setStatus("idle");
      return;
    }

    let shouldReconnect = optionsRef.current.reconnect ?? true;
    setStatus("connecting");
    setError(null);
    setTokenExpired(false);

    const socket = new WebSocket(connection.url);
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus("open");
    });

    socket.addEventListener("message", (event) => {
      try {
        const wormholeEvent = parseWormholeEvent<TState, TMessage>(
          String(event.data),
        );
        if (!wormholeEvent) {
          return;
        }

        optionsRef.current.onEvent?.(wormholeEvent);

        if (wormholeEvent.type === "wormhole:state") {
          setState(wormholeEvent.state);
          optionsRef.current.onState?.(wormholeEvent.state);
        }

        if (wormholeEvent.type === "wormhole:message") {
          setLastMessage(wormholeEvent.message);
          optionsRef.current.onMessage?.(wormholeEvent.message);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setStatus("error");
      }
    });

    socket.addEventListener("error", () => {
      setError(new Error("Wormhole WebSocket error"));
      setStatus("error");
    });

    socket.addEventListener("close", (event) => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      if (event.code === 4001) {
        shouldReconnect = false;
        setTokenExpired(true);
        setStatus("expired");
        return;
      }

      setStatus("closed");

      if (shouldReconnect) {
        window.setTimeout(() => reconnect(), 500);
      }
    });

    return () => {
      shouldReconnect = false;
      socket.close();
    };
  }, [connection, reconnect, reconnectNonce]);

  const send = useCallback((message: TMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      throw new Error("Wormhole WebSocket is not open.");
    }
    socketRef.current.send(JSON.stringify(message));
  }, []);

  return {
    name: connection?.name ?? null,
    state,
    status,
    error,
    tokenExpired,
    lastMessage,
    send,
    reconnect,
    refresh: reconnect,
    close,
  };
}
