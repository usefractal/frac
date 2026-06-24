import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppsSdkContext } from "../bridges/apps-sdk/index.js";
import { useWormhole } from "./use-wormhole.js";

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  send = vi.fn();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify(data),
      }),
    );
  }

  closeWith(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    const event = new Event("close") as Event & { code: number };
    event.code = code;
    this.dispatchEvent(event);
  }

  close() {
    this.closeWith();
  }
}

type BoardState = {
  selectedId: string | null;
  filters: {
    projectId?: string;
  };
};

type BoardMessage = {
  type: "opened";
  projectId: string;
};

describe("useWormhole", () => {
  beforeEach(() => {
    MockWebSocket.instances = [];

    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.stubGlobal("frac", { hostType: "apps-sdk" });
    vi.stubGlobal("openai", {
      toolInput: {},
      toolOutput: {
        wormhole: {
          name: "public-only",
        },
      },
      toolResponseMetadata: {
        wormhole: {
          name: "board",
          url: "wss://platform.example.test/wormholes/board/ws?token=secret",
          tokenExpiresAt: "2026-06-16T01:00:00.000Z",
        },
      },
    } satisfies Pick<
      AppsSdkContext,
      "toolInput" | "toolOutput" | "toolResponseMetadata"
    >);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("opens the private wormhole URL from tool response metadata", async () => {
    const { result } = renderHook(() =>
      useWormhole<BoardState, BoardMessage>(),
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe(
      "wss://platform.example.test/wormholes/board/ws?token=secret",
    );

    act(() => {
      MockWebSocket.instances[0]?.open();
    });

    await waitFor(() => {
      expect(result.current).toMatchObject({
        name: "board",
        status: "open",
        tokenExpired: false,
      });
    });
  });

  it("updates state and lastMessage from wormhole events", async () => {
    const onState = vi.fn();
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useWormhole<BoardState, BoardMessage>({
        onState,
        onMessage,
      }),
    );

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.receive({
        type: "wormhole:state",
        wormholeId: "board",
        organizationId: "org_123",
        state: {
          selectedId: "item_123",
          filters: {
            projectId: "project_123",
          },
        },
        updatedAt: "2026-06-16T00:00:00.000Z",
        actor: {
          userId: "user_123",
          organizationId: "org_123",
        },
      });
      MockWebSocket.instances[0]?.receive({
        type: "wormhole:message",
        wormholeId: "board",
        organizationId: "org_123",
        message: {
          type: "opened",
          projectId: "project_123",
        },
        sentAt: "2026-06-16T00:00:01.000Z",
        actor: {
          userId: "user_123",
          organizationId: "org_123",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.state).toEqual({
        selectedId: "item_123",
        filters: {
          projectId: "project_123",
        },
      });
      expect(result.current.lastMessage).toEqual({
        type: "opened",
        projectId: "project_123",
      });
      expect(onState).toHaveBeenCalledWith({
        selectedId: "item_123",
        filters: {
          projectId: "project_123",
        },
      });
      expect(onMessage).toHaveBeenCalledWith({
        type: "opened",
        projectId: "project_123",
      });
    });
  });

  it("sends messages over the open socket", async () => {
    const { result } = renderHook(() =>
      useWormhole<BoardState, BoardMessage>(),
    );

    act(() => {
      MockWebSocket.instances[0]?.open();
    });

    act(() => {
      result.current.send({
        type: "opened",
        projectId: "project_123",
      });
    });

    expect(MockWebSocket.instances[0]?.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "opened",
        projectId: "project_123",
      }),
    );
  });

  it("marks the token expired when the server closes with 4001", async () => {
    const { result } = renderHook(() =>
      useWormhole<BoardState, BoardMessage>(),
    );

    act(() => {
      MockWebSocket.instances[0]?.open();
      MockWebSocket.instances[0]?.closeWith(4001);
    });

    await waitFor(() => {
      expect(result.current).toMatchObject({
        status: "expired",
        tokenExpired: true,
      });
    });
  });
});
