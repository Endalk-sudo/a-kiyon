# A-kiyon Fitness Center Management System

A complete management system for fitness centers built with Next.js. Track members, subscriptions, payments, and revenue — all with Ethiopian calendar support and role-based access control.

## Features

- **Member Management** — Register members with photos, health stats, blood type, emergency contacts, and address
- **Subscriptions & Renewals** — Track subscription periods with auto-calculated end dates and Ethiopian calendar support
- **Payments & Receipts** — Record payments in cash, bank transfer, or mobile money; print thermal-style receipts; void with audit trail
- **Reporting & Analytics** — Revenue charts, monthly trends, expiring member alerts, CSV exports
- **Role-Based Access** — Owner (full access), Manager (operational CRUD, no voiding), Reader (view-only)
- **User Management** — Create/update/deactivate users with role assignment (owner only)
- **Audit Logging** — Every mutation action is logged with user, timestamp, and details
- **Photo Uploads** — Member photos with camera capture support
- **Ethiopian Calendar** — Full date input, display, and formatting in EC
- **Dark Mode** — Theme toggle with system preference detection

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Auth | Better Auth |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | Zustand |
| Charts | Recharts |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Bun (for running the seed script)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd a-kiyon-fcms
npm install

# Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Set up database
npm run db:migrate
npm run seed

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@fcms.com` | `owner123` |
| Manager | `manager@fcms.com` | `manager123` |

## Role Permissions

| Feature | Owner | Manager | Reader |
|---------|-------|---------|--------|
| View Dashboard | ✅ | ✅ | ✅ |
| Members (view) | ✅ | ✅ | ✅ |
| Members (create/edit) | ✅ | ✅ | ❌ |
| Members (delete/restore) | ✅ | ❌ | ❌ |
| Subscriptions (view) | ✅ | ✅ | ✅ |
| Subscriptions (create/edit/renew) | ✅ | ✅ | ❌ |
| Payments (view) | ✅ | ✅ | ✅ |
| Payments (record) | ✅ | ✅ | ❌ |
| Payments (void) | ✅ | ❌ | ❌ |
| Reports & Exports | ✅ | ✅ | ❌ |
| Services (manage) | ✅ | ❌ | ❌ |
| Users (manage) | ✅ | ❌ | ❌ |
| Audit Logs | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

## Project Structure

```
src/
├── app/
│   ├── api/          # API routes (RESTful)
│   └── page.tsx      # Root page (auth gate)
├── components/
│   ├── pages/        # Page components (dashboard, members, etc.)
│   └── ui/           # shadcn/ui components
├── lib/
│   ├── auth.ts       # Session & role helpers
│   ├── api.ts        # Response utilities
│   ├── audit.ts      # Audit log helper
│   ├── api-client.ts # Client-side fetch wrapper
│   ├── store.ts      # Zustand store
│   ├── format.ts     # Formatting utilities
│   └── db.ts         # Prisma client singleton
├── hooks/            # Custom React hooks
└── scripts/
    └── seed.ts       # Database seed script
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema changes directly |
| `npm run db:reset` | Reset database and re-migrate |
| `npm run seed` | Seed database with demo data |
| `npm run lint` | Run ESLint |

## Architecture Notes

- **Subscriptions** use an extendable `endDate` model — renewals extend the existing subscription rather than creating new rows
- **Auto-expiry** runs on read (GET endpoints) — active subscriptions past their `endDate` are batch-updated to `expired` before results are returned
- **All dates** are stored as ISO timestamps in the database and displayed in Ethiopian Calendar (EC) format in the UI
- **Photo uploads** are stored in `public/uploads/` and served as static files
