import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";
import { Command, InvalidArgumentError } from "commander";

const execFileAsync = promisify(execFile);

const DEFAULT_API_BASE_URL = "https://web-api.usefractal.dev";
const DEFAULT_DASHBOARD_BASE_URL = "https://app.usefractal.dev";
const WORKOS_API_BASE_URL = "https://api.workos.com";
const DEFAULT_WORKOS_CLIENT_ID = "client_01K706MN6VCD1QDWR5515RAY4H";
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const REFRESH_TOKEN_GRANT = "refresh_token";
const KEYCHAIN_SERVICE = "fracctl";
const KEYCHAIN_ACCOUNT = "default";
const TOKEN_REFRESH_SKEW_SECONDS = 60;
const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const DEFAULT_WAIT_INTERVAL_SECONDS = 5;

const DEPLOY_DENYLIST_SEGMENTS = new Set([
  ".aws",
  ".cache",
  ".git",
  ".next",
  ".ssh",
  ".terraform",
  ".turbo",
  ".vercel",
  ".wrangler",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "tmp",
]);

const DEPLOY_DENYLIST_FILENAMES = new Set([
  ".env",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
]);

class CliError extends Error {}

type RuntimeConfig = {
  baseUrl: string;
  dashboardBaseUrl: string;
  workosClientId: string;
  projectId?: string;
  environment?: "dev" | "prod";
};

type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user?: UnknownRecord;
};

type UnknownRecord = Record<string, unknown>;

type Tarball = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

type ProjectOptions = {
  project?: string;
  projectId?: string;
};

type EnvironmentOptions = {
  env?: string;
};

type DeploymentRef = {
  deploymentId: string;
  projectId: string;
};

function readEnvValue(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function getRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = readEnvValue(env, "FRACTAL_CLOUD_ENVIRONMENT");
  if (environment && environment !== "dev" && environment !== "prod") {
    throw new CliError("FRACTAL_CLOUD_ENVIRONMENT must be either dev or prod.");
  }

  return {
    baseUrl: readEnvValue(env, "FRACTAL_API_URL") || DEFAULT_API_BASE_URL,
    dashboardBaseUrl:
      readEnvValue(env, "FRACTAL_DASHBOARD_URL") || DEFAULT_DASHBOARD_BASE_URL,
    workosClientId:
      readEnvValue(env, "FRACTAL_WORKOS_CLIENT_ID") || DEFAULT_WORKOS_CLIENT_ID,
    projectId: readEnvValue(env, "FRACTAL_PROJECT_ID"),
    environment:
      environment === "dev" || environment === "prod" ? environment : undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function runSecurity(args: string[]): Promise<string> {
  if (process.platform !== "darwin") {
    throw new CliError("System Keychain storage currently requires macOS.");
  }

  const { stdout } = await execFileAsync("security", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  return stdout.trim();
}

async function saveSession(session: Session): Promise<void> {
  await runSecurity([
    "add-generic-password",
    "-a",
    KEYCHAIN_ACCOUNT,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    JSON.stringify(session),
    "-U",
  ]);
}

async function loadSession(): Promise<Session | null> {
  try {
    const raw = await runSecurity([
      "find-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ]);
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

async function deleteSession(): Promise<void> {
  try {
    await runSecurity([
      "delete-generic-password",
      "-a",
      KEYCHAIN_ACCOUNT,
      "-s",
      KEYCHAIN_SERVICE,
    ]);
  } catch {}
}

function decodeJwtPayload(token: string): UnknownRecord | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as UnknownRecord;
  } catch {
    return null;
  }
}

function getAccessTokenExpiresAt(token: string): number | undefined {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp : undefined;
}

function isAccessTokenFresh(session: Session): boolean {
  if (!session.expiresAt) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return session.expiresAt - TOKEN_REFRESH_SKEW_SECONDS > now;
}

async function fetchJson(
  url: string,
  init: RequestInit,
): Promise<UnknownRecord> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as UnknownRecord)
    : { error_description: await response.text() };

  if (!response.ok) {
    throw new CliError(
      readErrorMessage(payload, `Request failed with ${response.status}`),
    );
  }

  return payload;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {}

  if (!response.ok) {
    throw new CliError(
      readErrorMessage(
        payload,
        `Request failed with ${response.status}: ${text}`,
      ),
    );
  }

  return payload;
}

function readErrorMessage(payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  return (
    pickString(record, ["error_description", "error", "details", "message"]) ||
    fallback
  );
}

async function requestDeviceAuthorization(
  clientId: string,
): Promise<UnknownRecord> {
  return fetchJson(`${WORKOS_API_BASE_URL}/user_management/authorize/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });
}

async function pollForTokens(
  clientId: string,
  authorization: UnknownRecord,
): Promise<UnknownRecord> {
  let intervalSeconds =
    typeof authorization.interval === "number" ? authorization.interval : 5;
  const expiresIn =
    typeof authorization.expires_in === "number"
      ? authorization.expires_in
      : 600;
  const deviceCode = String(authorization.device_code || "");
  const startedAt = Date.now();

  while (Date.now() - startedAt < expiresIn * 1000) {
    const response = await fetch(
      `${WORKOS_API_BASE_URL}/user_management/authenticate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: DEVICE_CODE_GRANT,
          device_code: deviceCode,
          client_id: clientId,
        }),
      },
    );
    const payload = (await response.json()) as UnknownRecord;
    if (response.ok) {
      return payload;
    }

    const error = String(payload.error || "");
    if (error === "authorization_pending") {
      await sleep(intervalSeconds * 1000);
      continue;
    }
    if (error === "slow_down") {
      intervalSeconds += 5;
      await sleep(intervalSeconds * 1000);
      continue;
    }
    if (error === "access_denied") {
      throw new CliError("Authorization was denied.");
    }
    if (error === "expired_token") {
      throw new CliError("Authorization expired. Authenticate again.");
    }
    throw new CliError(readErrorMessage(payload, "Authorization failed."));
  }

  throw new CliError("Authorization timed out.");
}

