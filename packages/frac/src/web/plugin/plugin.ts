import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";
import {
  assertUniqueAtomNames,
  type DiscoveredAtom,
  scanAtomsSync,
  writeAtomsDts,
} from "./scan-atoms.js";
import {
  assertUniqueViewNames,
  type DiscoveredView,
  discoverViewsSync,
  scanViewsSync,
  writeViewsDts,
} from "./scan-views.js";
import { transform as dataLlmTransform } from "./transform-data-llm.js";
import { hasDefaultExport } from "./validate-view.js";

const VIRTUAL_PREFIX = "/_frac/view/";
const VIRTUAL_MODULE_PREFIX = "\0frac:view:";
const ATOMS_REGISTRY_ID = "virtual:frac/fractals";
const ATOMS_REGISTRY_RESOLVED_ID = "\0frac:fractals";
const RENDER_ATOMS_VIEW_NAME = "__frac_render_atoms";

/** Options for the {@link frac} Vite plugin. */
export interface FracPluginOptions {
  /** Directory scanned for view modules. Defaults to `"src/views"`. */
  viewsDir?: string;
  /** Directory scanned for Fractal components. Defaults to `"src/fractals"` when present, otherwise `"src/atoms"`. */
  fractalsDir?: string;
  /** @deprecated Use `fractalsDir`. */
  atomsDir?: string;
}

/** @deprecated Use {@link FracPluginOptions}. */
export type FractalPluginOptions = FracPluginOptions;

function buildVirtualEntry(viewFilePath: string): string {
  const normalized = viewFilePath.replace(/\\/g, "/");
  return [
    `import { mountView } from "frac/web";`,
    `import Component from "${normalized}";`,
    `import { createElement } from "react";`,
    `mountView(createElement(Component));`,
  ].join("\n");
}

function buildAtomRegistryEntry(atoms: DiscoveredAtom[]): string {
  const imports = atoms
    .map((atom, index) => {
      return `import Atom${index} from "${atom.filePath.replace(/\\/g, "/")}";`;
    })
    .join("\n");

  const entries = atoms
    .map((atom, index) => `  ${JSON.stringify(atom.name)}: Atom${index},`)
    .join("\n");

  const names = atoms.map((atom) => JSON.stringify(atom.name)).join(", ");

  return [
    imports,
    "",
    "export const atomRegistry = {",
    entries,
    "};",
    `export const atomNames = [${names}];`,
    "",
  ].join("\n");
}

function buildRenderAtomsEntry(): string {
  const renderAtomsViewPath = getInternalWebModulePath("render-atoms-view");
  return [
    `import { mountView } from "frac/web";`,
    `import { createElement } from "react";`,
    `import { RenderAtomsView } from "${renderAtomsViewPath}";`,
    `import { atomRegistry } from "${ATOMS_REGISTRY_ID}";`,
    "",
    "mountView(createElement(RenderAtomsView, { atomRegistry }));",
    "",
  ].join("\n");
}

function getInternalWebModulePath(name: string): string {
  const sourcePath = fileURLToPath(
    new URL(`../internal/${name}.tsx`, import.meta.url),
  );
  if (existsSync(sourcePath)) {
    return sourcePath.replace(/\\/g, "/");
  }
  return fileURLToPath(
    new URL(`../internal/${name}.js`, import.meta.url),
  ).replace(/\\/g, "/");
}

function getViewEntryPattern(viewsDir: string): RegExp {
  const escaped = viewsDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `${escaped}\\/(?:[^/]+\\.(?:jsx|tsx)|[^/]+\\/index\\.(?:tsx|jsx))(?:\\?.*)?$`,
  );
}

function resolveDefaultFractalsDir(projectRoot: string): string {
  return existsSync(resolve(projectRoot, "src/fractals"))
    ? "src/fractals"
    : "src/atoms";
}

/**
 * Vite plugin that wires a frac project's view files into Vite.
 *
 * For each `.tsx` / `.jsx` file in `viewsDir` with a default export, the
 * plugin:
 * - exposes a virtual entry that calls {@link mountView} with the view's
 *   default export,
 * - generates `.frac/views.d.ts` to augment {@link ViewNameRegistry} so
 *   {@link ViewName} narrows to the actual view names,
 * - rewrites `<DataLLM>` JSX so the host can extract its content,
 * - warns in dev if a view file is missing a default export.
 *
 * Add it to your `vite.config.ts` alongside `@vitejs/plugin-react`.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import react from "@vitejs/plugin-react";
 * import { frac } from "frac/vite";
 *
 * export default defineConfig({
 *   plugins: [react(), frac({ viewsDir: "src/views" })],
 * });
 * ```
 */
