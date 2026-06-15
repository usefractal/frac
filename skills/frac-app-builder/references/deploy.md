# Deploy

Deploy to Fractal Cloud using the Fractal CLI.

## Parameters

- `{path-to-project}` is the path to the project directory. It is relative to the current working directory.
- Commands that deploy or inspect project state must run from `{path-to-project}` because `deploy` packages the current directory.
- When executing a command that uses `{path-to-project}`, check that you are in the correct project directory first.
- Project-aware commands resolve the project ID from `--project`, then `frac.json`, then `FRACTAL_PROJECT_ID`.

## Steps

1. **Make sure the user is logged in to Fractal**

From `{path-to-project}`, execute:

```bash
npx usefractal@latest login
```

To verify the session:

```bash
npx usefractal@latest status
```

2. **Deploy to Fractal Cloud**

From `{path-to-project}`, execute:

```bash
npx usefractal@latest deploy
```

If there is no `frac.json` and `FRACTAL_PROJECT_ID` is not set, ask the user for the Fractal project ID and deploy with:

```bash
npx usefractal@latest deploy --project {project-id}
```

3. **Subsequent deployments**

For subsequent deployments, run the same deploy command from `{path-to-project}`:

```bash
npx usefractal@latest deploy
```

If the project is not configured with `frac.json`, keep using:

```bash
npx usefractal@latest deploy --project {project-id}
```

4. **Optional project utilities**

Use these only when the user asks for them:

```bash
npx usefractal@latest token
npx usefractal@latest sql
npx usefractal@latest cloud storage
npx usefractal@latest logout
```

Full docs: [docs.usefractal.dev/api-reference/cli](https://docs.usefractal.dev/api-reference/cli)