async function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  await new Promise<void>((resolveOpen) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => resolveOpen());
    child.on("spawn", () => {
      child.unref();
      resolveOpen();
    });
  });
}

function formatUser(user: unknown): string {
  const record = asRecord(user);
  return pickString(record, ["email", "id"]) || "unknown user";
}

async function login(runtime: RuntimeConfig): Promise<void> {
  const authorization = await requestDeviceAuthorization(
    runtime.workosClientId,
  );
  const verificationUrl =
    pickString(authorization, [
      "verification_uri_complete",
      "verification_uri",
    ]) || "";
  console.log("Opening WorkOS device login in your browser.");
  console.log(`Code: ${String(authorization.user_code || "")}`);
  console.log(`URL:  ${verificationUrl}`);
  if (verificationUrl) {
    await openBrowser(verificationUrl);
  }

  const tokens = await pollForTokens(runtime.workosClientId, authorization);
  const accessToken = String(tokens.access_token || "");
  const refreshToken = String(tokens.refresh_token || "");
  if (!accessToken || !refreshToken) {
    throw new CliError("Authentication did not return tokens.");
  }

  const session = {
    accessToken,
    refreshToken,
    expiresAt: getAccessTokenExpiresAt(accessToken),
    user: asRecord(tokens.user),
  };
  await saveSession(session);
  console.log(`Logged in as ${formatUser(tokens.user)}.`);
}

async function refreshAccessToken(
  runtime: RuntimeConfig,
  session: Session,
): Promise<Session> {
  const refreshed = await fetchJson(
    `${WORKOS_API_BASE_URL}/user_management/authenticate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: REFRESH_TOKEN_GRANT,
        refresh_token: session.refreshToken,
        client_id: runtime.workosClientId,
      }),
    },
  );

  const accessToken = String(refreshed.access_token || "");
  const refreshToken = String(refreshed.refresh_token || "");
  if (!accessToken || !refreshToken) {
    throw new CliError("Session refresh did not return tokens.");
  }

  const nextSession = {
    accessToken,
    refreshToken,
    expiresAt: getAccessTokenExpiresAt(accessToken),
    user: asRecord(refreshed.user) || session.user,
  };
  await saveSession(nextSession);
  return nextSession;
}

async function getSessionWithFreshAccessToken(
  runtime: RuntimeConfig,
): Promise<Session> {
  const session = await loadSession();
  if (!session) {
    throw new CliError("Not logged in. Authenticate first.");
  }

  if (isAccessTokenFresh(session)) {
    return session;
  }

  try {
    return await refreshAccessToken(runtime, session);
  } catch (error) {
    throw new CliError(
      `Could not refresh your WorkOS session. Authenticate again. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    );
  }
}

async function whoami(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.log("Not logged in.");
    return;
  }

  const expiresAt = session.expiresAt
    ? new Date(session.expiresAt * 1000).toISOString()
    : "unknown";
  console.log(`Logged in as ${formatUser(session.user)}.`);
  console.log(`Access token expires at ${expiresAt}.`);
}

async function logout(): Promise<void> {
  await deleteSession();
  console.log("Logged out.");
}

async function authenticatedFetch(
  runtime: RuntimeConfig,
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${runtime.baseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers,
  });
}

async function authenticatedJson(
  runtime: RuntimeConfig,
  session: Session,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  return readJsonResponse(
    await authenticatedFetch(runtime, session, path, init),
  );
}

async function firstSuccessfulJson(
  runtime: RuntimeConfig,
  session: Session,
  paths: string[],
): Promise<unknown> {
  let lastError: Error | undefined;
  for (const path of paths) {
    try {
      return await authenticatedJson(runtime, session, path);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError || new CliError("Request failed.");
}

async function fetchProjects(
  runtime: RuntimeConfig,
  session: Session,
): Promise<UnknownRecord[]> {
  const payload = await authenticatedJson(runtime, session, "/projects");
  return readArray(payload, ["projects", "data", "items"]);
}

async function fetchProject(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
): Promise<UnknownRecord> {
  try {
    const payload = await authenticatedJson(
      runtime,
      session,
      `/projects/${encodeURIComponent(projectId)}`,
    );
    return readObject(payload, ["project", "data"]) || asRecord(payload) || {};
  } catch {
    const projects = await fetchProjects(runtime, session);
    const project = projects.find(
      (item) => pickString(item, ["id"]) === projectId,
    );
    if (!project) {
      throw new CliError(
        `Project ${projectId} was not found for the logged-in user.`,
      );
    }
    return project;
  }
}

async function createDeploymentProject(
  runtime: RuntimeConfig,
  session: Session,
  name: string,
): Promise<UnknownRecord> {
  const payload = await authenticatedJson(runtime, session, "/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      config: { from: "deployment" },
    }),
  });
  const project = readObject(payload, ["project", "data"]);
  if (!project) {
    throw new CliError("Project creation returned an unexpected response.");
  }
  return project;
}

async function assertProjectExists(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
): Promise<UnknownRecord> {
  return fetchProject(runtime, session, projectId);
}

function normalizeDeployPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function isDeniedDeployPath(filePath: string): boolean {
  const normalized = normalizeDeployPath(filePath);
  const segments = normalized.split("/").filter(Boolean);
  const filename = segments[segments.length - 1] || "";
  const lowerFilename = filename.toLowerCase();
  if (segments.some((segment) => DEPLOY_DENYLIST_SEGMENTS.has(segment))) {
    return true;
  }
  if (DEPLOY_DENYLIST_FILENAMES.has(filename)) {
    return true;
  }
  if (filename.startsWith(".env.")) {
    return true;
  }
  if (
    lowerFilename.endsWith(".pem") ||
    lowerFilename.endsWith(".key") ||
    lowerFilename.endsWith(".p12") ||
    lowerFilename.endsWith(".pfx") ||
    lowerFilename.endsWith(".crt") ||
    lowerFilename.endsWith(".cer")
  ) {
    return true;
  }
  return (
    lowerFilename.includes("service-account") && lowerFilename.endsWith(".json")
  );
}

async function listDeployFilesFromGit(
  sourceDir: string,
): Promise<string[] | null> {
  try {
    await execFileAsync("git", [
      "-C",
      sourceDir,
      "rev-parse",
      "--is-inside-work-tree",
    ]);
  } catch {
    return null;
  }

  const { stdout } = await execFileAsync(
    "git",
    [
      "-C",
      sourceDir,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  const files = stdout
    .split("\0")
    .map((filePath) => normalizeDeployPath(filePath))
    .filter((filePath) => filePath && !isDeniedDeployPath(filePath));

  const existingFiles: string[] = [];
  for (const filePath of files) {
    try {
      const fileStats = await lstat(join(sourceDir, filePath));
      if (fileStats.isFile() || fileStats.isSymbolicLink()) {
        existingFiles.push(filePath);
      }
    } catch {}
  }
  return existingFiles;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolveHash, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolveHash);
  });
  return hash.digest("hex");
}

async function createSourceTarball(sourceDir: string): Promise<Tarball> {
  const tempDir = await mkdtemp(join(tmpdir(), "frac-deploy-"));
  const tarballPath = join(tempDir, "source.tar.gz");
  const gitFiles = await listDeployFilesFromGit(sourceDir);

  if (gitFiles) {
    if (gitFiles.length === 0) {
      throw new CliError(
        "No deployable files found after applying .gitignore and Fractal deploy denylist.",
      );
    }
    const fileListPath = join(tempDir, "files.txt");
    await writeFile(fileListPath, `${gitFiles.join("\0")}\0`);
    await execFileAsync("tar", [
      "-czf",
      tarballPath,
      "-C",
      sourceDir,
      "--null",
      "-T",
      fileListPath,
    ]);
  } else {
    const excludes = [
      ...Array.from(DEPLOY_DENYLIST_SEGMENTS),
      ".env",
      ".env.*",
      "*.pem",
      "*.key",
      "*.p12",
      "*.pfx",
      "*.crt",
      "*.cer",
      "service-account*.json",
    ];
    await execFileAsync("tar", [
      "-czf",
      tarballPath,
      ...excludes.flatMap((value) => [`--exclude=${value}`]),
      "-C",
      sourceDir,
      ".",
    ]);
  }

  const fileStats = await stat(tarballPath);
  return {
    path: tarballPath,
    sizeBytes: fileStats.size,
    sha256: await hashFile(tarballPath),
  };
}

