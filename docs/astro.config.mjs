import { fileURLToPath } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const docsSite = process.env.DOCS_SITE ?? "https://docs.usefractal.dev";
const docsBase = process.env.DOCS_BASE_PATH ?? "/";
const docsBasePrefix = docsBase === "/" ? "" : docsBase.replace(/\/$/, "");

const prefixRootPath = (value) => {
  if (!docsBasePrefix || typeof value !== "string") {
    return value;
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith(`${docsBasePrefix}/`)) {
    return value;
  }

  return `${docsBasePrefix}${value}`;
};

const walk = (node, visitor) => {
  visitor(node);

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      walk(child, visitor);
    }
  }
};

const prefixMarkdownUrls = () => (tree) => {
  walk(tree, (node) => {
    if ((node.type === "link" || node.type === "image") && typeof node.url === "string") {
      node.url = prefixRootPath(node.url);
    }
  });
};

const prefixHtmlUrls = () => (tree) => {
  walk(tree, (node) => {
    if (node.type !== "element" || !node.properties) {
      return;
    }

    node.properties.href = prefixRootPath(node.properties.href);
    node.properties.src = prefixRootPath(node.properties.src);
  });
};

export default defineConfig({
  site: docsSite,
  base: docsBase,
  markdown: {
    processor: unified({
      remarkPlugins: [prefixMarkdownUrls],
      rehypePlugins: [prefixHtmlUrls],
    }),
  },
  vite: {
    resolve: {
      alias: {
        "@components": fileURLToPath(new URL("./src/components", import.meta.url)),
      },
    },
  },
  integrations: [
    starlight({
      title: "frac",
      description: "A full stack TypeScript framework for building ChatGPT and MCP Apps",
      logo: {
        src: "./src/assets/frac-logo-hat-transparent.png",
        alt: "Fractal",
      },
      favicon: "/images/fractal_favicon_orange.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/usefractal/frac",
        },
        {
          icon: "discord",
          label: "Discord",
          href: "https://discord.com/invite/WaxJuH4d",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/usefractal/frac/edit/main/docs/src/content/docs/",
      },
      sidebar: [
        {
          label: "Get Started",
          items: [
            { label: "Introduction", slug: "" },
            {
              label: "Fundamentals",
              items: [
                { label: "Overview", slug: "fundamentals" },
                { label: "Apps SDK", slug: "fundamentals/apps-sdk" },
                { label: "MCP Apps", slug: "fundamentals/mcp-apps" },
              ],
            },
            { label: "Quickstart", slug: "quickstart/create-new-app" },
            {
              label: "Add to Existing App",
              items: [
                { label: "Overview", slug: "quickstart/add-to-existing-app" },
                { label: "Server", slug: "quickstart/add-to-existing-app/server" },
                { label: "Web", slug: "quickstart/add-to-existing-app/web" },
              ],
            },
            { label: "Migrate", slug: "quickstart/migrate" },
            { label: "Test Your App", slug: "quickstart/test-your-app" },
            { label: "Build for Production", slug: "quickstart/build-for-production" },
            { label: "Deploy", slug: "quickstart/deploy" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Overview", slug: "concepts" },
            { label: "Write Once, Run Everywhere", slug: "concepts/write-once-run-everywhere" },
            { label: "Data Flow", slug: "concepts/data-flow" },
            { label: "LLM Context Sync", slug: "concepts/llm-context-sync" },
            { label: "Fast Iteration", slug: "concepts/fast-iteration" },
            { label: "Type Safety", slug: "concepts/type-safety" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Fetching Data", slug: "guides/fetching-data" },
            { label: "Managing State", slug: "guides/managing-state" },
            { label: "Communicating with the Model", slug: "guides/communicating-with-model" },
            { label: "Host Environment Context", slug: "guides/host-environment-context" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "Overview", slug: "api-reference" },
            { label: "CLI", slug: "api-reference/cli" },
            { label: "McpServer", slug: "api-reference/mcp-server" },
            { label: "registerTool", slug: "api-reference/register-tool" },
            { label: "useToolInfo", slug: "api-reference/use-tool-info" },
            { label: "useCallTool", slug: "api-reference/use-call-tool" },
            { label: "useLayout", slug: "api-reference/use-layout" },
            { label: "useUser", slug: "api-reference/use-user" },
            { label: "useDisplayMode", slug: "api-reference/use-display-mode" },
            { label: "useOpenExternal", slug: "api-reference/use-open-external" },
            { label: "useSetOpenInAppUrl", slug: "api-reference/use-set-open-in-app-url" },
            { label: "useSendFollowUpMessage", slug: "api-reference/use-send-follow-up-message" },
            { label: "useViewState", slug: "api-reference/use-view-state" },
            { label: "useRequestModal", slug: "api-reference/use-request-modal" },
            { label: "useRequestClose", slug: "api-reference/use-request-close" },
            { label: "useRequestSize", slug: "api-reference/use-request-size" },
            { label: "useFiles", slug: "api-reference/use-files" },
            { label: "useDownload", slug: "api-reference/use-download" },
            { label: "createStore", slug: "api-reference/create-store" },
            { label: "generateHelpers", slug: "api-reference/generate-helpers" },
            { label: "data-llm", slug: "api-reference/data-llm" },
            { label: "Type Utilities", slug: "api-reference/infer-utility-types" },
            { label: "FileRef", slug: "api-reference/file-ref" },
            { label: "useAppsSdkContext", slug: "api-reference/use-apps-sdk-context" },
            { label: "useMcpAppContext", slug: "api-reference/use-mcp-app-context" },
          ],
        },
        {
          label: "Resources",
          items: [
            { label: "Examples", slug: "examples" },
            { label: "Fractals", slug: "examples/fractals" },
            { label: "FAQ", slug: "faq" },
          ],
        },
      ],
    }),
  ],
});