export function frac(options?: FracPluginOptions): Plugin {
  const rawViewsDir = options?.viewsDir ?? "src/views";
  const configuredFractalsDir = options?.fractalsDir ?? options?.atomsDir;
  let resolvedViewsDir: string;
  let resolvedAtomsDir: string;
  let projectRoot: string;
  let viewMap = new Map<string, DiscoveredView>();
  let atoms: DiscoveredAtom[] = [];
  let viewEntryPattern: RegExp;

  return {
    name: "frac",
    enforce: "pre",
    // Read by `frac build` to resolve viewsDir before `tsc -b` runs.
    api: { viewsDir: rawViewsDir, atomsDir: configuredFractalsDir },

    config(config) {
      projectRoot = config.root || process.cwd();
      const rawFractalsDir =
        configuredFractalsDir ?? resolveDefaultFractalsDir(projectRoot);
      resolvedViewsDir = isAbsolute(rawViewsDir)
        ? rawViewsDir
        : resolve(projectRoot, rawViewsDir);
      resolvedAtomsDir = isAbsolute(rawFractalsDir)
        ? rawFractalsDir
        : resolve(projectRoot, rawFractalsDir);
      viewEntryPattern = getViewEntryPattern(resolvedViewsDir);

      const views = discoverViewsSync(resolvedViewsDir);
      viewMap = new Map(views.map((v) => [v.name, v]));
      writeViewsDts(projectRoot, views);
      const { valid } = scanAtomsSync(resolvedAtomsDir);
      assertUniqueAtomNames(valid);
      atoms = valid;
      writeAtomsDts(projectRoot, atoms);

      const input: Record<string, string> = {};
      for (const view of views) {
        input[view.name] = `${VIRTUAL_PREFIX}${view.name}`;
      }
      if (atoms.length > 0) {
        input[RENDER_ATOMS_VIEW_NAME] =
          `${VIRTUAL_PREFIX}${RENDER_ATOMS_VIEW_NAME}`;
      }

      return {
        base: "/assets",
        // Fixes "Invalid hook call" on createStore by forcing a single
        // copy of React. Under pnpm's isolated node_modules, zustand
        // inside `frac` resolves React from frac's own
        // dependencies while the host app loads its own copy
        resolve: {
          dedupe: ["react", "react-dom"],
        },
        build: {
          outDir: "dist/assets",
          emptyOutDir: true,
          manifest: true,
          minify: true,
          cssCodeSplit: false,
          rollupOptions: {
            input,
          },
        },
        // Pre-bundle view deps at startup so the first tool invocation
        // doesn't hit Vite's on-demand re-optimization path (which sends
        // `full-reload` over HMR — in our iframe flow the parent host
        // can't honour a reload, and the view silently never mounts).
        optimizeDeps: {
          // Scan view files so transitive user deps (zod, tailwind, etc.)
          // get pre-bundled at startup.
          entries: [
            `${resolvedViewsDir}/*.{tsx,jsx}`,
            `${resolvedViewsDir}/*/index.{tsx,jsx}`,
          ],
          include: ["react", "react-dom/client", "react/jsx-runtime"],
          exclude: ["frac/web"],
        },
        experimental: {
          renderBuiltUrl: (filename) => {
            return {
              runtime: `window.frac.serverUrl + "/assets/${filename}"`,
            };
          },
        },
      };
    },

    resolveId(id) {
      if (id === ATOMS_REGISTRY_ID) {
        return ATOMS_REGISTRY_RESOLVED_ID;
      }
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const name = id.slice(VIRTUAL_PREFIX.length);
        if (viewMap.has(name) || name === RENDER_ATOMS_VIEW_NAME) {
          return `${VIRTUAL_MODULE_PREFIX}${name}`;
        }
      }
      return null;
    },

    load(id) {
      if (id === ATOMS_REGISTRY_RESOLVED_ID) {
        return buildAtomRegistryEntry(atoms);
      }
      if (id.startsWith(VIRTUAL_MODULE_PREFIX)) {
        const name = id.slice(VIRTUAL_MODULE_PREFIX.length);
        if (name === RENDER_ATOMS_VIEW_NAME) {
          return buildRenderAtomsEntry();
        }
        const view = viewMap.get(name);
        if (view) {
          return buildVirtualEntry(view.filePath);
        }
      }
      return null;
    },

    configureServer(server: ViteDevServer) {
      if (!resolvedViewsDir) {
        const root = server.config.root || process.cwd();
        const rawFractalsDir =
          configuredFractalsDir ?? resolveDefaultFractalsDir(root);
        resolvedViewsDir = isAbsolute(rawViewsDir)
          ? rawViewsDir
          : resolve(root, rawViewsDir);
        resolvedAtomsDir = isAbsolute(rawFractalsDir)
          ? rawFractalsDir
          : resolve(root, rawFractalsDir);
        projectRoot = root;
        viewEntryPattern = getViewEntryPattern(resolvedViewsDir);
      }

      server.watcher.add(resolvedViewsDir);
      server.watcher.add(resolvedAtomsDir);
      // Track which view files we've already warned about so a rescan
      // triggered by an unrelated edit doesn't re-emit the same warning.
      let knownInvalid = new Set<string>();
      const rescan = () => {
        try {
          // Surface broken view files. Without this, files lacking a
          // default export are silently dropped from the input and the
          // user has no idea why their widget never mounts.
          const { valid, invalid } = scanViewsSync(resolvedViewsDir);
          const nextInvalid = new Set(invalid.map((v) => v.filePath));

          for (const filePath of nextInvalid) {
            if (!knownInvalid.has(filePath)) {
              server.config.logger.warn(
                `[frac] view file "${relative(projectRoot, filePath)}" is missing a default export — it won't be served until fixed.`,
              );
            }
          }
          for (const filePath of knownInvalid) {
            if (!nextInvalid.has(filePath)) {
              server.config.logger.info(
                `[frac] view file "${relative(projectRoot, filePath)}" resolved.`,
              );
            }
          }
          knownInvalid = nextInvalid;

          assertUniqueViewNames(valid);
          viewMap = new Map(valid.map((v) => [v.name, v]));
          writeViewsDts(projectRoot, valid);
        } catch (err) {
          // assertUniqueViewNames throws on duplicate view names. Catch so
          // chokidar's listener chain doesn't surface it as unhandled and
          // crash the dev server — previous viewMap stays active until
          // the user fixes the conflict.
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[frac] view rescan failed: ${message}`);
        }
      };

      // Initial scan emits warnings for broken files that exist at startup.
      rescan();
      server.watcher.on("add", rescan);
      server.watcher.on("change", rescan);
      server.watcher.on("unlink", rescan);

      let knownInvalidAtoms = new Set<string>();
      const rescanAtoms = () => {
        try {
          const { valid, invalid } = scanAtomsSync(resolvedAtomsDir);
          const nextInvalid = new Set(invalid.map((a) => a.filePath));

          for (const filePath of nextInvalid) {
            if (!knownInvalidAtoms.has(filePath)) {
              server.config.logger.warn(
                `[frac] atom file "${relative(projectRoot, filePath)}" is missing a default export — it won't be registered until fixed.`,
              );
            }
          }
          for (const filePath of knownInvalidAtoms) {
            if (!nextInvalid.has(filePath)) {
              server.config.logger.info(
                `[frac] atom file "${relative(projectRoot, filePath)}" resolved.`,
              );
            }
          }
          knownInvalidAtoms = nextInvalid;

          assertUniqueAtomNames(valid);
          atoms = valid;
          writeAtomsDts(projectRoot, valid);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[frac] atom rescan failed: ${message}`);
        }
      };

      rescanAtoms();
      server.watcher.on("add", rescanAtoms);
      server.watcher.on("change", rescanAtoms);
      server.watcher.on("unlink", rescanAtoms);
    },

    async transform(code, id) {
      if (viewEntryPattern?.test(id) && !hasDefaultExport(code, id)) {
        this.warn(
          `View file "${id.split("/").pop()}" is missing a default export.`,
        );
      }

      return await dataLlmTransform(code, id);
    },
  };
}
