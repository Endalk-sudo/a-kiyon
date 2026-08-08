# PDR — A-ki Fitness Center Management System (A-kiyon FCMS)

| | |
|---|---|
| Product | A-kiyon FCMS (A-ki Fitness Center Management System) |
| Status | Shipped (v1) — reflects the current implementation |
| Platform | Web (Next.js 16 SPA, self-hosted) |
| Backend | Firebase (Auth + Firestore), Backblaze B2 (photos) |
| Languages | UI: English + Amharic; dates: Ethiopian + Gregorian |

---

## 1. Executive summary

A-kiyon FCMS is a single-page web application that manages a fitness center's
members, subscriptions, payments, and revenue. It replaces paper/ledger
record-keeping with:

- member registration (photo, contact, health metrics) and soft-delete lifecycle,
- service catalog with priced subscriptions whose **validity is provably derived
  from non-voided payments**,
- payment recording with receipt printing and a **void operation that rolls the
  subscription back** to its mathematically correct state,
- revenue dashboards, expiring-member alerts, and CSV exports,
- Amharic/English UI and **Ethiopian calendar** dates throughout,
- role-based access (owner / manager / reader), and
- zero-cost-tier hosting (Firestore 1 GB free, Backblaze B2 10 GB free, egress ≤ 3× stored).

---

## 2. Problem statement

Gym owner-operators (and their staff) in Ethiopia typically track members and
payments on paper or spreadsheets, which causes:

1. **Missed renewals / expirations** — memberships expire silently; revenue leaks.
2. **Ambiguous payment state** — no auditable record of what a member paid for,
   voiding a payment by accident or by refund corrupts the subscription period.
3. **Receipt bookkeeping** — receipts are hand-written or absent, making disputes
   unresolvable.
4. **Date/calendar friction** — the work happens in the Ethiopian calendar but
   tooling assumes Gregorian.
5. **No access control** — a single shared spreadsheet/phone means anyone can
   (accidentally or not) alter billing data.

---

## 3. Goals and success metrics

**Product goals**
1. Membership validity that is **provably derived from non-voided payments**
   (no hand-edited expiry, no drift between payments and subscription state).
2. Every payment recordable in under 10 seconds, with a printable receipt.
3. Every expiry/renewal decision visible to the owner (dashboard alerts,
   storage-monitor data hygiene).
4. Full bilingual (Amharic) + Ethiopian-calendar support at zero cost to the
   operator.
5. All destructive actions gated (excluding payment voids, permanent deletes,
   and storage cleanup are owner-only).

**Success metrics (targets)**
| Metric | Target |
|---|---|
| Time to record a payment + receipt | ≤ 10 s |
| Void operations leaving consistent state | 100% (enforced by invariant) |
| Member lookup (search) | ≤ 500 ms on 10k members |
| Storage page load accountability | under free tiers (1 GB DB / 10 GB B2) |
| Expiration alerts surfaced to owner | 100% of expiring subscriptions ≤ 7 days |

---

## 4. Personas

| Persona | Role | Needs |
|---|---|---|
| **Owner** | `owner` | Full control: CRUD, money-in paths, void, purge data, users, storage, receipts, role & password management. |
| **Manager** | `manager` | Day-to-day ops: members (incl. soft-delete/restore), subscriptions, payments, receipts. No void, no permanent delete, no storage cleanup. |
| **Reader / Front desk** | `reader` | View-only access (dashboard, members, payments, reports). |
| **Member** | data subject | Not a system user; owns a profile (photo, health, phone) and receives receipts. |

---

## 5. Scope

### In scope (v1, shipped)

- Public screens: **landing** page, **phone+password login** page.
- Authenticated surface (SPA, 8 pages):
  `Dashboard`, `Members`, `Subscriptions`, `Payments`, `Services`,
  `Reports`, `Storage`, `Settings`.
- Member lifecycle incl. photo capture (camera/gallery) → WebP + thumbnail.
- Subscription & payment lifecycle: create, renew (extend), expire, void with
  rollback, receipts.
- Services catalog (name, price, duration).
- User management (owner-only), deactivation, password reset (owner-only).
- Bilingual UI (en/am), Ethiopian calendar.
- Storage monitoring & data-hygiene purge actions.
- CSV export (members, payments).

### Out of scope (explicitly NOT in v1)

- Member self-service portal / phone app.
- SMS/email notifications or reminders.
- Multi-branch / franchise support; POS or inventory.
- Online payment gateway integration.
- Any upload path not going to Backblaze B2 (no Firebase Storage at all).

---

