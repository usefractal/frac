import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Command } from "@oclif/core";
import {
  CliError,
  type CloudStorageToken,
  createFracctlCore,
  type FracctlEnvironment,
  get_runtime_config,
} from "@usefractal/fracctl-core";

const MAX_TOKEN_TTL_SECONDS = 3600;

type FracJson = {
  projectId: string;
};

type TokenFormat = "env" | "raw" | "json";

export function createFractalCloudCore() {
  return createFracctlCore();
}

export function readRuntimeConfig() {
  return get_runtime_config(process.env);
}

export async function resolveProjectId(projectFlag?: string): Promise<string> {
  const flagProjectId = projectFlag?.trim();
  if (flagProjectId) {
    return flagProjectId;
  }

  const fracJson = await findFracJson(process.cwd());
  if (fracJson) {
    return fracJson.projectId;
  }

  const runtime = readRuntimeConfig();
  if (runtime.projectId) {
    return runtime.projectId;
  }

  throw new CliError(
    "Project ID is required. Pass --project <id>, add frac.json, or set FRACTAL_PROJECT_ID.",
  );
}

export function resolveEnvironment(
  environmentFlag?: string,
): FracctlEnvironment {
  const runtime = readRuntimeConfig();
  const environment = environmentFlag ?? runtime.environment ?? "dev";

  if (environment !== "dev" && environment !== "prod") {
    throw new CliError("--env must be either dev or prod.");
  }

  return environment;
}

export function resolveTokenTtl(ttl?: number): number | undefined {
  if (ttl === undefined) {
    return undefined;
  }

  if (!Number.isInteger(ttl) || ttl <= 0) {
    throw new CliError("--ttl must be a positive integer.");
  }

  if (ttl > MAX_TOKEN_TTL_SECONDS) {
    throw new CliError(
      `--ttl must be ${MAX_TOKEN_TTL_SECONDS} seconds or less.`,
    );
  }

  return ttl;
}

export function resolveTokenFormat(format?: string): TokenFormat {
  const value = format ?? "env";
  if (value !== "env" && value !== "raw" && value !== "json") {
    throw new CliError("--format must be one of: env, raw, json.");
  }
  return value;
}

export function formatCloudStorageToken(
  token: CloudStorageToken,
  format: TokenFormat,
): string {
  if (format === "raw") {
    return token.token;
  }

  if (format === "json") {
    return JSON.stringify(token, null, 2);
  }

  return [
    `export FRACTAL_CLOUD_TOKEN=${shellQuote(token.token)}`,
    `export FRACTAL_CLOUD_STORAGE_ORIGIN=${shellQuote(token.origin)}`,
    `export FRACTAL_CLOUD_TOKEN_EXPIRES_AT=${shellQuote(token.expiresAt)}`,
  ].join("\n");
}

export function handleCloudError(command: Command, error: unknown): never {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeCloudErrorMessage(rawMessage);
  command.error(message, { exit: 1 });
}

export async function withFractalCloudOutput<T>(
  run: () => Promise<T>,
): Promise<T> {
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    const [first, ...rest] = args;
    if (typeof first === "string") {
      originalLog(rewriteCloudOutput(first), ...rest);
      return;
    }

    originalLog(...args);
  };

  try {
    return await run();
  } finally {
    console.log = originalLog;
  }
}

function sanitizeCloudErrorMessage(message: string): string {
  if (/Could not refresh your .* session/i.test(message)) {
    return "Could not refresh your Fractal session. Run frac auth login again.";
  }

  if (/client[_\s-]?id|clientId|fracctl-core/i.test(message)) {
    return "Fractal authentication is not configured for this CLI build.";
  }

  return message;
}

function rewriteCloudOutput(message: string): string {
  if (/^Opening .* device login in your browser\.$/i.test(message)) {
    return "Opening Fractal login in your browser.";
  }

  return message;
}

async function findFracJson(startDir: string): Promise<FracJson | null> {
  let dir = resolve(startDir);

  while (true) {
    const candidate = join(dir, "frac.json");
    try {
      const parsed = JSON.parse(await readFile(candidate, "utf8")) as {
        projectId?: unknown;
        project_id?: unknown;
      };
      const projectId = parsed.projectId ?? parsed.project_id;

      if (typeof projectId !== "string" || projectId.trim().length === 0) {
        throw new CliError(`${candidate} is missing projectId.`);
      }

      return { projectId: projectId.trim() };
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }

      const code =
        typeof error === "object" && error && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        throw new CliError(`Could not read ${candidate}: ${message}`);
      }
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
