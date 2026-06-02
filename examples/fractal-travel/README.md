# Fractal Travel Example

An example Fractal app built on Skybridge. It exposes travel search tools and
renders travel results from registered composable Fractals.

## Local Development

```bash
pnpm install
pnpm dev
```

Try the search tools first:

- `find_flight`
- `find_hotel`
- `find_tour`

Then call `show_result` with JSX that uses the registered Fractals:

```json
{
  "jsx": "<TravelPlan title=\"Tokyo spring escape\" destination=\"Tokyo\" days={5} budget=\"$2,840\" summary=\"A balanced trip with direct flights, a design-forward hotel, food tours, and neighborhood walks.\" /><Flight airline=\"ANA\" route=\"SFO to HND\" depart=\"Apr 8, 11:20 AM\" arrive=\"Apr 9, 3:10 PM\" duration=\"11h 50m\" price=\"$1,120\" stops=\"Nonstop\" /><Hotel name=\"Kiyosumi Garden Hotel\" location=\"Koto City\" nightlyRate=\"$214/night\" rating=\"4.7\" vibe=\"Quiet boutique stay near gardens and coffee shops\" /><Tour name=\"Tsukiji breakfast walk\" location=\"Tokyo\" duration=\"3 hours\" price=\"$86\" intensity=\"easy\" highlights={props.highlights} />",
  "props": {
    "highlights": ["Market breakfast", "Knife shop visit", "Tea tasting"]
  }
}
```
