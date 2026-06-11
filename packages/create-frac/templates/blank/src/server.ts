import { McpServer } from "frac/server";

const server = new McpServer(
  {
    name: "frac-blank",
    version: "0.0.1",
  },
  { capabilities: {} },
);

// Register tools with `server.registerTool(...)`.
// Docs: https://docs.usefractal.dev/api-reference/register-tool

if (process.env.NODE_ENV === "production") {
  const { default: manifest } = await import("./vite-manifest.js");
  server.setViteManifest(manifest);
}

export default await server.run();

export type AppType = typeof server;
