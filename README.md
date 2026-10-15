# D-Friend frontend

Next.js (App Router), TypeScript strict, pnpm. The contract is `../documents/immigration/spec.md`. Build the UI from the design canvas linked in `plan-frontend.md`.

## Run

```
cp .env.example .env.local   # BACKEND_URL, default http://127.0.0.1:8000
pnpm install                 # also copies JSXGraph into public/vendor/
pnpm dev                     # http://localhost:3000
```

Start the backend first (see `../backend/README.md`). Without it, `/api/*` answers 500.

## Check

```
pnpm test        # Vitest, unit tests in tests/unit
pnpm lint
pnpm typecheck
pnpm build
```

## Notes

- `/api/*` is rewritten to `BACKEND_URL`, so the browser only talks to this origin. Next bakes the destination in at build time: after you change `BACKEND_URL`, run `pnpm build` again. `pnpm start` ignores a new value.
- `AGENTS.md` is written by `next dev`. Keep it committed.
