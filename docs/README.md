# frac Documentation

This documentation site is built with [Astro](https://astro.build/) and [Starlight](https://starlight.astro.build/).

If you're contributing to the docs, start with [DOCUMENTATION-MANIFESTO.md](./DOCUMENTATION-MANIFESTO.md). It is required reading for new documentation contributors and explains what belongs in the docs, how to write in frac's voice, and what to verify before opening a PR.

## Local Development

```bash
pnpm install
pnpm dev
```

Opens a local preview at `http://localhost:4321`.

From the repository root, run:

```bash
pnpm docs:dev
```

## Build

```bash
pnpm build
```

From the repository root, run:

```bash
pnpm docs:build
```

## Deployment

The docs are a static Astro build and can be deployed to Cloudflare Pages without a runtime adapter.

Cloudflare Pages settings:

- **Root directory**: `docs`
- **Build command**: `pnpm build`
- **Build output directory**: `dist`
- **Node.js version**: `24.14.1` or newer

For a direct upload from this folder:

```bash
pnpm build
wrangler pages deploy dist --project-name <cloudflare-pages-project>
```
