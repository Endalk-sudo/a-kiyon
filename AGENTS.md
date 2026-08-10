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

- **SPA on a single Next.js route** — `src/app/page.tsx` is the only page. Client-side routing via Zustand (`useAppStore.currentPage` + page component map). No Next.js route groups, no file-based routing for the UI. The store holds **app state only** (session, current page, locale, mobile-aside open flag, theme) — page data and page-local UI state (filters, modal open/close, loading) live in `useState` inside each page component, keyed by `currentPage` so state resets on navigation. Payment dialog state (record/renew) is also page-local in `members.tsx`. **Public (logged-out) screens** are switched by `publicPage: 'landing' | 'login'` — not persisted, so a fresh visit always lands on the landing page; signing out (`resetAppState`) resets it too. Login is its own page (`src/components/pages/login-page.tsx`), not a modal.
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
- **Service deletion is permanent** (owner only) — the UI warns with a live subscription-usage count before confirming; historical subscriptions/payments keep their `priceSnapshot` and reads fall back to blank service names.
- **Subscription expiry** is batch-updated on every list/get call. Standalone cron at `src/scripts/cron-expire.ts`.
- **Renewal model** extends `endDate` on the existing subscription doc (no new rows).
- **Firestore helpers** in `src/lib/db.ts`: `getDocById`, `getDocs`, `countDocs`, `createDoc`, `updateDoc`, `deleteDoc`, `batchUpdate`, `batchDelete` (both chunked into 400-write batches — Firestore caps a batch at 500 writes), `aggregateSum` (uses Firestore `AggregateField.sum()`, no client-side fetch-all).
- **Timestamps** are stored as ISO strings (`new Date().toISOString()`) via `createDoc`/`updateDoc`/`batchUpdate` — never `FieldValue.serverTimestamp()`. `FieldValue` is not exported from `db.ts`.

## Key conventions

