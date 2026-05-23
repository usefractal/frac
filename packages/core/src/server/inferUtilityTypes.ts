import type { AtomDef, McpServerTypes, ToolDef } from "./server.js";

/**
 * Any tool registry shape (includes both views and regular tools).
 * Used as a constraint for type parameters that accept tool registries.
 */
export type AnyToolRegistry = Record<string, ToolDef>;

/**
 * Any atom registry shape.
 * Used as a constraint for type parameters that accept atom registries.
 */
export type AnyAtomRegistry = Record<string, AtomDef>;

/**
 * Extract the tool registry type from an McpServer instance.
 * This includes both views (registered via view()) and regular tools (registered via registerTool()).
 *
 * Uses the `$types` property pattern for cross-package type inference.
 * This works across package boundaries because TypeScript uses structural typing
 * on the shape of `$types`, rather than nominal typing on the McpServer class itself.
 *
 * @example
 * ```ts
 * type MyTools = InferTools<MyServer>;
 * // { "search": ToolDef<...>, "calculate": ToolDef<...> }
 * ```
 */
export type InferTools<ServerType> = ServerType extends {
  $types: McpServerTypes<infer W, AnyAtomRegistry>;
}
  ? W
  : never;

/**
 * Extract the atom registry type from an McpServer instance.
 */
export type InferAtoms<ServerType> = ServerType extends {
  $types: McpServerTypes<AnyToolRegistry, infer A>;
}
  ? A
  : never;

type ExtractTool<
  ServerType,
  K extends ToolNames<ServerType>,
> = InferTools<ServerType>[K];

type ExtractAtom<
  ServerType,
  K extends AtomNames<ServerType>,
> = InferAtoms<ServerType>[K];

/**
 * Get a union of all tool names from an McpServer instance.
 * This includes both views and regular tools.
 *
 * @example
 * ```ts
 * type Names = ToolNames<MyServer>;
 * // "search" | "calculate" | "details"
 * ```
 */
export type ToolNames<ServerType> = keyof InferTools<ServerType> & string;

/**
 * Get a union of all atom names from an McpServer instance.
 *
 * @example
 * ```ts
 * type Names = AtomNames<MyServer>;
 * // "ProductCard" | "MetricTile"
 * ```
 */
export type AtomNames<ServerType> = keyof InferAtoms<ServerType> & string;

/**
 * Get the input type for a specific tool (view or regular tool).
 *
 * @example
 * ```ts
 * type SearchInput = ToolInput<MyServer, "search">;
 * ```
 */
export type ToolInput<
  ServerType,
  ToolName extends ToolNames<ServerType>,
> = ExtractTool<ServerType, ToolName>["input"];

/**
 * Get the output type for a specific tool (view or regular tool).
 *
 * @example
 * ```ts
 * type SearchOutput = ToolOutput<MyServer, "search">;
 * ```
 */
export type ToolOutput<
  ServerType,
  ToolName extends ToolNames<ServerType>,
> = ExtractTool<ServerType, ToolName>["output"];

/**
 * Get the responseMetadata type for a specific tool (view or regular tool).
 * This is inferred from the `_meta` property of the tool callback's return value.
 *
 * @example
 * ```ts
 * type SearchMeta = ToolResponseMetadata<MyServer, "search">;
 * ```
 */
export type ToolResponseMetadata<
  ServerType,
  ToolName extends ToolNames<ServerType>,
> = ExtractTool<ServerType, ToolName>["responseMetadata"];

/**
 * Get the props type for a specific atom.
 *
 * @example
 * ```ts
 * type ProductCardProps = AtomProps<MyServer, "ProductCard">;
 * ```
 */
export type AtomProps<
  ServerType,
  AtomName extends AtomNames<ServerType>,
> = ExtractAtom<ServerType, AtomName>["props"];
