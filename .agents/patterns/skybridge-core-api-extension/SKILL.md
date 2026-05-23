---
name: skybridge-core-api-extension
description: Extend Skybridge core APIs while preserving generated type registries and plugin/server symmetry.
applies_to: packages/core/src/**
---

# Skybridge Core API Extension

## When to Apply
- Adding public server APIs in `packages/core/src/server/server.ts`
- Adding generated name registries from Vite plugin scanning
- Extending build-time scan behavior for generated `.skybridge/*.d.ts` files

## Starting Template

```typescript
export interface ThingNameRegistry {}
export type ThingName = keyof ThingNameRegistry & string;

export interface ThingConfig {
  component: ThingName;
  description?: string;
  _meta?: Record<string, unknown>;
}

class McpServer {
  private things = new Map<string, ThingConfig>();

  registerThing(config: ThingConfig): this {
    this.things.set(config.component, config);
    return this;
  }
}
```

## Rules
1. Mirror existing view registry patterns when adding component-name registries.
2. Keep build-time scanning in the Vite plugin and generated declarations under `.skybridge`.
3. Export public types from `packages/core/src/server/index.ts`.
4. Do not add runtime rendering behavior unless the user explicitly asks for it.

## Common Mistakes
- Adding hidden tools or renderer generation when the requested API is only registration.
- Adding snake_case aliases for public APIs. Skybridge server APIs use camelCase.
