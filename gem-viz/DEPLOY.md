# Deployment

GEM Viz runs on Fly.io as a Node.js SSR app.

## Deploy

```bash
fly deploy
```

## Configuration

| File | Setting |
| --- | --- |
| `svelte.config.js` | `adapter-node`, `prerender.entries: []` |
| `Dockerfile` | Node.js production image |
| `fly.toml` | Fly.io app config (`gem-viz`) |
| `server.js` | Production server entry point |

## Environment Variables

Set via `fly secrets set`:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_OWNERSHIP_API_BASE_URL` | REST API base (`https://gem-api.thirdbear.net`) |
