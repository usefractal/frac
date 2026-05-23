# Atoms Generative UI Example

An example Skybridge app that registers React components as atoms. Skybridge
generates the internal render-from-atoms tool and framework-owned render view.

## Local Development

```bash
pnpm install
pnpm dev
```

Try calling `__skybridge_render_from_atoms` with JSX that uses the registered
atoms:

```json
{
  "jsx": "<HeroPanel eyebrow=\"Weekly brief\" title=\"Launch health\" body=\"Activation is improving while support volume stays flat.\" tone=\"green\" /><div className=\"grid grid-cols-2 gap-3 mt-3\"><MetricCard label=\"Activation\" value=\"42%\" change=\"+8%\" intent=\"positive\" /><MetricCard label=\"Tickets\" value=\"31\" change=\"-4\" intent=\"positive\" /></div><ActionRow primary=\"Open dashboard\" secondary=\"Send update\" />"
}
```