async function requestDeploymentUpload(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
  tarball: Tarball,
): Promise<UnknownRecord> {
  const payload = await authenticatedJson(
    runtime,
    session,
    `/projects/${encodeURIComponent(projectId)}/deployment-uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        contentType: "application/gzip",
        sizeBytes: tarball.sizeBytes,
      }),
    },
  );
  return asRecord(payload) || {};
}

async function uploadTarball(
  uploadUrl: string,
  tarballPath: string,
  sizeBytes: number,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(sizeBytes),
    },
    body: createReadStream(tarballPath),
    duplex: "half",
  } as unknown as RequestInit);

  if (!response.ok) {
    const text = await response.text();
    throw new CliError(`Upload failed with ${response.status}: ${text}`);
  }
}

async function startUploadedDeployment(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
  upload: UnknownRecord,
  sourceHash: string,
): Promise<UnknownRecord> {
  const payload = await authenticatedJson(
    runtime,
    session,
    `/projects/${encodeURIComponent(projectId)}/deployments`,
    {
      method: "POST",
      body: JSON.stringify({
        source: {
          type: "uploadedArtifact",
          versionId: upload.versionId,
          objectPath: upload.objectPath,
          sourceHash,
        },
      }),
    },
  );
  return asRecord(payload) || {};
}

async function deployProject(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
  sourceDir: string,
): Promise<UnknownRecord> {
  await assertProjectExists(runtime, session, projectId);
  const tarball = await createSourceTarball(sourceDir);
  try {
    const upload = await requestDeploymentUpload(
      runtime,
      session,
      projectId,
      tarball,
    );
    const uploadUrl = pickString(upload, ["uploadUrl", "url"]);
    if (!uploadUrl) {
      throw new CliError(
        "Deployment upload request did not return an upload URL.",
      );
    }
    await uploadTarball(uploadUrl, tarball.path, tarball.sizeBytes);
    const deployment = await startUploadedDeployment(
      runtime,
      session,
      projectId,
      upload,
      tarball.sha256,
    );
    if (deployment.success === false) {
      throw new CliError(
        pickString(deployment, ["error"]) || "Deployment failed to start.",
      );
    }
    return deployment;
  } finally {
    await rm(dirname(tarball.path), { recursive: true, force: true }).catch(
      () => {},
    );
  }
}

async function fetchDeployments(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
): Promise<UnknownRecord[]> {
  const payload = await firstSuccessfulJson(runtime, session, [
    `/projects/${encodeURIComponent(projectId)}/deployments`,
    `/deployments?projectId=${encodeURIComponent(projectId)}`,
  ]);
  return readArray(payload, ["deployments", "data", "items"]);
}

async function fetchDeployment(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
  deploymentId: string,
): Promise<UnknownRecord> {
  try {
    const payload = await firstSuccessfulJson(runtime, session, [
      `/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}`,
      `/deployments/${encodeURIComponent(deploymentId)}`,
    ]);
    return (
      readObject(payload, ["deployment", "data"]) || asRecord(payload) || {}
    );
  } catch {
    const deployments = await fetchDeployments(runtime, session, projectId);
    const deployment = deployments.find((item) =>
      [pickString(item, ["id"]), pickString(item, ["deploymentId"])].includes(
        deploymentId,
      ),
    );
    if (!deployment) {
      throw new CliError(`Deployment ${deploymentId} was not found.`);
    }
    return deployment;
  }
}

async function fetchDeploymentLogs(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
  deploymentId: string,
): Promise<unknown> {
  return firstSuccessfulJson(runtime, session, [
    `/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/logs`,
    `/deployments/${encodeURIComponent(deploymentId)}/logs`,
  ]);
}

function readProjectOption(options: ProjectOptions): string | undefined {
  return options.project || options.projectId;
}

function readEnvironment(
  options: EnvironmentOptions,
  runtime: RuntimeConfig,
): "dev" | "prod" {
  const environment = options.env || runtime.environment || "dev";
  if (environment !== "dev" && environment !== "prod") {
    throw new CliError("--env must be either dev or prod.");
  }
  return environment;
}

async function findFracConfig(startDir: string): Promise<{
  path: string;
  config: { projectId: string };
} | null> {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, "frac.json");
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as UnknownRecord;
      if (!parsed.projectId || typeof parsed.projectId !== "string") {
        throw new CliError(`${candidate} is missing projectId.`);
      }
      return { path: candidate, config: { projectId: parsed.projectId } };
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      const code =
        typeof error === "object" && error && "code" in error
          ? (error as { code?: string }).code
          : undefined;
      if (code !== "ENOENT") {
        throw new CliError(
          `Could not read ${candidate}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

async function resolveConfiguredProjectId(
  options: ProjectOptions,
  runtime: RuntimeConfig,
  cwd = process.cwd(),
): Promise<string | undefined> {
  const explicitProjectId = readProjectOption(options);
  if (explicitProjectId) {
    return explicitProjectId;
  }
  const existingConfig = await findFracConfig(cwd);
  if (existingConfig) {
    return existingConfig.config.projectId;
  }
  return runtime.projectId;
}

async function resolveRequiredProjectId(
  runtime: RuntimeConfig,
  session: Session,
  options: ProjectOptions,
): Promise<string> {
  const configuredProjectId = await resolveConfiguredProjectId(
    options,
    runtime,
  );
  if (configuredProjectId) {
    return configuredProjectId;
  }

  const projects = await fetchProjects(runtime, session);
  if (projects.length === 1) {
    return pickString(projects[0], ["id"]) || "";
  }
  if (projects.length === 0) {
    throw new CliError(
      "No projects found. Pass --project <id> after creating a project.",
    );
  }

  const projectList = projects
    .slice(0, 10)
    .map((project) => {
      const id = pickString(project, ["id"]) || "unknown";
      const name = pickString(project, ["name"]);
      return `  ${id}${name ? `  ${name}` : ""}`;
    })
    .join("\n");
  throw new CliError(
    `Pass --project <id>. Available projects:\n${projectList}`,
  );
}

async function resolveDeployProject(
  runtime: RuntimeConfig,
  session: Session,
  options: ProjectOptions & { name?: string; yes?: boolean },
  cwd: string,
): Promise<string> {
  const explicitProjectId = readProjectOption(options);
  const fallbackProjectId = explicitProjectId || runtime.projectId;
  const existingConfig = await findFracConfig(cwd);
  if (existingConfig) {
    if (
      explicitProjectId &&
      explicitProjectId !== existingConfig.config.projectId
    ) {
      throw new CliError(
        `--project does not match ${existingConfig.path}. Remove --project or update frac.json.`,
      );
    }
    await assertProjectExists(
      runtime,
      session,
      existingConfig.config.projectId,
    );
    return existingConfig.config.projectId;
  }

  const configPath = join(cwd, "frac.json");
  if (fallbackProjectId) {
    await assertProjectExists(runtime, session, fallbackProjectId);
    await writeFile(
      configPath,
      `${JSON.stringify({ projectId: fallbackProjectId }, null, 2)}\n`,
    );
    console.log(`Wrote ${configPath}.`);
    return fallbackProjectId;
  }

  const defaultName = basename(cwd) || "Fractal Deployment";
  const name =
    options.name ||
    (options.yes ? defaultName : await promptText("Project name", defaultName));
  const project = await createDeploymentProject(runtime, session, name);
  const projectId = pickString(project, ["id"]);
  if (!projectId) {
    throw new CliError("Project creation did not return an ID.");
  }
  await writeFile(configPath, `${JSON.stringify({ projectId }, null, 2)}\n`);
  console.log(`Created deployment project ${projectId}.`);
  console.log(`Wrote ${configPath}.`);
  return projectId;
}

async function promptText(
  question: string,
  defaultValue: string,
): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question(`${question} (${defaultValue}): `);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function handleDeploy(
  runtime: RuntimeConfig,
  options: ProjectOptions & {
    name?: string;
    yes?: boolean;
    wait?: boolean;
    timeout?: string;
    pollInterval?: string;
  },
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const cwd = process.cwd();
  const projectId = await resolveDeployProject(runtime, session, options, cwd);
  console.log("Packaging source...");
  console.log("Uploading source and starting deployment...");
  const deployment = await deployProject(runtime, session, projectId, cwd);
  const deploymentId = readDeploymentId(deployment);
  console.log(`Deployment queued${deploymentId ? `: ${deploymentId}` : ""}.`);

  if (options.wait) {
    if (!deploymentId) {
      throw new CliError(
        "Cannot wait because the API did not return a deployment ID.",
      );
    }
    const completed = await waitForDeployment(runtime, session, {
      deploymentId,
      projectId,
      timeoutSeconds: parsePositiveInteger(
        options.timeout || String(DEFAULT_WAIT_TIMEOUT_SECONDS),
      ),
      intervalSeconds: parsePositiveInteger(
        options.pollInterval || String(DEFAULT_WAIT_INTERVAL_SECONDS),
      ),
    });
    printDeployment(completed);
  }
}

async function waitForDeployment(
  runtime: RuntimeConfig,
  session: Session,
  options: DeploymentRef & {
    timeoutSeconds: number;
    intervalSeconds: number;
  },
): Promise<UnknownRecord> {
  const deadline = Date.now() + options.timeoutSeconds * 1000;
  let lastDeployment: UnknownRecord = {};

  while (Date.now() <= deadline) {
    lastDeployment = await fetchDeployment(
      runtime,
      session,
      options.projectId,
      options.deploymentId,
    );
    const status = readDeploymentStatus(lastDeployment);
    if (status) {
      console.log(`Deployment ${options.deploymentId}: ${status}`);
    }
    if (status && isTerminalDeploymentStatus(status)) {
      if (isFailedDeploymentStatus(status)) {
        throw new CliError(
          `Deployment ${options.deploymentId} finished with status ${status}.`,
        );
      }
      return lastDeployment;
    }
    await sleep(options.intervalSeconds * 1000);
  }

  throw new CliError(
    `Timed out waiting for deployment ${options.deploymentId}. Last status: ${
      readDeploymentStatus(lastDeployment) || "unknown"
    }.`,
  );
}

async function handleProjectShow(
  runtime: RuntimeConfig,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const project = await fetchProject(runtime, session, projectId);
  printProject(runtime, projectId, project);
}

async function handleProjectOpen(
  runtime: RuntimeConfig,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const url = projectDashboardUrl(runtime, projectId);
  console.log(`Opening ${url}`);
  await openBrowser(url);
}

async function handleDeploymentsList(
  runtime: RuntimeConfig,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const deployments = await fetchDeployments(runtime, session, projectId);
  if (deployments.length === 0) {
    console.log(`No deployments found for project ${projectId}.`);
    return;
  }
  for (const deployment of deployments) {
    printDeploymentSummary(deployment);
  }
}

async function handleDeploymentsGet(
  runtime: RuntimeConfig,
  deploymentId: string,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const deployment = await fetchDeployment(
    runtime,
    session,
    projectId,
    deploymentId,
  );
  printDeployment(deployment);
}

async function handleDeploymentsLogs(
  runtime: RuntimeConfig,
  deploymentId: string,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const logs = await fetchDeploymentLogs(
    runtime,
    session,
    projectId,
    deploymentId,
  );
  printLogs(logs);
}

async function createCloudStorageToken(
  runtime: RuntimeConfig,
  session: Session,
  options: {
    projectId: string;
    environment: "dev" | "prod";
    expiresInSeconds?: number;
  },
): Promise<UnknownRecord> {
  const payload = await authenticatedJson(
    runtime,
    session,
    `/projects/${encodeURIComponent(options.projectId)}/cloud/storage/token`,
    {
      method: "POST",
      body: JSON.stringify({
        environment: options.environment,
        ...(options.expiresInSeconds
          ? { expiresInSeconds: options.expiresInSeconds }
          : {}),
      }),
    },
  );
  return asRecord(payload) || {};
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function handleCloudToken(
  runtime: RuntimeConfig,
  options: ProjectOptions &
    EnvironmentOptions & {
      ttl?: string;
      format?: string;
    },
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const environment = readEnvironment(options, runtime);
  const payload = await createCloudStorageToken(runtime, session, {
    projectId,
    environment,
    expiresInSeconds: options.ttl
      ? parsePositiveInteger(options.ttl)
      : undefined,
  });
  const token = pickString(payload, ["token"]) || "";
  const origin = pickString(payload, ["origin"]) || "";
  const expiresAt = pickString(payload, ["expiresAt"]) || "";

  if (options.format === "raw") {
    console.log(token);
    return;
  }
  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          FRACTAL_CLOUD_TOKEN: token,
          FRACTAL_CLOUD_STORAGE_ORIGIN: origin,
          expiresAt,
          projectId,
          environment,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`export FRACTAL_CLOUD_TOKEN=${shellQuote(token)}`);
  console.log(`export FRACTAL_CLOUD_STORAGE_ORIGIN=${shellQuote(origin)}`);
  if (expiresAt) {
    console.log(`# expires at ${expiresAt}`);
  }
}

async function getDatabaseConnectionUrl(
  runtime: RuntimeConfig,
  session: Session,
  options: {
    projectId: string;
    environment: "dev" | "prod";
  },
): Promise<string> {
  const payload = await authenticatedJson(
    runtime,
    session,
    `/projects/${encodeURIComponent(options.projectId)}/database/connection-url`,
    {
      method: "POST",
      body: JSON.stringify({ environment: options.environment }),
    },
  );
  const record = asRecord(payload);
  const url = pickString(record, ["url", "connectionUrl", "connectionURL"]);
  if (!url) {
    throw new CliError(
      "Database connection URL response did not include a URL.",
    );
  }
  return url;
}

async function handleCloudSql(
  runtime: RuntimeConfig,
  options: ProjectOptions &
    EnvironmentOptions & {
      printUrl?: boolean;
    },
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const environment = readEnvironment(options, runtime);
  const url = await getDatabaseConnectionUrl(runtime, session, {
    projectId,
    environment,
  });
  if (options.printUrl) {
    console.log(url);
    return;
  }
  await new Promise<void>((resolvePsql, reject) => {
    const child = spawn("psql", [url], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePsql();
      } else {
        reject(new CliError(`psql exited with code ${code ?? 1}`));
      }
    });
  });
}