## 6. Functional requirements

### 6.1 Authentication & roles

| ID | Requirement |
|---|---|
| FR-A1 | Login is **phone + password** (Ethiopian environment has no SMS-based Firebase auth). |
| FR-A2 | Each phone is mapped to a synthetic email `251XXXXXXXXX@a-kiyon.app` (see `normalizePhone`, `phoneToEmail`, `emailToPhone`, `isSyntheticEmail`); legacy email login kept for accounts without a phone. |
| FR-A3 | A token verifies server-side on every API call (`Authorization: Bearer`); role from Firebase custom claims. |
| FR-A4 | Roles: `owner` / `manager` / `reader`; `getSessionOrThrow(roles, req)` rejects `Unauthorized` (401) / `Forbidden` (403) uniformly. |
| FR-A5 | No self-service forgot-password — resets are owner-only, in Settings. |
| FR-A6 | Signing out resets the whole app state; a fresh visit always lands on the landing page. |

### 6.2 Members

| FR | Requirement |
|---|---|
| FR-M1 | Create/update/delete (soft-delete; `isDeleted` flag + `deletedAt`; restore; bulk soft-delete). |
| FR-M2 | Profile fields: persona, phone (unique), photo, photoThumb, address, weight/height, bloodType, sex, neck/waist/hip (→ bodyFat via Navy formula), emergencyContact, notes. |
| FR-M3 | Photo: camera capture (with 640×640 square canvas) or file input; both hit `POST /api/upload`. |
| FR-M4 | Upload pipeline (`sharp`): JPEG/PNG/WebP ≤ 5 MB, dimension guard ≤ 24MP (decompression-bomb), WebP q80 output + 200×200 cover thumbnail. |
| FR-M5 | Storage: **Backblaze B2, private bucket**, canonical paths `uploads/<uuid>.webp` + `uploads/thumbs/<uuid>-thumb.webp`; client never sees a public URL — it stores canonical paths; rendering uses **presigned URLs (1 h TTL)** generated server-side. |
| FR-M6 | `POST /api/upload` returns `{ url, thumbnailUrl }` (canonical) plus `{ previewUrl, previewThumbnailUrl }` (signed) for the UI modal. |
| FR-M7 | List behavior: paginated (20/page), search (name/phone), status filter, `showDeleted` toggle. |
| FR-M8 | Detail view: subscription + payment history grouped per subscription. |

### 6.3 Subscriptions

| FR | Requirement |
|---|---|
| FR-S1 | Create from a services catalog entry with a duration; `startDate`/`endDate` ISO strings. |
| FR-S2 | **Renewal extends `endDate` on the SAME doc** — no new rows (renewal model). |
| FR-S3 | Status is **derived**: `active`, `expiring_soon` (ends ≤ 7 days), `expired`, `no_subscription`; only `cancelled` is writable by hand (PUT). |
| FR-S4 | Expiry is batch-maintained on every list/get (debounced 60 s) plus standalone cron `pnpm run cron-expire`. |
| FR-S5 | A subscription's `endDate` is authoritative but computed **from the payment chain** (see 6.4). |

### 6.4 Payments (core invariant)

| FR | Requirement |
|---|---|
| FR-P1 | Every payment stores `extendedTo` + `previousExtendedTo`. |
| FR-P2 | `recordAndExtendPayment` is the **single** "money in = days added" path for new payments and renewals. |
| FR-P3 | **Validity invariant:** a member's subscription validity is provably derived from non-voided payments; renew/reactivate happen only via payment. |
| FR-P4 | Methods: `cash`, `bank_transfer`, `mobile_money`; receipt numbers generated per payment. |
| FR-P5 | **Voiding** rolls the subscription back to the previous payment's `extendedTo` and marks `hasVoidedPayment` / `voidedPaymentNote` (no silent rewind). |
| FR-P6 | Receipts are printed client-side (HTML via `window.open`, hidden-iframe fallback when popups are blocked). |
| FR-P7 | Payment pages filter by member/method/date; dashboard shows recent payments & monthly revenue. |

### 6.5 Services

| FR | Requirement |
|---|---|
| FR-SV1 | Service catalog CRUD: name (+ Amharic), price (priceSnapshot on subscriptions), duration (days). |
| FR-SV2 | Deleting a service does not affect existing subscriptions (snapshot pricing). |

### 6.6 Dashboard

| FR | Requirement |
|---|---|
| FR-D1 | KPIs: total members, active, expired, expiring-soon, monthly revenue. |
| FR-D2 | Monthly revenue chart (Recharts) from payments, plus expiring-soon member alert list. |

