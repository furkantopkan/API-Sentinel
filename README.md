# API Sentinel

A web-based REST API testing tool for QA engineers: build HTTP requests, inspect responses, run assertions, and let a local AI turn a flow you demonstrate into a runnable test collection.

> **Status:** Phases 1–6 complete: request builder and engine with SSRF protection, response analyzer, assertions, AI features, collections, environments and test reports. Phase 7 (AI collection builder) is in final review; portfolio preparation is next.

## Features (MVP)

- Methods GET, POST, PUT, PATCH, DELETE; query parameters and headers with on/off toggles; final URL preview
- Auth: Bearer token and Basic auth
- JSON body editor with validation (error line/column) and formatting; form bodies when Content-Type is application/x-www-form-urlencoded
- Per-request timeout and "follow redirects" setting
- Response: status (colour-coded), time, size, redirects, formatted JSON / text, headers, copy to clipboard
- Response Analyzer: collapsible JSON tree with type badges, field details with copyable path (`data.items[0].id`), JSON summary, warning for integers that JavaScript cannot represent exactly, and an Info tab (encoding, decoded vs wire size, redirect chain)
- Assertions: status code, response time, headers, body text and JSON path checks (exists, equals, null, type, contains, greater/less than) with live PASS / FAIL / ERROR results, expected vs actual, and one-click assertions from the JSON tree
- AI (free and local through [Ollama](https://ollama.com)): generate editable test cases and analyse a response, with one-click suggested assertions and Markdown export. Secrets are masked before anything reaches the model
- AI collection builder: enter a website, perform the flow once in the browser that opens, and get a reviewable draft with variables and assertions. Every step is traced back to a recorded request; nothing runs or is saved until you approve it. HAR files are supported as an advanced option. Works with classic sites too: form submissions, JSON labelled as HTML and the pages you open are recorded, and a collection run keeps cookies (a cart or login session) from one request to the next, in memory only
- Collections: save requests with their assertions in a local SQLite database, reopen, rename and organise them from the sidebar, with an unsaved-changes guard
- Environments: `{{variables}}` in URL, params, headers, auth and body, resolved on the server; secret values are write-only and masked in responses, errors and logs
- Collection runs: run all saved requests with one click, keep a history of outcomes, download JSON or HTML reports and compare two runs to spot regressions
- Clear error messages for timeouts, DNS/connection failures, too-large responses, blocked targets
- Requests are sent **by the server**, never directly from the browser, and every target is checked against SSRF rules

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 19, TypeScript, Vite, Tailwind CSS |
| Server | Node.js, Express 5, Zod, undici (outbound HTTP), Playwright (flow recording), Ollama (local AI), SQLite via `node:sqlite` |
| Shared | Zod schemas and types used by both sides (the API contract) |
| Tests | Vitest (unit), Supertest (integration), Testing Library + jsdom (components), Playwright (E2E) |
| Quality | ESLint (type-aware), Prettier |

## Requirements

- **Node.js 24 or newer** (`node -v`)
- npm 10 or newer (comes with Node.js)

## Getting started

```bash
git clone <repository-url> api-sentinel
cd api-sentinel
npm install
npm run dev
```

Then open **http://127.0.0.1:5173**. The badge in the top-right corner should show **"Backend online"**.

`npm run dev` starts both processes; press `Ctrl+C` to stop them (on Windows answer `Y` to "Terminate batch job").

| Process | URL |
|---|---|
| Client (Vite dev server) | http://127.0.0.1:5173 |
| Server (Express API) | http://127.0.0.1:3001/api/health |

During development the client calls `/api/...` on its own origin and Vite forwards those requests to the server, so no CORS configuration is needed.

### Always-on local app

`npm run app:install` builds the interface, installs the recording browser and starts API Sentinel at **http://localhost:3000**, also at every Windows sign-in. Then `npm run app:status`, `app:start`, `app:stop`, `app:restart` and `app:uninstall` manage it. Logs are in `data/app.log`.

### Local AI

Install [Ollama](https://ollama.com), then run `ollama pull qwen3:8b`. No account, key or payment is needed and nothing leaves your computer.

### Trying it with the local mock API

The project includes a fake API with predictable endpoints (`/json`, `/echo`, `/delay/:ms`, `/status/:code`, `/redirect/:n`, `/auth/bearer`, …). Private and local addresses are blocked by default, so the mock must be allow-listed first:

1. Create `.env` (see below) and set `SSRF_ALLOWLIST=localhost:4010`.
2. Terminal A: `npm run mock` (listens on http://localhost:4010, `GET /` lists all endpoints).
3. Terminal B: `npm run dev` (restart it after changing `.env`).
4. In the UI, send `GET http://localhost:4010/json`.

Test credentials: Bearer token `test-token`; Basic auth `qa` / `secret`.

### Configuration (optional)

The server works with safe defaults. To change them, copy the template and edit it:

```bash
cp .env.example .env        # Windows (cmd): copy .env.example .env
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Where the API listens |
| `REQUEST_TIMEOUT_DEFAULT_MS` / `REQUEST_TIMEOUT_MAX_MS` | `15000` / `60000` | Outbound request timeout (default / upper limit) |
| `RESPONSE_MAX_BYTES` | `5242880` (5 MB) | Larger responses are rejected with `RESPONSE_TOO_LARGE` |
| `REQUEST_BODY_LIMIT` | `1mb` | Max size of a request sent to our API |
| `MAX_REDIRECTS` | `5` | Redirects followed before `TOO_MANY_REDIRECTS` |
| `SSRF_ALLOWLIST` | empty | Comma-separated exact `host:port` pairs that may be private/local, e.g. `localhost:4010` |
| `DB_PATH` | `data/api-sentinel.db` | Local SQLite file (git-ignored) |
| `AI_MODE` | `auto` | `auto` (use `AI_PROVIDER`), `off`, or `mock` (fixed example answers) |
| `AI_PROVIDER` | `ollama` | `ollama` (free, local) or `anthropic` (paid, needs `ANTHROPIC_API_KEY`; a key alone never activates it) |
| `AI_MODEL` / `AI_BASE_URL` | `qwen3:8b` / Ollama's default | Model and provider address |
| `AI_TIMEOUT_MS` / `AI_RATE_LIMIT_PER_MINUTE` | `280000` / `10` | Limits for AI calls |

Invalid values stop the server at startup with a message naming the variable. Never commit `.env`.

## Scripts

Run from the project root.

| Command | What it does |
|---|---|
| `npm run dev` | Start server and client together (with auto-reload) |
| `npm run dev:server` / `npm run dev:client` | Start only one side |
| `npm run mock` | Start the local mock API on port 4010 |
| `npm run app:install` | Install and start the always-on app (see above) |
| `npm test` | Run all unit, integration and component tests (no internet needed) |
| `npm run test:e2e` | Playwright smoke tests in a real browser (first time: `npx playwright install chromium`) |
| `npm run typecheck` | TypeScript type check for all packages |
| `npm run lint` | ESLint (includes security rules: no `eval`, `new Function`, `dangerouslySetInnerHTML`) |
| `npm run format` / `npm run format:check` | Format code with Prettier / check formatting |
| `npm run build` | Production build of the client into `client/dist` |

Before committing, all of `typecheck`, `lint`, `format:check` and `test` should pass.

`npm run test:e2e` starts its own mock, API and UI servers on ports 4998, 3998 and 5998, so it does not interfere with a running `npm run dev`.

## Project structure

```
client/             React UI (features/request-builder, features/response-viewer, services/apiClient)
server/             Express API (config, routes, controllers, services/request-engine) + tests/
shared/             Zod schemas, types and URL building shared by client and server
tools/mock-target/  Fake API used for manual and automated tests
e2e/                Playwright smoke tests
docs/               Requirements analysis, architecture, test strategy, roadmap
```

## Documentation

- [Requirements analysis](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Test strategy](docs/test-strategy.md)
- [Development roadmap](docs/development-roadmap.md)

## Security notes

This is a local portfolio application. Because the server sends requests to user-supplied URLs, it is protected against SSRF (see [docs/architecture.md §7](docs/architecture.md)):

- private, loopback, link-local and other reserved IPv4/IPv6 ranges are blocked, including the cloud metadata address `169.254.169.254`;
- the check runs on the IP addresses returned by DNS at connect time (defeats DNS rebinding) and again on every redirect;
- credentials are dropped when a redirect changes the origin;
- the server logs only method, host and outcome — never paths, query strings, headers or bodies.

The server binds to `127.0.0.1` by default. Do not expose it publicly without a security review.
