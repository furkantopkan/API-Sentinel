## What and why

<!-- What changes, and the problem it solves. -->

## How it was tested

- [ ] Manual test (scenario ids from `docs/test-strategy.md`, e.g. `API-007`):
- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check`
- [ ] `npm test` and `npm run test:e2e`
- [ ] `npm run traceability`: a new manual scenario has an automated test, or is listed as manual-only with a reason

## Security

- [ ] No secret in code, logs, error messages or test fixtures
- [ ] Every request to a user-given address still goes through the SSRF guard