### 6.7 Reports & exports

| FR | Requirement |
|---|---|
| FR-R1 | CSV export of members & payments (server-side; text/csv). |
| FR-R2 | Revenue trends & monthly aggregates (server-computed). |

### 6.8 Storage page & data hygiene (owner only)

| FR | Requirement |
|---|---|
| FR-ST1 | `GET /api/storage`: estimates Firestore collection counts + sizes, B2 file list + breakdown by prefix, stale-member detection (`?staleMonths=6`: non-deleted member with last non-voided payment before cutoff). |
| FR-ST2 | Actions (DELETE /api/storage?action=…): `purge-orphaned-files` (reference-based: parses `member.photo` URLs via `photoPathFromUrl`, never a filename-derived id), `purge-deleted-member-photos`, `purge-deleted-members` (photos first, then chunked doc deletion ≤ 400 writes/batch). |
| FR-ST3 | Settings surface a summary card (owner-only). |
| FR-ST4 | B2 bucket: private, lifecycle rule **“Keep only the last version”** (mandatory — buckets are always versioned; else purge deletes hide billed versions). |

### 6.9 Users & Settings (owner only)

| FR | Requirement |
|---|---|
| FR-U1 | Create/update users (owner/manager/reader) — owner only. |
| FR-U2 | Deactivate (protected: cannot self-deactivate, cannot deactivate the last active owner). |
| FR-U3 | Password reset (owner only; see FR-A5). |
| FR-U4 | Theme toggle (light/dark/system). Locale toggle (en/am). |

### 6.10 UI/UX

| FR | Requirement |
|---|---|
| FR-UX1 | Single page app; client routing via Zustand `currentPage`; data always refreshed on navigation; page-local state keyed to page (resets on navigation). |
| FR-UX2 | shadcn/ui primitives for all dialogs; `AlertDialog` for destructive confirmations; Radix portals own max-width/scroll (`DialogContent`). |
| FR-UX3 | Mobile: desktop tables + `hidden md:block` / `md:hidden` card lists; icon buttons ≥ 36px hit areas. |
| FR-UX4 | Ethiopian calendar date input/display (Gregorian ↔ ET conversion). |
| FR-UX5 | `PhotoLightbox` for member photo preview (fullscreen capture-phase overlay). |
| FR-UX6 | Error boundary around the page component (no white-screens). |

---

## 7. Non-functional requirements

| Category | Requirement |
|---|---|
| Security | All data access is a session-guarded server API; IDs never in client URLs; documents sent with Firebase custom claims; private B2 bucket with signed URLs. |
| Security | CSP: `img-src` restricted to `'self' data: blob: *.backblazeb2.com`; navigation restricted; no remote script origins. |
| Integrity | ISO-8601 string timestamps everywhere (`createdAt`/`updatedAt`/`deletedAt`); no `serverTimestamp()`; batch writes chunked 400 ops. |
| Integrity | Soft-delete pattern; purge only from Storage page (owner). |
| Reliability | Missing env config fails fast with a clear SAFE message (e.g. `Storage not configured`), never a masked error. |
| Performance | Single-route SPA; Firestore queries paginate; subscription statuses batch-updated outside the hot path. |
| Cost | Works inside free tiers: Firestore free tier (1 GB estimated) + B2 10 GB + egress ≤ 3× storage. |
| Accessibility | Semantic controls, keyboard-accessible dialogs (Radix), high-contrast color palette. |

---

## 8. Data model

Five collections in Firestore (no subcollections):

```mermaid
erDiagram
    USERS ||--o{ PAYMENTS : "recordedBy (implicit)"
    MEMBERS ||--o{ SUBSCRIPTIONS : "memberId"
    MEMBERS ||--o{ PAYMENTS : "memberId (snapshot)"
    SERVICES ||--o{ SUBSCRIPTIONS : "serviceId"
    SUBSCRIPTIONS ||--o{ PAYMENTS : "subscriptionId"

    MEMBERS {
      string id PK
      string firstName
      string lastName
      string phone
      string photo "canonical: uploads/<uuid>.webp"
      string photoThumb
      number weight, height, neck, waist, hip
      string bloodType
      string sex
      number bodyFatPercent
      string address
      string notes
      boolean isDeleted
      string deletedAt
      dateTime createdAt
    }
    SUBSCRIPTIONS {
      string id PK
      string memberId FK
      string serviceId FK
      string startDate ISO
      string endDate ISO
      string status
      number priceSnapshot
      boolean hasVoidedPayment
      string notes
    }
    PAYMENTS {
      string id PK
      string subscriptionId FK
      string memberId FK
      number amount
      string paymentDate ISO
      string method
      string receiptNumber
      boolean isVoided
      string voidedAt
      string voidedBy
      string previousExtendedTo
      string extendedTo
      string notes
    }
    SERVICES {
      string id PK
      string name
      string nameAm
      number price
      number durationDays
    }
    USERS {
      string id PK
      string name
      string email
      string phone
      string role
      boolean active
    }
```

