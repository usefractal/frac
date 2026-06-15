# frac - the MCP Apps framework

<p align="center">
  <a href="https://docs.usefractal.dev">
    <img alt="frac, the full-stack React framework for MCP apps and MCP servers" src="https://raw.githubusercontent.com/fractal-mcp/frac/main/docs/images/github-banner.png" width="100%" />
  </a>
</p>

<p align="center">
  <strong>The full-stack React framework for MCP Apps and MCP Servers.</strong>
</p>

<p align="center">
  <a href="https://docs.usefractal.dev">Documentation</a> ·
  <a href="https://docs.usefractal.dev/quickstart/create-new-app">Quickstart</a> ·
  <a href="https://docs.usefractal.dev/examples/fractals">Fractals example</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@usefractal/frac"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/%40usefractal/frac?color=77F5EE&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="npm version" src="https://img.shields.io/npm/v/%40usefractal/frac?color=E3FAF7&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
  <a href="https://www.npmjs.com/package/@usefractal/frac"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/%40usefractal/frac?color=D7FFC8&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="npm downloads" src="https://img.shields.io/npm/dm/%40usefractal/frac?color=E8FBD9&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
  <a href="https://discord.com/invite/gNAazGueab"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Discord-community-77F5EE?style=for-the-badge&amp;logo=discord&amp;logoColor=77F5EE&amp;labelColor=161B22"><img alt="Discord community" src="https://img.shields.io/badge/Discord-community-E3FAF7?style=for-the-badge&amp;logo=discord&amp;logoColor=5865F2&amp;labelColor=F6F8FA"></picture></a>
  <a href="https://github.com/fractal-mcp/frac/blob/main/LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/github/license/fractal-mcp/frac?color=D7FFC8&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="License: MIT" src="https://img.shields.io/github/license/fractal-mcp/frac?color=E8FBD9&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
</p>

## About frac

frac helps developers build type-safe MCP apps for Claude, ChatGPT and other UI-enabled MCP clients, with a complete set of tooling designed for both humans and agents.

Why? MCP apps extend the [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro) with **rich, interactive UI views** rendered from MCP servers. Conversational apps need seamless interaction between the user, the UI, and the model. This means new UX patterns, developer tooling, and abstractions. 
Plus, the raw SDKs are low-level: no hooks, type safety, HMR, etc.

That's why we built *frac*.

Features include:

- **Delightful dev environment**: frac provides a dev server, hot module reload, and a straightforward local MCP testing loop.
- **Write once, run everywhere**: the framework abstracts implementation differences between MCP clients, so your app runs seamlessly in Claude, ChatGPT, VSCode, and any other MCP apps compatible client.
- **Agent-ready**: skills, CLI, and clear framework conventions so your coding agent can build MCP apps end-to-end.
- **Type-safe end-to-end**: tRPC-style inference from MCP server tool definition to React view for type safety from server to frontend.
- **React-first**: Intuitive React Query-style hooks, with advanced state management. 
- **Fractals**: register reusable component primitives and let the model compose them into typed UIs.

## Get started

**For agents**

Install our skill for building MCP apps and ChatGPT apps:
```bash
npx skills add fractal-mcp/frac -s frac
```
Once installed, ask your agent "What skills do you have?" to confirm, then try:

- _Create a new MCP app_
- _Migrate my MCP server to the frac framework_
- _Add a new view to my MCP app_ 

**For humans**

Bootstrap a new project with:
```bash
npm create @usefractal/frac@latest my-app
```
For full install instructions, read our [**Quickstart guide**](https://docs.usefractal.dev/quickstart/create-new-app).

## Documentation

The [frac documentation](https://docs.usefractal.dev) covers the full lifecycle of building MCP Apps:

- [Fundamentals](https://docs.usefractal.dev/fundamentals): understand MCP Apps, ChatGPT Apps, and how frac bridges both runtimes.
- [Core concepts](https://docs.usefractal.dev/concepts): learn about server <> model <> UI data flows, LLM context sync, type safety, and fast local iteration.
- [Guides](https://docs.usefractal.dev/guides/fetching-data): build real app behavior with tools, views, state, and model communication.
- [API Reference](https://docs.usefractal.dev/api-reference): browse our MCP server APIs, React hooks, CLI commands, and runtime compatibility.

## Deploy

Deploy frac apps on any platform that can host an HTTP MCP server and static view assets.

See our [deployment guide](https://docs.usefractal.dev/quickstart/deploy) for the full production path.

## Community & Contributing

We'd love your help improving frac. Here are a few ways to get involved:

- **Bugs**: If you run into a bug or unexpected behavior, open a [GitHub Issue](https://github.com/fractal-mcp/frac/issues) with a clear reproduction.
- **Questions and ideas**: Need help building with frac or have ideas to improve the framework, docs, examples, or developer experience? [Open an issue](https://github.com/fractal-mcp/frac/issues) or share them on our [Discord](https://discord.com/invite/gNAazGueab).
- **Pull requests**: For code or documentation changes, open a focused PR with a clear description and relevant tests or docs updates.

frac is released under the [MIT License](https://github.com/fractal-mcp/frac/blob/main/LICENSE).

### Acknowledgements

frac builds on the excellent work of [Skybridge](https://github.com/alpic-ai/skybridge) and the [Alpic](https://alpic.ai) team.

We have used Skybridge in production, and among the MCP Apps frameworks we evaluated, it provided the strongest foundation for the direction we want to take frac. We deeply appreciate the design decisions, engineering effort, and open-source release that made this project possible. frac preserves that foundation while evolving the package, docs, scaffolding, and local development workflow around our own goals.

This fork is based on Skybridge commit [`6a7a272a36da19de62d86fda5fe7b58f38c32c2a`](https://github.com/alpic-ai/skybridge/commit/6a7a272a36da19de62d86fda5fe7b58f38c32c2a).

See [NOTICE.md](./NOTICE.md) for provenance and licensing notes.

<a href="https://github.com/fractal-mcp/frac/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=fractal-mcp/frac" alt="frac contributors">
</a>

## Example

Read the [Fractals example](https://docs.usefractal.dev/examples/fractals) to see how frac registers reusable React component primitives and renders model-composed UIs from typed prop contracts.
