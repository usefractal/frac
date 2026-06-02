# Fractal Generative UI Example

An example Fractal app built on Skybridge. It registers React components as
composable Fractals, then uses the Skybridge runtime to render generated UI.

## Local Development

```bash
pnpm install
pnpm dev
```

Try calling `show_dashboards` with JSX that uses the registered Fractals:

```json
{
  "jsx": "<HeroPanel eyebrow=\"Weekly brief\" title=\"Launch health\" body=\"Activation is improving while support volume stays flat.\" tone=\"green\" /><div className=\"grid grid-cols-2 gap-3 mt-3\"><MetricCard label=\"Activation\" value=\"42%\" change=\"+8%\" intent=\"positive\" /><MetricCard label=\"Tickets\" value=\"31\" change=\"-4\" intent=\"positive\" /></div><ActionRow primary=\"Open dashboard\" secondary=\"Send update\" />"
}
```
