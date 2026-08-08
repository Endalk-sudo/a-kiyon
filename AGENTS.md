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
pnpm run test           # vitest (needs Firebase emulators running)
```

## Architecture

- **SPA on a single Next.js route** — `src/app/page.tsx` is the only page. Client-side routing via Zustand (`useAppStore.currentPage` + page component map). No Next.js route groups, no file-based routing for the UI. The store holds **app state only** (session, current page, locale, mobile-aside open flag, theme) — page data and page-local UI state (filters, modal open/close, loading) live in `useState` inside each page component, keyed by `currentPage` so state resets on navigation. Payment dialog state (record/renew) is also page-local in `members.tsx`.
- **API routes** under `src/app/api/*/route.ts`. Each handler wrapped with `apiHandler` which catches ZodError → 400, `"Unauthorized"` → 401, `"Forbidden"` → 403.
- **Response helpers** (`src/lib/api.ts`): `apiResponse()`, `paginatedResponse()`, `apiError()`, `unauthorizedError()`, `forbiddenError()`.
- **Zod v4** — schemas in `src/lib/schemas.ts`. One schema per mutation. Use `.parse()` to validate.
- **Service layer** (`src/services/*.ts`) — plain async functions, each takes explicit params, calls Firestore via `@/lib/db` helpers, returns plain objects.

## Auth

- **Server:** `getSessionOrThrow(['owner', 'manager', 'reader'], request)` — verifies Firebase ID token from `Authorization: Bearer` header. Throws `"Unauthorized"` / `"Forbidden"`.
- **Client:** Firebase Auth via `src/lib/auth-client.ts`. Token auto-attached to all API calls via `src/lib/api-client.ts`.
- **Roles:** `owner` (full), `manager` (soft-delete/restore members; no permanent delete, no payment void, no storage cleanup), `reader` (view-only). Stored as Firebase custom claims.
- **Phone login (not email):** Firebase SMS auth is not available in Ethiopia, so login is **phone + password** backed by Firebase Auth's email/password. Each phone is mapped to a synthetic email via `src/lib/phone-auth.ts` (`normalizePhone` → `+251XXXXXXXXX`, `phoneToEmail` → `251XXXXXXXXX@a-kiyon.app`, `emailToPhone`, `isSyntheticEmail`). `authClient.signIn.phone` in `auth-client.ts`; legacy email login kept for accounts without a phone.
- **Password resets** are owner-only, in Settings (no self-service forgot-password).
- **One-time migration:** `pnpm exec tsx src/scripts/migrate-phone-login.ts` renames auth emails for users with a phone on record (custom claim or `users` doc); users without a phone keep email login. Emulator on port 9099.

## DB

- **Firestore** (via `firebase-admin`). 5 collections: `members`, `subscriptions`, `payments`, `services`, `users`.
- **Soft delete** on Members via `isDeleted` boolean field.
- **Subscription expiry** is batch-updated on every list/get call. Standalone cron at `src/scripts/cron-expire.ts`.
- **Renewal model** extends `endDate` on the existing subscription doc (no new rows).
- **Firestore helpers** in `src/lib/db.ts`: `getDocById`, `getDocs`, `countDocs`, `createDoc`, `updateDoc`, `deleteDoc`, `batchUpdate`, `batchDelete` (both chunked into 400-write batches — Firestore caps a batch at 500 writes), `aggregateSum` (uses Firestore `AggregateField.sum()`, no client-side fetch-all).
- **Timestamps** are stored as ISO strings (`new Date().toISOString()`) via `createDoc`/`updateDoc`/`batchUpdate` — never `FieldValue.serverTimestamp()`. `FieldValue` is not exported from `db.ts`.

## Key conventions

- `src/lib/api-client.ts` — typed fetch wrapper, auto-attaches Firebase token. Types from `src/lib/api-types.ts`.
- **Client-side env** (`NEXT_PUBLIC_*`) must be read via **static** `process.env.NEXT_PUBLIC_*` property access only. Turbopack inlines only literal-key accesses into the browser bundle; dynamic lookups like `process.env[name]` compile against a client env shim that carries no values, so any guard built on them throws false "missing variable" errors on every page load (see `src/lib/firebase-client.ts` — the missing-vars check derives from the statically-inlined config object).
- **Photo uploads** → `POST /api/upload` with `sharp` (WebP q80 + 200×200 thumbnail). Production stores files in **Vercel Blob** (free tier — Firebase Storage requires the paid Blaze plan) via the `FileStore` adapter in `src/lib/file-storage.ts` (`getFileStore()` selects Blob when `BLOB_READ_WRITE_TOKEN` is set, Firebase Storage emulator otherwise). Paths stay `uploads/<uuid>.webp` + `uploads/thumbs/<uuid>-thumb.webp` (`addRandomSuffix: false`) so purge logic is provider-agnostic.
- **Dates** are stored as ISO strings, displayed in Ethiopian Calendar via `src/lib/ethiopian-calendar.ts`.
- **Storage monitoring** at `/api/storage` — document counts, size estimates, file breakdown (via `FileStore.list()` — sizes returned directly, no metadata round-trips), stale-member detection (`GET ?staleMonths=6` via `findStaleMembers` — non-deleted members whose latest non-voided payment predates the cutoff, or never paid), cleanup actions (`purge-orphaned-files` is **reference-based** — parses `member.photo` URLs via `photoPathFromUrl`, never filename-derived ids; `purge-deleted-member-photos`; `purge-deleted-members` deletes photos first and chunks doc deletion into 400-write batches). Purge functions take a `FileStore` (see tests). UI at `Storage` page (owner only) with Data Hygiene soft-delete list + summary card in Settings. Photos are never deleted automatically. Blob free tier: 1 GB storage / 10 GB transfer per month (hard cap, never bills).
- **Receipt printing** — generated client-side in the payments page (HTML via `window.open()`, hidden iframe fallback when popup blocked).
- **Dialogs** — use the shadcn/ui primitives: `Dialog` (modals incl. login) + `AlertDialog` (destructive confirmations), never hand-rolled overlays. The `DialogContent` container owns `md:max-w-*` and scroll (Radix portals to body, so `sm:max-w-*` on inner divs does nothing); inline `max-w` belongs on `rootClassName` (page shell). Mobile bottom-sheet behavior is part of `DialogContent`. `Button` does not default `type` — inside `<form>` pass `type="submit"`/`type="button"` explicitly. `PhotoLightbox` is the exception (fullscreen capture-phase overlay, not a Dialog).
- **Error boundary** — `page.tsx` wraps `<PageComponent>` in a class-based `ErrorBoundary` to catch render crashes gracefully.
- **Mobile-responsive UI** — data tables use `hidden md:block` (desktop table) + `md:hidden` (card layout) pattern. Icon buttons minimum 36px (`h-9 w-9`) for touch targets. Form grids use responsive column counts (e.g. `grid-cols-1 sm:grid-cols-3`).
- **Payment-validity rule** — validity is provably derived from non-voided payments. Every payment stores `extendedTo` + `previousExtendedTo`; `recordAndExtendPayment` is the single "money in = days added" path (new payments and renewals). Voiding rolls the subscription back to the previous payment's `extendedTo` and flags `hasVoidedPayment`/`voidedPaymentNote`.
- **Subscription status is derived** — only `cancelled` can be written manually (PUT). `active`/`expired` come from payments + time (renew/reactivate via payment; auto-expire batch).

## Commands

| Command | What |
|---------|------|
| `pnpm run dev` | Dev server on port 3000 |
| `pnpm run lint` | ESLint |
| `pnpm run build` | Production build (typecheck + compile) |
| `pnpm run seed` | Seed Firestore + Firebase Auth with demo data (emulator only) |
| `pnpm run create-prod-users` | Create production owner/manager/reader accounts (refuses in emulator mode; passwords from `OWNER_PASSWORD`/`MANAGER_PASSWORD`/`READER_PASSWORD`) |
| `pnpm run cron-expire` | Manual subscription expiry batch update |
| `pnpm run test` | Vitest (run `pnpm run firebase:emulators` first) |
| `pnpm run check-indexes` | Static guard — every composite query (incl. `aggregateSum` + registered runtime shapes) must be covered by `firestore.indexes.json`; exits 1 on missing/duplicate indexes or unregistered runtime queries |
| `pnpm run deploy:firestore` | Deploy Firestore indexes + rules (`firebase deploy --only firestore:indexes,firestore:rules`) |
| `pnpm run verify-indexes` | Diff `firestore.indexes.json` against the live project's composite indexes (reads only; needs prod `FIREBASE_*` env, refuses emulator mode) |
| `pnpm run firebase:emulators` | Start Firebase emulators (Firestore 8080, Auth 9099, Storage 9199, UI 4000) |
| `pnpm run firebase:emulators:export` | Export emulator data to `./firebase-data` |
| `pnpm run firebase:emulators:import` | Start emulators with previous data |
| `npx tsc --noEmit` | TypeScript check only |

## Deployment

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) on push to `dev`/`main` + PRs — pnpm install, `tsc --noEmit`, lint, `pnpm run check-indexes`, build, then `firebase emulators:exec "pnpm run test"` (fresh emulators, no secrets needed).
- Self-hosted: Caddy reverse proxy on `:81` → `localhost:3000` (see `Caddyfile`).
- Required env: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_*` vars. Set `FIREBASE_EMULATOR=true` + `NEXT_PUBLIC_FIREBASE_EMULATOR=true` for local dev. Production photo storage needs `BLOB_READ_WRITE_TOKEN` (Vercel Blob).
- **Composite indexes**: queries in code must be covered by `firestore.indexes.json`. The emulator auto-creates indexes, so missing ones only fail in production — `pnpm run check-indexes` (also in CI) is the gate; `aggregateSum` calls need the aggregated field in the index, and runtime-built `where` filters (`listPayments`, `listSubscriptions`, `listMembers`, services GET) are pinned by the `RUNTIME_QUERIES` registry inside `src/scripts/check-indexes.ts` — keep it in sync when those filters change. Deploy workflow: run `check-indexes`, then `pnpm run deploy:firestore`, then `pnpm run verify-indexes` (wait for CREATING → READY, re-run without deploying). Storage rules are not deployed — the project intentionally has no Firebase Storage (Vercel Blob instead).
