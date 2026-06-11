# Running Locally Workflow

## 1. Start Dev Server

Install dependencies and start the dev server in the background:

```bash
{pm} install && {pm} run dev
```

For Deno projects, use `deno task dev` instead.

When started, output the local MCP server URL.

Hot reload depends on the generated project's dev scripts.

## 2. Test The App

Use an MCP App-capable inspector or host to call the server at:

```text
http://localhost:3000/mcp
```

Prefer existing MCP App testing tools such as Sunpeak or MCPJam when the user wants an interactive inspector rather than building a repo-specific emulator.
