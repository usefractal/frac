# Frac - the MCP Apps framework

<p align="center">
  <a href="https://docs.usefractal.dev">
    <img alt="Frac, the full-stack React framework for MCP apps and MCP servers" src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/github-banner.png" width="100%" />
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
  <a href="https://www.npmjs.com/package/frac"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/v/frac?color=77F5EE&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="npm version" src="https://img.shields.io/npm/v/frac?color=E3FAF7&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
  <a href="https://www.npmjs.com/package/frac"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/npm/dm/frac?color=D7FFC8&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="npm downloads" src="https://img.shields.io/npm/dm/frac?color=E8FBD9&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
  <a href="https://discord.com/invite/gNAazGueab"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/Discord-community-77F5EE?style=for-the-badge&amp;logo=discord&amp;logoColor=77F5EE&amp;labelColor=161B22"><img alt="Discord community" src="https://img.shields.io/badge/Discord-community-E3FAF7?style=for-the-badge&amp;logo=discord&amp;logoColor=5865F2&amp;labelColor=F6F8FA"></picture></a>
  <a href="https://github.com/fractal/frac/blob/main/LICENSE"><picture><source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/github/license/fractal/frac?color=D7FFC8&amp;labelColor=161B22&amp;style=for-the-badge"><img alt="License: MIT" src="https://img.shields.io/github/license/fractal/frac?color=E8FBD9&amp;labelColor=F6F8FA&amp;style=for-the-badge"></picture></a>
</p>

## About Frac

Frac helps developers build type-safe MCP apps for Claude, ChatGPT and other UI-enabled MCP clients, with a complete set of tooling designed for both humans and agents.

Why? MCP apps extend the [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro) with **rich, interactive UI views** rendered from MCP servers. Conversational apps need seamless interaction between the user, the UI, and the model. This means new UX patterns, developer tooling, and abstractions. 
Plus, the raw SDKs are low-level: no hooks, type safety, HMR, etc.

That's why we built *Frac*.

Features include:

- **Delightful dev environment**: Frac provides a dev server, hot module reload, and a straightforward local MCP testing loop.
- **Write once, run everywhere**: the framework abstracts implementation differences between MCP clients, so your app runs seamlessly in Claude, ChatGPT, VSCode, and any other MCP apps compatible client.
- **Agent-ready**: skills, CLI, and clear framework conventions so your coding agent can build MCP apps end-to-end.
- **Type-safe end-to-end**: tRPC-style inference from MCP server tool definition to React view for type safety from server to frontend.
- **React-first**: Intuitive React Query-style hooks, with advanced state management. 
- **Fractals**: register reusable component primitives and let the model compose them into typed UIs.

They chose to build their MCP apps with Frac: 

<p align="center">
  <a href="https://www.datadoghq.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/datadog-dark.svg"><img src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/datadog-light.svg" alt="Datadog" height="24"></picture></a>
  &nbsp;&nbsp;
  <a href="https://bitmovin.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/bitmovin-dark.svg"><img src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/bitmovin-light.svg" alt="Bitmovin" height="22"></picture></a>
  &nbsp;&nbsp;
  <a href="https://www.evaneos.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/evaneos-dark.svg"><img src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/evaneos-light.svg" alt="Evaneos" height="18"></picture></a>
  &nbsp;&nbsp;
  <a href="https://www.touchstream.media"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/touchstream-dark.svg"><img src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/touchstream-light.svg" alt="Touchstream" height="24"></picture></a>
  &nbsp;&nbsp;
  <a href="https://www.cottages.com"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/cottages-dark.svg"><img src="https://raw.githubusercontent.com/fractal/frac/main/docs/images/user-logos/cottages-light.svg" alt="Cottages.com" height="24"></picture></a>
</p>

## Get started

**For agents**

Install our skill for building MCP apps and ChatGPT apps:
```bash
npx skills add fractal/frac -s frac
```
Once installed, ask your agent "What skills do you have?" to confirm, then try:

- _Create a new MCP app_
- _Migrate my MCP server to the Frac framework_
- _Add a new view to my MCP app_ 

**For humans**

Bootstrap a new project with:
```bash
npm create frac@latest my-app
```
For full install instructions, read our [**Quickstart guide**](https://docs.usefractal.dev/quickstart/create-new-app).

## Documentation

The [Frac documentation](https://docs.usefractal.dev) covers the full lifecycle of building MCP Apps:

- [Fundamentals](https://docs.usefractal.dev/fundamentals): understand MCP Apps, ChatGPT Apps, and how Frac bridges both runtimes.
- [Core concepts](https://docs.usefractal.dev/concepts): learn about server <> model <> UI data flows, LLM context sync, type safety, and fast local iteration.
- [Guides](https://docs.usefractal.dev/guides/fetching-data): build real app behavior with tools, views, state, and model communication.
- [API Reference](https://docs.usefractal.dev/api-reference): browse our MCP server APIs, React hooks, CLI commands, and runtime compatibility.

## Deploy

Deploy Frac apps on any platform that can host an HTTP MCP server and static view assets.

See our [deployment guide](https://docs.usefractal.dev/quickstart/deploy) for the full production path.

## Community & Contributing

We'd love your help improving Frac. Here are a few ways to get involved:

- **Bugs**: If you run into a bug or unexpected behavior, open a [GitHub Issue](https://github.com/fractal/frac/issues) with a clear reproduction.
- **Questions and ideas**: Need help building with Frac or have ideas to improve the framework, docs, examples, or developer experience? [Open an issue](https://github.com/fractal/frac/issues) or share them on our [Discord](https://discord.com/invite/gNAazGueab).
- **Pull requests**: For code or documentation changes, read the [Contributing Guide](https://github.com/fractal/frac/blob/main/CONTRIBUTING.md) before opening a PR.

Frac is released under the [MIT License](https://github.com/fractal/frac/blob/main/LICENSE).

### Contributors

Built and maintained by the Frac contributors.

<a href="https://github.com/fractal/frac/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=fractal/frac" alt="Frac contributors">
</a>

## Example

Read the [Fractals example](https://docs.usefractal.dev/examples/fractals) to see how Frac registers reusable React component primitives and renders model-composed UIs from typed prop contracts.
