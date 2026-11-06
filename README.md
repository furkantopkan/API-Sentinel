# API Sentinel

A web-based REST API testing tool for QA engineers: build HTTP requests, inspect responses, and (in later versions) run assertions and generate test cases with AI.

> **Status:** Phase 1 complete — project infrastructure, backend health check and the Request Builder UI. Sending requests arrives in Phase 2. See [docs/development-roadmap.md](docs/development-roadmap.md).

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 19, TypeScript, Vite, Tailwind CSS |
| Server | Node.js, Express 5, Zod |
| Shared | Zod schemas and types used by both sides (the API contract) |
| Tests | Vitest (unit), Supertest (integration) |
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

### Configuration (optional)

The server works with safe defaults. To change them, copy the template and edit it:

```bash
cp .env.example .env        # Windows (cmd): copy .env.example .env
```

Invalid values stop the server at startup with a message naming the variable. Never commit `.env`.

## Scripts

Run from the project root.

| Command | What it does |
|---|---|
| `npm run dev` | Start server and client together (with auto-reload) |
| `npm run dev:server` / `npm run dev:client` | Start only one side |
| `npm test` | Run all unit and integration tests |
| `npm run typecheck` | TypeScript type check for all packages |
| `npm run lint` | ESLint (includes security rules: no `eval`, `new Function`, `dangerouslySetInnerHTML`) |
| `npm run format` / `npm run format:check` | Format code with Prettier / check formatting |
| `npm run build` | Production build of the client into `client/dist` |

Before committing, all of `typecheck`, `lint`, `format:check` and `test` should pass.

## Project structure

```
client/   React UI (features/request-builder, features/response-viewer, services/apiClient)
server/   Express API (config, routes, controllers, middleware, errors) + tests/
shared/   Zod schemas and types shared by client and server
docs/     Requirements analysis, architecture, test strategy, roadmap
```

## Documentation

- [Requirements analysis](docs/requirements.md)
- [Architecture](docs/architecture.md)
- [Test strategy](docs/test-strategy.md)
- [Development roadmap](docs/development-roadmap.md)

## Security notes

This is a local portfolio application. Because the server will send requests to user-supplied URLs (Phase 2), it is protected against SSRF; see [docs/architecture.md §7](docs/architecture.md). The server binds to `127.0.0.1` by default. Do not expose it publicly without a security review.
