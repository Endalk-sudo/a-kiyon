# A-kiyon Fitness Center Management System

A complete management system for fitness centers built with Next.js. Track members, subscriptions, payments, and revenue — all with Ethiopian calendar support, role-based access control, and Firebase on the backend.

## Features

- **Member Management** — Register members with photos, health stats, blood type, emergency contacts, and address
- **Subscriptions & Renewals** — Track subscription periods with auto-calculated end dates and Ethiopian calendar support
- **Payments & Receipts** — Record payments in cash, bank transfer, or mobile money; print thermal-style receipts; void with audit trail
- **Reporting & Analytics** — Revenue charts, monthly trends, expiring member alerts, CSV exports
- **Role-Based Access** — Owner (full access), Manager (operational CRUD, no voiding), Reader (view-only)
- **User Management** — Create/update/deactivate users with role assignment (owner only)
- **Audit Logging** — Every mutation action is logged with user, timestamp, and details
- **Photo Uploads** — Member photos with camera capture, processed via sharp (WebP + thumbnail)
- **Ethiopian Calendar** — Full date input, display, and formatting in EC
- **Dark Mode** — Theme toggle with system preference detection
- **Storage Monitoring** — Track Firestore document counts, Storage file usage, and free-tier limits (owner only)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | Firestore (Firebase) |
| Auth | Firebase Auth (email/password) |
| Storage | Firebase Storage |
| Admin SDK | firebase-admin |
| Client SDK | firebase |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | Zustand |
| Validation | Zod v4 |
| Charts | Recharts |
| Uploads | sharp (WebP + 200×200 thumbnail) |
| Package Manager | pnpm |

## Getting Started

### Prerequisites

- Node.js 20+
- Java 17+ (for Firebase emulators)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd a-kiyon-fcms
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials, or keep FIREBASE_EMULATOR=true for local dev

# Seed demo data (runs against emulators or production Firebase)
pnpm run seed

# Start Firebase emulators (in one terminal)
pnpm run firebase:emulators   # Firestore 8080, Auth 9099, Storage 9199, UI 4000

# Start dev server (in another terminal)
pnpm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
# Requires real Firebase Admin credentials in .env
pnpm run build
pnpm run start
```

Self-hosted with Caddy reverse proxy on `:81` → `localhost:3000` (see `Caddyfile`).

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@fcms.com` | `owner123` |
| Manager | `manager@fcms.com` | `manager123` |

## Role Permissions

| Feature | Owner | Manager |
|---------|-------|---------|
| View Dashboard | ✅ | ✅ |
| Members (view) | ✅ | ✅ |
| Members (create/edit) | ✅ | ✅ |
| Members (delete/restore) | ✅ | ❌ |
| Subscriptions (view) | ✅ | ✅ |
| Subscriptions (create/edit/renew) | ✅ | ✅ |
| Payments (view) | ✅ | ✅ |
| Payments (record) | ✅ | ✅ |
| Payments (void) | ✅ | ❌ |
| Reports & Exports | ✅ | ✅ |
| Services (manage) | ✅ | ❌ |
| Users (manage) | ✅ | ❌ |
| Audit Logs | ✅ | ❌ |
| Settings & Storage | ✅ | ❌ |

## Project Structure

```
src/
├── app/
│   ├── api/          # API routes (RESTful, each wrapped with apiHandler)
│   └── page.tsx      # Root page (auth gate + client-side routing)
├── components/
│   ├── pages/        # Page components (dashboard, members, subscriptions, payments, services, audit-logs, settings, storage)
│   └── ui/           # shadcn/ui components
├── lib/
│   ├── auth.ts       # Server-side session helpers (getSession / getSessionOrThrow)
│   ├── auth-client.ts# Client-side Firebase Auth (login, logout, onAuthChange)
│   ├── api.ts        # Response utilities (apiResponse, paginatedResponse, apiError)
│   ├── api-client.ts # Client-side fetch wrapper (auto-attaches Bearer token)
│   ├── api-types.ts  # Shared API response types
│   ├── audit.ts      # Audit log helper (silent on failure)
│   ├── db.ts         # Firestore helper functions (getDocById, getDocs, createDoc, updateDoc, deleteDoc, batchUpdate, aggregateSum)
│   ├── firebase-admin.ts  # Firebase Admin SDK (adminDb, adminAuth, adminBucket)
│   ├── firebase-client.ts # Firebase client SDK with emulator auto-connect
│   ├── store.ts      # Zustand store (currentPage, sidebar open, etc.)
│   ├── format.ts     # Formatting utilities
│   ├── schemas.ts    # Zod v4 schemas for all entities
│   ├── ethiopian-calendar.ts  # Ethiopian calendar conversion
│   └── member-status.ts  # Member status computation (active/expired/grace)
├── services/         # Service layer (member, subscription, payment, user)
├── hooks/            # Custom React hooks
└── scripts/
    ├── seed.ts       # Seed Firestore + Firebase Auth with demo data
    └── cron-expire.ts # Standalone script to expire subscriptions
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start dev server on port 3000 |
| `pnpm run build` | Production build |
| `pnpm run start` | Start production server |
| `pnpm run lint` | Run ESLint |
| `npx tsc --noEmit` | TypeScript type check |
| `pnpm run seed` | Seed Firestore + Auth with demo data |
| `pnpm run firebase:emulators` | Start Firebase emulators (Firestore 8080, Auth 9099, Storage 9199, UI 4000) |
| `pnpm run firebase:emulators:export` | Export emulator data to `./firebase-data` |
| `pnpm run firebase:emulators:import` | Start emulators with previous data |

## Architecture Notes

- **API routes** under `src/app/api/*/route.ts` are each wrapped with `apiHandler` which catches `ZodError` → 400, `"Unauthorized"` → 401, `"Forbidden"` → 403.
- **Subscriptions** use an extendable `endDate` model — renewals extend the existing subscription rather than creating new rows.
- **Auto-expiry** runs on read (GET endpoints) — active subscriptions past their `endDate` are batch-updated to `expired` before results are returned. A standalone cron script at `src/scripts/cron-expire.ts` also exists.
- **All dates** are stored as ISO strings in Firestore and displayed in Ethiopian Calendar (EC) format in the UI.
- **Photo uploads** are uploaded to Firebase Storage (not local disk). Sharp converts to WebP (quality 80) with a 200×200 thumbnail.
- **Soft delete** is used for Members (`isDeleted` boolean field).
- **Audit logs** are written silently — failures never crash the main operation.
- **Storage monitoring** is available at `/api/storage` and the Storage page shows Firestore doc counts, Storage file breakdown, free-tier percentages, and cleanup actions (orphan purge, old audit log purge, deleted member purge).
