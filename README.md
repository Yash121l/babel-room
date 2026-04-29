# Babel Room

## Quick start (local)

From the **repository root** after `npm install`:

```bash
npm run dev
```

This applies **both** local D1 migrations, then starts **Wrangler** (API-only config on **8788**) and **Vite** (UI on **5173** with `/api` proxied to 8788). Open **`http://localhost:5173`**.

If you see **address already in use**, free the ports then retry:

```bash
npm run ports:free -w babel-room-worker
npm run dev
# or one shot:
npm run dev:free
```

Full Worker + static assets on a **single** port (no Vite): `cd apps/worker && npm run dev` → **`http://127.0.0.1:8787`**.

**Workers AI:** `wrangler dev --local` turns off [remote bindings](https://developers.cloudflare.com/workers/development-testing/#remote-bindings), which breaks the AI binding (`Binding AI needs to be run remotely`). Default `wrangler dev` (no `--local`) keeps D1/DO local while Workers AI calls the network.

### Invite links and testing languages

- **Copy invite link** in the room copies `/room/<code>`. Guests who open it get either your saved name/languages on this browser (`localStorage`) or a short **join** form (no more dead-end “start from home” when pasting a URL).
- Home URL with **`?join=xxxxxxxx`** pre-fills the 8-character join field (e.g. share `http://localhost:5173/?join=abcd1234`).
- **Real-time translation check:** use two profiles with **opposite** language pairs (e.g. Tab A: speak **English**, hear **Spanish**; Tab B or incognito: speak **Spanish**, hear **English**). Join the same room, allow the microphone on both, then speak from one side. With **two** participants in the room, the UI enables **WebRTC** so you hear each other’s natural voices; **translated TTS** (played sequentially so clips do not overlap) matches each listener’s “hear” language. The transcript can be shown in **your language** or **original** from toggles in the room. If someone’s “hear” language **matches** what you spoke, you still get **TTS playback** of that line so they are not silent.

### WebRTC and NAT (TURN)

Peer audio uses **WebRTC**. The SPA calls **`GET /api/webrtc-ice`** on your Worker for ICE servers: by default it returns two public **STUN** endpoints. For **production deployments**, set Worker var **`WEBRTC_ICE_SERVERS`** in `wrangler.toml` (or the dashboard) to a JSON array of [`RTCIceServer`](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceServer) objects—usually including a **TURN** URL and credentials—then redeploy. Without TURN, many mobile or corporate networks will connect signaling but **fail to carry audio**. Optionally override at build time with **`VITE_WEBRTC_ICE_SERVERS`** for local or split-origin setups. **Headphones** are strongly recommended when both live and AI audio are on, to reduce echo.

---

Production-oriented **real-time multilingual voice** stack on Cloudflare: **Workers + Durable Objects** (WebSocket hibernation) + **Workers AI** (STT / translation / TTS) + **D1** + **R2** + **Workflows**, with a **React + Vite + Tailwind** UI deployed as **[static assets](https://developers.cloudflare.com/workers/static-assets/)** on the same Worker as `/api/*`.

## Architecture

```
  Browser
        |
        |  HTTPS + WSS (same origin when deployed)
        v
+---------------------------+
|  Worker (Hono)            |
|  /api/*  -> Worker        |
|  /*      -> Vite dist SPA |
+---------------------------+
         |
    +----+----+--------------+
    |         |              |
    v         v              v
 RoomDO    Workers AI     D1 / R2
 (SQLite   whisper /      metadata,
  WS hub)  llama /        transcripts,
           melotts        summaries
```

- **`[assets]`** in `apps/worker/wrangler.toml`: `../web/dist`, `not_found_handling = "single-page-application"`, `run_worker_first = ["/api/*"]` so only API/WebSocket traffic hits your script; the shell is served from the build output.
- **D1 migrations** live in `apps/worker/migrations/` (`wrangler d1 migrations apply`).
- **`npm run deploy`** (repo root) builds the web app, then runs `wrangler deploy` for the worker.

## Production deploy

From the repo root (after `npx wrangler login` locally, or with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` in the environment):

```bash
npm run deploy
```

This builds `apps/web` into `apps/web/dist`, then deploys the Worker in `apps/worker` (API + static assets + DO / D1 / R2 / Workflows bindings per `wrangler.toml`).

**CORS:** `[vars] ALLOWED_ORIGINS` in `wrangler.toml` / `wrangler.test.toml` controls API access. Leave empty or set to `*` (via dashboard override) for permissive dev. In production, set a comma-separated allowlist, e.g. `https://babel-room-worker.your-account.workers.dev`.

**D1:** Migration `0002_drop_rooms_languages_used.sql` removes an unused column; apply remote/local migrations after upgrading the repo.

## CI/CD (GitHub Actions)

| Workflow | When it runs |
|----------|----------------|
| **CI** (`.github/workflows/ci.yml`) | Every **pull request**, and pushes to branches **other than** `main` — lint, test, production build. |
| **Deploy** (`.github/workflows/deploy.yml`) | Every **push to `main`** (and **Actions → Deploy → Run workflow** manually). Applies **D1 remote migrations**, then **`npm run deploy`**. |

### Required repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | API token with permission to deploy this Worker, apply D1 migrations, and use bound resources (create under **My Profile → API Tokens**; template *Edit Cloudflare Workers* is a good start, then add D1/R2 if deploy fails). |
| `CLOUDFLARE_ACCOUNT_ID` | **Workers & Pages** overview → copy **Account ID** (32-char hex). |

Optional: add a [GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) named `production` with required reviewers if you want a manual approval gate before deploy.

## Cloudflare resources (checklist)

| Resource | Wrangler / dashboard | Notes |
|----------|----------------------|--------|
| **D1** | `wrangler d1 create babel-room-db` | Put `database_id` in `apps/worker/wrangler.toml` (replace `REPLACE_WITH_REAL_ID`). |
| **D1 schema** | `wrangler d1 migrations apply babel-room-db --remote` | Same with `--local` for Miniflare / `wrangler dev --local`. |
| **R2** | `wrangler r2 bucket create babel-room-transcripts` | Name must match `bucket_name` in `wrangler.toml`. |
| **Workers AI** | Automatic with `[ai] binding = "AI"` | Uses account quota; models: whisper, Llama 3.1 8B, MeloTTS. |
| **Durable Objects** | `[[migrations]]` + `ROOM` binding | SQLite-backed `RoomDO` class. |
| **Workflows** | `[[workflows]]` block | `PostCallSummaryWorkflow` for post-call summaries to R2. |
| **Observability** | `[observability] enabled = true` | Logs/traces in the Workers dashboard. |

Quick helper (creates D1 + R2 if they do not exist; you still paste `database_id` and run migrations). **Run from the repository root** (the directory that contains `scripts/` and `apps/`). Run **`npm install`** there first so Wrangler is available from `node_modules` (the script does not rely on a global `wrangler`):

```bash
cd /path/to/babel-room   # your clone, e.g. ~/code/tools/babel-room
npm install
bash scripts/bootstrap-cloudflare.sh
```

### Optional: Cloudflare Realtime / RealtimeKit (SFU)

Not wired in this repo. When you add WebRTC SFU signaling, put token issuance in `apps/worker/src/realtime.ts` and add any **secrets** / **vars** in Wrangler; keep media on Workers + DO + AI as today until you integrate.

## Setup

1. **Login**

   ```bash
   npx wrangler login
   ```

2. **Install** (generates `apps/worker/worker-configuration.d.ts` via the worker `prepare` script — gitignored, recreated on `npm install`)

   ```bash
   npm install
   ```

3. **D1** — create DB, set `database_id` in `apps/worker/wrangler.toml`, apply migrations:

   ```bash
   cd apps/worker
   npx wrangler d1 create babel-room-db
   npx wrangler d1 migrations apply babel-room-db --remote
   # local persistence:
   npx wrangler d1 migrations apply babel-room-db --local
   ```

4. **R2** — create the bucket name from `wrangler.toml`.

5. **Deploy UI + Worker** (from repo root):

   ```bash
   npm run deploy
   ```

   Or manually: `npm run build -w babel-room-web` then `cd apps/worker && npm run deploy`.

After deploy, open the **Workers** route URL; `/` is the SPA and `/api/*` is the API (same origin, no `VITE_API_BASE_URL` needed).

## Local development

| What you run | Ports | Open |
|--------------|-------|------|
| **`npm run dev`** (repo root) | Worker **8788** + Vite **5173** | **`http://localhost:5173`** — same as Quick start. |
| **`cd apps/worker && npm run dev`** | **8787** only | **`http://127.0.0.1:8787`** — Wrangler + built static assets (no Vite hot reload). |
| **`cd apps/worker && npm run dev:api`** | Worker **8788** | Use with Vite separately, or use root **`npm run dev`**. |

Wrangler dev always passes **`--port 8787`** or **`--port 8788`** so the listen port does not fall back to a stale value. Use **`npx wrangler`** (or **`npm run`** in `apps/worker`) — a global **`wrangler`** binary is optional.

**`npm run db:setup:local -w babel-room-worker`** applies migrations for **both** local D1 bindings (main + test config). Root **`npm run dev`** runs that first.

## Tests

```bash
cd apps/worker
npm test
```

Vitest uses `wrangler.test.toml` (no static assets folder). `isolatedStorage: false` is required when Workflows are defined.

## Known limitations

- **TTS latency** is often on the order of **~300ms per language** on Workers AI.
- **MeloTTS** returns **MP3** (base64), not raw PCM; the web client uses `decodeAudioData`.
- **RoomDO** persists participants in DO SQLite so state survives hibernation.

## Repository layout

- `apps/worker` — Hono API, `RoomDO`, pipeline, workflows, D1 migrations, Wrangler config.
- `apps/web` — Vite + React UI.
- `packages/shared` — shared TypeScript types.
- `scripts/` — `ensure-web-dist.mjs`, `bootstrap-cloudflare.sh`.
