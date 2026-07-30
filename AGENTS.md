# AGENTS.md — A-kiyon FCMS

## Quick start

```sh
cp .env.example .env   # fill Firebase credentials + emulator flag
pnpm install
pnpm run seed
pnpm run dev            # http://localhost:3000
# In another terminal: pnpm run firebase:emulators
```

## Verify commands (in order)

```sh
npx tsc --noEmit       # typecheck (separate from build)
pnpm run lint           # ESLint
pnpm run build          # production build
```

## Architecture

- **SPA on a single Next.js route** — `src/app/page.tsx` is the only page. Client-side routing via Zustand (`useAppStore.currentPage` + page component map). No Next.js route groups, no file-based routing for the UI.
- **API routes** under `src/app/api/*/route.ts`. Each handler wrapped with `apiHandler` which catches ZodError → 400, `"Unauthorized"` → 401, `"Forbidden"` → 403.
- **Response helpers** (`src/lib/api.ts`): `apiResponse()`, `paginatedResponse()`, `apiError()`, `unauthorizedError()`, `forbiddenError()`.
- **Zod v4** — schemas in `src/lib/schemas.ts`. One schema per mutation. Use `.parse()` to validate.
- **Service layer** (`src/services/*.ts`) — plain async functions, each takes explicit params, calls Firestore via `@/lib/db` helpers, returns plain objects.

## Auth

- **Server:** `getSessionOrThrow(['owner', 'manager', 'reader'], request)` — verifies Firebase ID token from `Authorization: Bearer` header. Throws `"Unauthorized"` / `"Forbidden"`.
- **Client:** Firebase Auth via `src/lib/auth-client.ts`. Token auto-attached to all API calls via `src/lib/api-client.ts`.
- **Roles:** `owner` (full), `manager` (no delete/void), `reader` (view-only). Stored as Firebase custom claims.
- **Firebase Auth** with email/password. Emulator on port 9099.

## DB

- **Firestore** (via `firebase-admin`). 6 collections: `members`, `subscriptions`, `payments`, `services`, `users`, `auditLogs`.
- **Soft delete** on Members via `isDeleted` boolean field.
- **Subscription expiry** is batch-updated on every list/get call. Standalone cron at `src/scripts/cron-expire.ts`.
- **Renewal model** extends `endDate` on the existing subscription doc (no new rows).
- **Firestore helpers** in `src/lib/db.ts`: `getDocById`, `getDocs`, `countDocs`, `createDoc`, `updateDoc`, `deleteDoc`, `batchUpdate`, `aggregateSum` (uses Firestore `AggregateField.sum()`, no client-side fetch-all).
- **Timestamps** are stored as ISO strings (`new Date().toISOString()`) via `createDoc`/`updateDoc`/`batchUpdate` — never `FieldValue.serverTimestamp()`. `FieldValue` is not exported from `db.ts`.

## Key conventions

- `src/lib/api-client.ts` — typed fetch wrapper, auto-attaches Firebase token. Types from `src/lib/api-types.ts`.
- **Photo uploads** → `POST /api/upload` with `sharp` (WebP q80 + 200×200 thumbnail). Uploads to Firebase Storage bucket.
- **Audit logs** (`src/lib/audit.ts`) — silent on failure; never crashes the main operation.
- **Dates** are stored as ISO strings, displayed in Ethiopian Calendar via `src/lib/ethiopian-calendar.ts`.
- **Storage monitoring** at `/api/storage` — document counts, size estimates, file breakdown, cleanup actions (orphan purge, old audit log purge, deleted member purge). UI at `Storage` page (owner only) + summary card in Settings.
- **Receipt printing** — `POST /api/payments/[id]/print` generates HTML receipt. Client uses `window.open()` with hidden iframe fallback when popup blocked.
- **Error boundary** — `page.tsx` wraps `<PageComponent>` in a class-based `ErrorBoundary` to catch render crashes gracefully.
- **Mobile-responsive UI** — data tables use `hidden md:block` (desktop table) + `md:hidden` (card layout) pattern. Icon buttons minimum 36px (`h-9 w-9`) for touch targets. Form grids use responsive column counts (e.g. `grid-cols-1 sm:grid-cols-3`).
- **No tests exist** yet.

## Commands

| Command | What |
|---------|------|
| `pnpm run dev` | Dev server on port 3000 |
| `pnpm run lint` | ESLint |
| `pnpm run build` | Production build (typecheck + compile) |
| `pnpm run seed` | Seed Firestore + Firebase Auth with demo data |
| `pnpm run cron-expire` | Manual subscription expiry batch update |
| `pnpm run firebase:emulators` | Start Firebase emulators (Firestore 8080, Auth 9099, Storage 9199, UI 4000) |
| `pnpm run firebase:emulators:export` | Export emulator data to `./firebase-data` |
| `pnpm run firebase:emulators:import` | Start emulators with previous data |
| `npx tsc --noEmit` | TypeScript check only |

## Deployment

- Self-hosted: Caddy reverse proxy on `:81` → `localhost:3000` (see `Caddyfile`).
- Required env: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_*` vars. Set `FIREBASE_EMULATOR=true` + `NEXT_PUBLIC_FIREBASE_EMULATOR=true` for local dev.
