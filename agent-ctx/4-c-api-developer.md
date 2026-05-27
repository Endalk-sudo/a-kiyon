# Task 4-c: API Routes for Subscriptions and Invoices

## Summary
Created all 4 API route files for subscription and invoice management with full CRUD operations, pagination, Ethiopian date support, and audit logging.

## Files Created

1. **`src/app/api/subscriptions/route.ts`** - GET (paginated list) + POST (create with transactional invoice)
2. **`src/app/api/subscriptions/[id]/route.ts`** - GET (single with details) + PUT (update with cascading cancel)
3. **`src/app/api/invoices/route.ts`** - GET (paginated list with auto-overdue marking)
4. **`src/app/api/invoices/[id]/route.ts`** - GET (single with payments) + PUT (status update with paidAt)

## Key Implementation Details

- Ethiopian date parsing: POST /api/subscriptions accepts dd/mm/yyyy Ethiopian format or ISO strings
- Transactional operations: Subscription creation creates invoice in same transaction; cancellation cascades to invoices
- Auto-overdue: GET /api/invoices marks pending invoices past due date as overdue before returning
- Audit logging: All write operations create audit log entries
- Auth: All routes require owner or manager role via getSessionOrThrow()
- Lint: 0 errors