**Invariants**
- `PAYMENTS.isVoided` + chain `previousExtendedTo`/`extendedTo` → `SUBSCRIPTIONS.endDate`,
  re-derived by `computeMemberStatus`; nothing else writes status except `cancelled`.
- A member's latest non-voided payment's `extendedTo` is the subscription's effective end.
- All writes go through `createDoc`/`updateDoc`/`batchUpdate` helpers with ISO timestamps.

---

## 9. Integrations

| Service | Use | Credentials |
|---|---|---|
| Firebase Auth (email/password) | Phone→email synthetic accounts; custom claims (roles) | FIREBASE_* + NEXT_PUBLIC_FIREBASE_* |
| Firebase Firestore | 5 collections, composite indexes (see `firestore.indexes.json`) | admin SDK (prod) / emulator |
| Backblaze B2 | Photos, S3-compatible API via `@aws-sdk/client-s3` + `s3-request-presigner`, forcePathStyle | B2_BUCKET_URN, B2_REGION, B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY (keys restricted to bucket) |
| Backblaze B2 | Private bucket; presigned URLs 1h; no public read; lifecycle “keep last version” mandatory | — |
| sharp | WebP/thumbnail processing (server-side) | npm |
| Caddy | Reverse proxy `:81` → `localhost:3000` (self-hosted) | — |

---

## 10. Deployment, environments, QA

| Concern | Description |
|---|---|
| Dev environment | `pnpm run dev` + `pnpm run firebase:emulators` (Firestore 8080, Auth 9099, UI 4000). |
| Env | `FIREBASE_EMULATOR=true` + `NEXT_PUBLIC_FIREBASE_EMULATOR=true` locally; real B2 vars needed for photo upload in dev too (B2 is the only backend). |
| Verification | `npx tsc --noEmit` → `pnpm run lint` → `pnpm run build` → `pnpm run check-indexes` → `pnpm run test` (vitest, needs emulators) |
| Index governance | `check-indexes` guards every composite query (incl. runtime-built `where` filters in `RUNTIME_QUERIES`); `deploy:firestore`, `verify-indexes`. |
| CI | GitHub Actions on push/PR: typecheck → lint → check-indexes → audit → build → `firebase emulators:exec --only auth,firestore "pnpm run test"`. |
| Prod accounts | `pnpm run create-prod-users` (owner/manager/reader, refuses emulator mode; passwords from env). |
| Data | `pnpm run seed` seeds demo data (emulator-only). |

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| B2 free-tier egress cap (3× stored, 1 GB/day) — heavy photo browsing could hit it | Hard stop (no charge); presigned URLs expiring; thumbnails used in lists; monitor Storage page. |
| Firestore free tier 1 GB / doc-daily limits | Keep only essential fields; aggregation via `AggregateField.sum()`; purge data hygiene actions. |
| Versioned B2 bucket silently accumulating hidden versions after purge | Lifecycle rule “keep only the last version” in console setup. |
| Emulator/prod drift (indexes, B2 behavior) | `check-indexes` gate + CI; emulator for tests only; real-B2 spot checks. |
| Operator error voiding receipts | Role gating, unambiguously titled actions, and verified rollback. |
| Single-tenant scaling surprise | Documented limits; all reads/writes via service layer for future indexing. |

---

## 12. Glossary

| Term | Meaning |
|---|---|
| EC | Ethiopian calendar (13 months); dates always stored UTC ISO, displayed EC. |
| valid | subscription is `active` or `expiring_soon`. |
| expiring_soon | endDate within 7 days. |
| no_subscription | member with no subscription record. |
| Voided | a payment whose effect was rolled back; it no longer contributes `extendedTo`; `hasVoidedPayment` on the subscription. |
| Canonical path | `uploads/<uuid>.webp` as stored on the member doc (never a URL). |
| Presigned URL | temporary (1 h) B2 read URL issued by the server at render time. |
| Page-local state | React state reset when `currentPage` changes. |

---

*Document written from the current repository (v1). It describes the system as implemented on the day of writing; see `README.md` / `AGENTS.md` for operational details.*