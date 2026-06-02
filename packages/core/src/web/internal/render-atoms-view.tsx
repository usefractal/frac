import {
  Component,
  createElement,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from "react";
import JsxParser from "react-jsx-parser";
import { useToolInfo } from "../hooks/use-tool-info.js";

type UnknownRecord = Record<string, unknown>;

export interface RenderAtomsViewProps {
  atomRegistry: Record<string, ComponentType<UnknownRecord>>;
}

interface RenderAtomsErrorBoundaryProps {
  children: ReactNode;
}

interface RenderAtomsErrorBoundaryState {
  error: Error | null;
}

class RenderAtomsErrorBoundary extends Component<
  RenderAtomsErrorBoundaryProps,
  RenderAtomsErrorBoundaryState
> {
  override state: RenderAtomsErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return createElement(
        "pre",
        { style: { margin: 0, padding: 12, whiteSpace: "pre-wrap" } },
        this.state.error.message,
      );
    }

    return this.props.children;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function RenderAtomsView({ atomRegistry }: RenderAtomsViewProps) {
  const { output } = useToolInfo() as { output: unknown };

  if (!isRecord(output)) {
    return null;
  }

  const jsx = output.jsx;
  const props = isRecord(output.props) ? output.props : {};

  if (typeof jsx !== "string") {
    return null;
  }

  const Parser = JsxParser as unknown as FunctionComponent<{
    allowUnknownElements: boolean;
    bindings: Record<string, unknown>;
    components: Record<string, ComponentType<UnknownRecord>>;
    jsx: string;
    renderInWrapper: boolean;
    renderUnrecognized: () => null;
    showWarnings: boolean;
  }>;

  return createElement(
    RenderAtomsErrorBoundary,
    null,
    createElement(Parser, {
      allowUnknownElements: true,
      bindings: { props },
      components: atomRegistry,
      jsx: `<div className="fractal-composable-root">${jsx}</div>`,
      renderInWrapper: false,
      renderUnrecognized: () => null,
      showWarnings: true,
    }),
  );
}