async function enableCloudStorage(
  runtime: RuntimeConfig,
  session: Session,
  projectId: string,
): Promise<void> {
  await authenticatedJson(
    runtime,
    session,
    `/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ cloudStorageEnabled: true }),
    },
  );
}

function normalizeObjectKey(value: string): string {
  const objectKey = value.replace(/^\/+/, "");
  if (!objectKey) {
    throw new CliError("Storage object path is required.");
  }
  return objectKey;
}

function encodeObjectKey(objectKey: string): string {
  return normalizeObjectKey(objectKey)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function storageFetch(
  token: UnknownRecord,
  objectKey: string,
  init: RequestInit = {},
): Promise<Response> {
  const authToken = pickString(token, ["token"]);
  const origin = pickString(token, ["origin"]);
  if (!authToken || !origin) {
    throw new CliError(
      "Cloud storage token response was missing token or origin.",
    );
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${authToken}`);
  return fetch(`${origin}/v1/objects/${encodeObjectKey(objectKey)}`, {
    ...init,
    headers,
  });
}

async function storageListFetch(
  token: UnknownRecord,
  args: { prefix?: string; limit?: string },
): Promise<Response> {
  const authToken = pickString(token, ["token"]);
  const origin = pickString(token, ["origin"]);
  if (!authToken || !origin) {
    throw new CliError(
      "Cloud storage token response was missing token or origin.",
    );
  }
  const params = new URLSearchParams();
  if (args.prefix) {
    params.set("prefix", args.prefix);
  }
  if (args.limit) {
    params.set("limit", args.limit);
  }
  const query = params.toString();
  return fetch(`${origin}/v1/objects${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

async function handleCloudStorageEnable(
  runtime: RuntimeConfig,
  options: ProjectOptions,
): Promise<void> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  await enableCloudStorage(runtime, session, projectId);
  console.log(`Cloud storage enabled for project ${projectId}.`);
}

async function readCloudTokenOptions(
  runtime: RuntimeConfig,
  options: ProjectOptions &
    EnvironmentOptions & {
      ttl?: string;
    },
): Promise<{
  session: Session;
  projectId: string;
  environment: "dev" | "prod";
  token: UnknownRecord;
}> {
  const session = await getSessionWithFreshAccessToken(runtime);
  const projectId = await resolveRequiredProjectId(runtime, session, options);
  const environment = readEnvironment(options, runtime);
  const token = await createCloudStorageToken(runtime, session, {
    projectId,
    environment,
    expiresInSeconds: options.ttl
      ? parsePositiveInteger(options.ttl)
      : undefined,
  });
  return { session, projectId, environment, token };
}

async function handleCloudStoragePut(
  runtime: RuntimeConfig,
  localFile: string,
  remotePath: string,
  options: ProjectOptions &
    EnvironmentOptions & {
      contentType?: string;
      ttl?: string;
    },
): Promise<void> {
  const { token } = await readCloudTokenOptions(runtime, options);
  const body = await readFile(localFile);
  const response = await storageFetch(token, remotePath, {
    method: "PUT",
    headers: {
      "Content-Type": options.contentType || "application/octet-stream",
    },
    body,
  });
  if (!response.ok) {
    throw new CliError(
      `Upload failed with ${response.status}: ${await response.text()}`,
    );
  }
  console.log(`Uploaded ${localFile} to ${normalizeObjectKey(remotePath)}.`);
}

async function handleCloudStorageGet(
  runtime: RuntimeConfig,
  remotePath: string,
  localFile: string | undefined,
  options: ProjectOptions &
    EnvironmentOptions & {
      output?: string;
      ttl?: string;
    },
): Promise<void> {
  const { token } = await readCloudTokenOptions(runtime, options);
  const response = await storageFetch(token, remotePath);
  if (!response.ok) {
    throw new CliError(
      `Download failed with ${response.status}: ${await response.text()}`,
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  const outputPath = options.output || localFile;
  if (outputPath) {
    await writeFile(outputPath, body);
    console.log(
      `Downloaded ${normalizeObjectKey(remotePath)} to ${outputPath}.`,
    );
  } else {
    process.stdout.write(body);
  }
}

async function handleCloudStorageList(
  runtime: RuntimeConfig,
  prefix: string | undefined,
  options: ProjectOptions &
    EnvironmentOptions & {
      limit?: string;
      ttl?: string;
    },
): Promise<void> {
  const { projectId, environment, token } = await readCloudTokenOptions(
    runtime,
    options,
  );
  const response = await storageListFetch(token, {
    prefix,
    limit: options.limit,
  });
  if (!response.ok) {
    throw new CliError(
      `List failed with ${response.status}: ${await response.text()}`,
    );
  }
  const payload = await readJsonResponse(response);
  const objects = readArray(payload, ["objects", "items", "data"]);
  console.log(
    `# R2 bucket key prefix: ${projectId}/${environment}/${
      prefix ? normalizeObjectKey(prefix) : ""
    }`,
  );
  for (const object of objects) {
    console.log(formatLogLine(object));
  }
}

function addProjectOptions(command: Command): Command {
  return command
    .option(
      "-p, --project <id>",
      "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    )
    .option(
      "--project-id <id>",
      "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    );
}

function addEnvironmentOption(command: Command, label: string): Command {
  return command.option(
    "-e, --env <dev|prod>",
    `${label} environment, defaults to dev`,
  );
}

function addCloudTokenOptions(command: Command): Command {
  addProjectOptions(command);
  addEnvironmentOption(command, "Cloud");
  return command
    .option("--ttl <seconds>", "Token lifetime, max currently 3600 seconds")
    .option(
      "--format <env|raw|json>",
      "Output format, defaults to env",
      parseTokenFormat,
      "env",
    );
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("must be a positive integer.");
  }
  return parsed;
}

function parseTokenFormat(value: string): string {
  if (!["env", "raw", "json"].includes(value)) {
    throw new InvalidArgumentError("must be env, raw, or json.");
  }
  return value;
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function readArray(value: unknown, keys: string[]): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is UnknownRecord => !!asRecord(item));
  }
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = record?.[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is UnknownRecord => !!asRecord(item),
      );
    }
  }
  return [];
}

function readObject(value: unknown, keys: string[]): UnknownRecord | undefined {
  const record = asRecord(value);
  for (const key of keys) {
    const candidate = asRecord(record?.[key]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function pickString(
  record: UnknownRecord | undefined,
  keys: string[],
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "boolean") {
      return String(value);
    }
  }
  return undefined;
}

function readDeploymentId(deployment: UnknownRecord): string | undefined {
  return pickString(deployment, ["deploymentId", "id"]);
}

function readDeploymentStatus(deployment: UnknownRecord): string | undefined {
  return pickString(deployment, ["status", "state", "phase"])?.toLowerCase();
}

function isTerminalDeploymentStatus(status: string): boolean {
  return [
    "active",
    "cancelled",
    "canceled",
    "complete",
    "completed",
    "deployed",
    "error",
    "failed",
    "failure",
    "ready",
    "success",
    "succeeded",
    "timed_out",
    "timeout",
  ].includes(status);
}

function isFailedDeploymentStatus(status: string): boolean {
  return [
    "cancelled",
    "canceled",
    "error",
    "failed",
    "failure",
    "timed_out",
    "timeout",
  ].includes(status);
}

function readMcpUrl(record: UnknownRecord): string | undefined {
  const direct = pickString(record, [
    "mcpUrl",
    "mcpURL",
    "mcp_url",
    "mcpEndpoint",
    "mcpEndpointUrl",
    "mcp_endpoint_url",
    "endpointUrl",
    "deploymentUrl",
    "url",
  ]);
  if (direct) {
    return direct;
  }

  for (const key of [
    "deployment",
    "latestDeployment",
    "currentDeployment",
    "environment",
  ]) {
    const nested = asRecord(record[key]);
    if (nested) {
      const nestedUrl = readMcpUrl(nested);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return undefined;
}

function projectDashboardUrl(
  runtime: RuntimeConfig,
  projectId: string,
): string {
  return `${runtime.dashboardBaseUrl.replace(/\/+$/, "")}/projects/${encodeURIComponent(projectId)}`;
}

function printProject(
  runtime: RuntimeConfig,
  projectId: string,
  project: UnknownRecord,
): void {
  console.log(`Project: ${projectId}`);
  const name = pickString(project, ["name"]);
  if (name) {
    console.log(`Name: ${name}`);
  }
  const status = pickString(project, ["status", "state"]);
  if (status) {
    console.log(`Status: ${status}`);
  }
  const deployed = pickString(project, ["deployed", "isDeployed"]);
  if (deployed) {
    console.log(`Deployed: ${deployed}`);
  }
  const mcpUrl = readMcpUrl(project);
  if (mcpUrl) {
    console.log(`MCP URL: ${mcpUrl}`);
  } else {
    console.log("MCP URL: unavailable");
  }
  console.log(`Dashboard: ${projectDashboardUrl(runtime, projectId)}`);
}

function printDeploymentSummary(deployment: UnknownRecord): void {
  const id = readDeploymentId(deployment) || "unknown";
  const status = readDeploymentStatus(deployment) || "unknown";
  const createdAt = pickString(deployment, ["createdAt", "created_at"]) || "";
  const mcpUrl = readMcpUrl(deployment);
  console.log([id, status, createdAt, mcpUrl].filter(Boolean).join("  "));
}

function printDeployment(deployment: UnknownRecord): void {
  const id = readDeploymentId(deployment);
  if (id) {
    console.log(`Deployment: ${id}`);
  }
  const status = readDeploymentStatus(deployment);
  if (status) {
    console.log(`Status: ${status}`);
  }
  for (const key of ["createdAt", "updatedAt", "startedAt", "finishedAt"]) {
    const value = pickString(deployment, [key]);
    if (value) {
      console.log(`${key}: ${value}`);
    }
  }
  const mcpUrl = readMcpUrl(deployment);
  if (mcpUrl) {
    console.log(`MCP URL: ${mcpUrl}`);
  }
  console.log(JSON.stringify(deployment, null, 2));
}

function printLogs(payload: unknown): void {
  if (typeof payload === "string") {
    console.log(payload);
    return;
  }
  const record = asRecord(payload);
  const raw = pickString(record, ["logs", "log", "text"]);
  if (raw) {
    console.log(raw);
    return;
  }
  const lines = readArray(payload, [
    "logs",
    "lines",
    "events",
    "items",
    "data",
  ]);
  if (lines.length > 0) {
    for (const line of lines) {
      console.log(formatLogLine(line));
    }
    return;
  }
  console.log(JSON.stringify(payload, null, 2));
}

function formatLogLine(record: UnknownRecord): string {
  const timestamp = pickString(record, [
    "timestamp",
    "time",
    "createdAt",
    "created_at",
  ]);
  const level = pickString(record, ["level", "severity"]);
  const message =
    pickString(record, ["message", "text", "line", "key", "name"]) ||
    JSON.stringify(record);
  return [timestamp, level, message].filter(Boolean).join(" ");
}

function buildProgram(runtime: RuntimeConfig): Command {
  const program = new Command()
    .name("usefractal")
    .description("Fractal CLI")
    .showHelpAfterError()
    .addHelpText(
      "after",
      `
Environment:
  FRACTAL_API_URL          Fractal backend URL, defaults to ${runtime.baseUrl}
  FRACTAL_DASHBOARD_URL    Fractal dashboard URL, defaults to ${runtime.dashboardBaseUrl}
  FRACTAL_PROJECT_ID       Fallback project ID when frac.json is not present
`,
    );

  program
    .command("login")
    .description("Authenticate with Fractal and store the session")
    .action(async () => login(runtime));

  program
    .command("whoami")
    .description("Show the current login session")
    .action(async () => whoami());

  program
    .command("logout")
    .description("Remove the stored session")
    .action(async () => logout());

  addProjectOptions(
    program
      .command("deploy")
      .description("Deploy the current directory using frac.json")
      .option(
        "--name <name>",
        "Project name when creating a new deployment project",
      )
      .option("-y, --yes", "Use defaults without prompting")
      .option("--wait", "Wait for the deployment to finish")
      .option("--timeout <seconds>", "Maximum seconds to wait, defaults to 600")
      .option(
        "--poll-interval <seconds>",
        "Polling interval seconds, defaults to 5",
      ),
  ).action(async (options) => handleDeploy(runtime, options));

  const deployments = program
    .command("deployments")
    .description("Manage deployments");
  addProjectOptions(
    deployments.command("list").description("List project deployments"),
  ).action(async (options) => handleDeploymentsList(runtime, options));
  addProjectOptions(
    deployments
      .command("get")
      .description("Show deployment details")
      .argument("<deployment-id>", "Deployment ID"),
  ).action(async (deploymentId, options) =>
    handleDeploymentsGet(runtime, deploymentId, options),
  );
  addProjectOptions(
    deployments
      .command("logs")
      .description("Print deployment logs")
      .argument("<deployment-id>", "Deployment ID"),
  ).action(async (deploymentId, options) =>
    handleDeploymentsLogs(runtime, deploymentId, options),
  );

  const project = program
    .command("project")
    .description("Manage the current project");
  addProjectOptions(
    project.command("show").description("Print project status and MCP URL"),
  ).action(async (options) => handleProjectShow(runtime, options));
  addProjectOptions(
    project
      .command("open")
      .description("Open the Fractal dashboard for the current project"),
  ).action(async (options) => handleProjectOpen(runtime, options));

  const cloud = program
    .command("cloud")
    .description("Manage Fractal Cloud")
    .addHelpText(
      "after",
      `
Environment:
  FRACTAL_PROJECT_ID            Fallback project ID when frac.json is not present
  FRACTAL_CLOUD_ENVIRONMENT     Default cloud environment
`,
    );
  addCloudTokenOptions(
    cloud.command("token").description("Print a scoped FRACTAL_CLOUD_TOKEN"),
  ).action(async (options) => handleCloudToken(runtime, options));
  addProjectOptions(
    addEnvironmentOption(
      cloud
        .command("sql")
        .description("Open a SQL shell for a project database")
        .option(
          "--print-url",
          "Print the connection URL instead of opening psql",
        ),
      "Cloud",
    ),
  ).action(async (options) => handleCloudSql(runtime, options));

  const storage = cloud
    .command("storage")
    .description("Manage Fractal Cloud Storage");
  addProjectOptions(
    storage.command("enable").description("Enable cloud storage for a project"),
  ).action(async (options) => handleCloudStorageEnable(runtime, options));
  addProjectOptions(
    addEnvironmentOption(
      storage
        .command("put")
        .description("Upload a file to cloud storage")
        .argument("<local-file>", "Local file to upload")
        .argument("<remote-path>", "Destination path")
        .option("--content-type <type>", "Content-Type for the uploaded file"),
      "Cloud",
    ),
  ).action(async (localFile, remotePath, options) =>
    handleCloudStoragePut(runtime, localFile, remotePath, options),
  );
  addProjectOptions(
    addEnvironmentOption(
      storage
        .command("get")
        .description("Download a file from cloud storage")
        .argument("<remote-path>", "Remote path to download")
        .argument("[local-file]", "Local output path")
        .option("-o, --output <file>", "Output file"),
      "Cloud",
    ),
  ).action(async (remotePath, localFile, options) =>
    handleCloudStorageGet(runtime, remotePath, localFile, options),
  );
  addProjectOptions(
    addEnvironmentOption(
      storage
        .command("list")
        .description("List cloud storage objects")
        .argument("[prefix]", "Object path prefix")
        .option("--limit <number>", "Max objects to list, defaults to 100"),
      "Cloud",
    ),
  ).action(async (prefix, options) =>
    handleCloudStorageList(runtime, prefix, options),
  );

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await buildProgram(getRuntimeConfig()).parseAsync(argv);
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