- `src/lib/api-client.ts` — typed fetch wrapper, auto-attaches Firebase token. Types from `src/lib/api-types.ts`.
- **Client-side env** (`NEXT_PUBLIC_*`) must be read via **static** `process.env.NEXT_PUBLIC_*` property access only. Turbopack inlines only literal-key accesses into the browser bundle; dynamic lookups like `process.env[name]` compile against a client env shim that carries no values, so any guard built on them throws false "missing variable" errors on every page load (see `src/lib/firebase-client.ts` — the missing-vars check derives from the statically-inlined config object).
- **Photo uploads** → `POST /api/upload` with `sharp` (WebP q80 + 200×200 thumbnail). **Backblaze B2 is the only storage backend** (S3-compatible, 10 GB free, ~$6/TB/mo — Firebase Storage requires the paid Blaze plan and is not used at all: no Firebase Storage emulator, no client storage SDK). The bucket stays **private** — `b2FileStore.save()` returns the canonical relative path (`uploads/<uuid>.webp`), which is what member docs store; render paths sign short-lived (1 h) presigned URLs via `FileStore.getUrl()` (`@aws-sdk/s3-request-presigner`). `getFileStore()` in `src/lib/file-storage.ts` builds `b2FileStore` from `B2_BUCKET`/`B2_REGION`/`B2_APPLICATION_KEY_ID`/`B2_APPLICATION_KEY` (`B2_REGION` accepts the bare region *or* the full `s3.…backblazeb2.com` URL) and throws `Storage not configured` (a SAFE 500 message, missing vars logged server-side) when any is absent — also required for local uploads; `getFileStoreSafe()` returns null instead for read paths. `resolveMemberPhoto` in `src/services/storage.service.ts` signs `photo`/`photoThumb` (and returns canonical `photoPath`/`photoThumbPath` for edit round-trips) in member/payment/subscription responses; the upload route returns `previewUrl`/`previewThumbnailUrl` for the modal while `url`/`thumbnailUrl` stay canonical. Periodic console setup: application key restricted to the bucket, lifecycle rule **"Keep only the last version"** (buckets are always versioned, so purge `delete` ops would otherwise leave billed hidden versions). Paths stay `uploads/<uuid>.webp` + `uploads/thumbs/<uuid>-thumb.webp` so purge logic is provider-agnostic. Optional `B2_S3_ENDPOINT` override (custom endpoint). The CSP `img-src` in `next.config.ts` allows `https://*.backblazeb2.com` — if you use a custom domain later, add it there too.
- **Dates** are stored as ISO strings, displayed in Ethiopian Calendar via `src/lib/ethiopian-calendar.ts`.
- **Storage monitoring** at `/api/storage` — document counts, size estimates, file breakdown (via `FileStore.list()` — sizes returned directly, no metadata round-trips), stale-member detection (`GET ?staleMonths=6` via `findStaleMembers` — non-deleted members whose latest non-voided payment predates the cutoff, or never paid), cleanup actions (`purge-orphaned-files` is **reference-based** — parses `member.photo` URLs via `photoPathFromUrl`, never filename-derived ids; `purge-deleted-member-photos`; `purge-deleted-members` deletes photos first and chunks doc deletion into 400-write batches). Purge functions take a `FileStore` (see tests). UI at `Storage` page (owner only) with Data Hygiene soft-delete list + summary card in Settings. Photos are never deleted automatically. B2 free tier: 10 GB storage / free egress up to 3x stored (overage hard-stops, never bills).
- **Receipt printing** — generated client-side in the payments page (HTML via `window.open()`, hidden iframe fallback when popup blocked).
- **Dialogs** — use the shadcn/ui primitives: `Dialog` (modals) + `AlertDialog` (destructive confirmations), never hand-rolled overlays. The `DialogContent` container owns `md:max-w-*` and scroll (Radix portals to body, so `sm:max-w-*` on inner divs does nothing); inline `max-w` belongs on `rootClassName` (page shell). Mobile bottom-sheet behavior is part of `DialogContent`. `Button` does not default `type` — inside `<form>` pass `type="submit"`/`type="button"` explicitly. `PhotoLightbox` is the exception (fullscreen capture-phase overlay, not a Dialog).
- **Error boundary** — `page.tsx` wraps `<PageComponent>` in a class-based `ErrorBoundary` to catch render crashes gracefully.
- **Mobile-responsive UI** — data tables use `hidden md:block` (desktop table) + `md:hidden` (card layout) pattern. Icon buttons minimum 36px (`h-9 w-9`) for touch targets. Form grids use responsive column counts (e.g. `grid-cols-1 sm:grid-cols-3`).
- **Payment-validity rule** — validity is provably derived from non-voided payments. Every payment stores `extendedTo` + `previousExtendedTo`; `recordAndExtendPayment` is the single "money in = days added" path (new payments and renewals). Voiding rolls the subscription back to the previous payment's `extendedTo` and flags `hasVoidedPayment`/`voidedPaymentNote`.
- **Money is INTEGER Birr cents** (×100) end to end — `createServiceSchema.price` and `createPaymentSchema.amount` accept Birr and `.transform()` to cents at the API boundary (`birrAmount` in `schemas.ts`); the services form sends Birr — the transform happens only at the API boundary; `formatCurrency` divides by 100 for display; CSV exports print decimal Birr (`(amount / 100).toFixed(2)`). Never store float Birr — exact equality on charges (amount === service.price) and totals depend on integers.
- **Payment idempotency** — money-in requests (`POST /api/payments`, `POST /api/subscriptions/[id]/renew`) accept an optional client-generated `idempotencyKey` (the renew dialogs generate one per open via `crypto.randomUUID()`); the lock doc in `payment-locks/<key>` is created in the SAME transaction as the payment, so a double-click/retry returns the original payment (`duplicate: true`) instead of charging twice. Voiding deletes the lock, freeing the key for a genuine new charge. The payment doc stores its `idempotencyKey`.
- **Subscription status is derived** — only `cancelled` can be written manually (PUT). `active`/`expired` come from payments + time (renew/reactivate via payment). Reads must surface `deriveSubscriptionStatus()` (`src/lib/member-status.ts`) instead of trusting the stored field: the auto-expire batch (debounced 60 s, capped 500/tick, re-verifies each doc via `db.getAll` right before commit, never throws to the caller) is only a reconciliation cache, so a stale write can never display a contradiction or lock out a paid member.

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
| `pnpm run firebase:emulators` | Start Firebase emulators (Firestore 8080, Auth 9099, UI 4000) |
| `pnpm run firebase:emulators:export` | Export emulator data to `./firebase-data` |
| `pnpm run firebase:emulators:import` | Start emulators with previous data |
| `npx tsc --noEmit` | TypeScript check only |

## Deployment

- **CI**: GitHub Actions (`.github/workflows/ci.yml`) on push to `dev`/`main` + PRs — pnpm install, `tsc --noEmit`, lint, `pnpm run check-indexes`, build, then `firebase emulators:exec "pnpm run test"` (fresh emulators, no secrets needed).
- Self-hosted: Caddy reverse proxy on `:81` → `localhost:3000` (see `Caddyfile`).
- Required env: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_*` vars. Set `FIREBASE_EMULATOR=true` + `NEXT_PUBLIC_FIREBASE_EMULATOR=true` for local dev. Photo storage requires the `B2_*` vars (Backblaze B2) — in local dev too.
- **Composite indexes**: queries in code must be covered by `firestore.indexes.json`. The emulator auto-creates indexes, so missing ones only fail in production — `pnpm run check-indexes` (also in CI) is the gate; `aggregateSum` calls need the aggregated field in the index, and runtime-built `where` filters (`listPayments`, `listSubscriptions`, `listMembers`, services GET) are pinned by the `RUNTIME_QUERIES` registry inside `src/scripts/check-indexes.ts` — keep it in sync when those filters change. Deploy workflow: run `check-indexes`, then `pnpm run deploy:firestore`, then `pnpm run verify-indexes` (wait for CREATING → READY, re-run without deploying). Storage rules are not deployed — the project intentionally has no Firebase Storage at all (Backblaze B2 instead).
