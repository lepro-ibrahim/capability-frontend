# Capability frontend — Vercel

Use the Next.js framework preset, Node.js 22.x, and the existing pinned pnpm version. Install with `pnpm install --frozen-lockfile`; build with `pnpm build`.

Set these project variables in Vercel before building:

| Variable | Production value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api` |
| `API_URL` | `https://capability-api-ibrahimabdou771-7900.vercel.app` |
| `TZ` | `Europe/Paris` |

`/api/:path*` is proxied to the backend. Frontend routes such as `/prospects` stay in Next.js. Production builds refuse to proceed without `API_URL`. Preview environments should point to a backend preview configured against a separate Neon branch.

Next.js was patched within the 15.5 series and React within the 19.1 series. ESLint dependencies are explicit, and only `sharp` and `unrs-resolver` installation scripts are enabled.

## Local checks

- Frozen-lockfile installation: passed.
- Typecheck: passed.
- Production build: passed with `/api` and a local backend URL supplied for build validation. This verifies compilation; it does not verify the public backend connection.
- Full lint: 153 pre-existing errors and 43 warnings, primarily legacy `any` types and React lint rules. No application TSX files were changed.

## Live acceptance checks still required

1. Load `/login` on the public URL and authenticate as the requested administrator.
2. Confirm dashboard, prospects, budgets, users, and integrations pages render without failed API requests.
3. Confirm an unauthenticated API request receives 401, and a disabled account cannot use a previously issued token.
4. Verify a real create/read/update action against Neon using explicitly marked test data.
5. Download a PDF and inspect the runtime logs for errors.

The frontend is prepared but has not yet been deployed. Vercel workspace access must be restored to provision environment variables and complete live acceptance checks.
