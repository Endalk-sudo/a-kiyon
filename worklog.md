---
Task ID: 3
Agent: full-stack-developer
Task: Create authentication system, audit helper, API helper, and seed script

Work Log:
- Installed bcryptjs and @types/bcryptjs
- Created /home/z/my-project/src/lib/auth.ts with session-based auth using bcryptjs for password hashing
- Created /home/z/my-project/src/lib/audit.ts for audit logging
- Created /home/z/my-project/src/lib/api.ts for API response helpers
- Created /home/z/my-project/src/scripts/seed.ts with sample data
- Added "seed": "bun src/scripts/seed.ts" script to package.json
- Ran seed script successfully
- Verified database counts: 2 users, 6 services, 10 members, 11 subscriptions, 11 invoices, 8 payments, 5 audit logs

Stage Summary:
- Auth system uses cookie-based sessions with bcryptjs password hashing
- Session tokens are base64-encoded JSON with userId, email, name, role, and expiry
- getSession() and getSessionOrThrow() helpers available for API routes
- hashPassword() utility exported for user creation
- Audit log helper records all write operations with entity tracking
- API helpers provide standardized response formats (apiResponse, paginatedResponse, apiError, unauthorizedError, forbiddenError)
- Seed script creates owner (owner@fcms.com/owner123), manager (manager@fcms.com/manager123), 6 services with Ethiopian pricing, 10 members with Ethiopian names, and sample subscriptions/invoices/payments

---
Task ID: 4-a
Agent: api-developer
Task: Create API routes for auth, users, and dashboard

Work Log:
- Created POST /api/auth/login route at src/app/api/auth/login/route.ts
  - Accepts { email, password }, calls login() from @/lib/auth
  - Sets "fcms_session" cookie (httpOnly, secure in production, sameSite: lax, maxAge: 24h, path: /)
  - Returns session data on success, 401 on invalid credentials
- Created POST /api/auth/logout route at src/app/api/auth/logout/route.ts
  - Clears "fcms_session" cookie by setting maxAge: 0
  - Returns success message
- Created GET /api/auth/session route at src/app/api/auth/session/route.ts
  - Gets current session from cookie via getSession()
  - Returns session data or 401
- Created GET+POST /api/users route at src/app/api/users/route.ts
  - GET: Lists all users (owner only), returns id, email, name, role, phone, isActive, createdAt
  - POST: Creates new user (owner only), accepts { email, name, password, role, phone? }
  - Hashes password with hashPassword, creates audit log entry, checks for duplicate emails
- Created GET /api/dashboard route at src/app/api/dashboard/route.ts
  - Requires authentication via getSessionOrThrow()
  - Returns: totalMembers, activeSubscriptions, expiringSoonCount, expiredCount, totalRevenue, revenueThisMonth, pendingInvoices
  - Returns: expiringSoonMembers (with member photo, name, subscription details)
  - Returns: recentlyExpiredMembers (with member photo, name)
  - Returns: recentPayments (last 10, with member name)
  - Returns: monthlyRevenue (last 6 months breakdown)
- Ran lint: 0 errors (2 warnings in pre-existing members/route.ts)

Stage Summary:
- All 5 API route files created and passing lint
- Auth routes handle login/logout/session with cookie-based sessions
- Users route enforces owner-only access with audit logging
- Dashboard route provides comprehensive statistics with member, subscription, payment, and revenue data

---
Task ID: 4-c
Agent: api-developer
Task: Create API routes for subscriptions and invoices

Work Log:
- Created GET+POST /api/subscriptions route at src/app/api/subscriptions/route.ts
  - GET: List subscriptions with server-side pagination (page, limit, memberId, serviceId, status filters)
  - GET: Includes member (firstName, lastName, photo) and service (name, price) relations
  - POST: Create subscription (manager + owner only), accepts { memberId, serviceId, startDate, notes? }
  - POST: Supports Ethiopian date format (dd/mm/yyyy) via parseEthiopianDate, falls back to ISO string
  - POST: Looks up service for price/duration, sets priceSnapshot, calculates endDate = startDate + duration days
  - POST: Creates invoice in same transaction ({ memberId, subscriptionId, amount: priceSnapshot, status: pending, dueDate: startDate })
  - POST: Creates audit log entry for subscription.create
- Created GET+PUT /api/subscriptions/[id] route at src/app/api/subscriptions/[id]/route.ts
  - GET: Get single subscription with full member details, service details, and invoices
  - PUT: Update subscription (manager + owner), accepts { status?, notes? }
  - PUT: If status changed to "cancelled", also cancels any pending invoices in same transaction
  - PUT: Creates audit log entry for subscription.update
- Created GET /api/invoices route at src/app/api/invoices/route.ts
  - GET: List invoices with server-side pagination (page, limit, memberId, status filters)
  - GET: Includes member (firstName, lastName, photo) and subscription relations
  - GET: Auto-marks overdue invoices (pending with dueDate < today set to "overdue") before returning results
- Created GET+PUT /api/invoices/[id] route at src/app/api/invoices/[id]/route.ts
  - GET: Get single invoice with member details, subscription (including service info), and payments (with user who created)
  - PUT: Update invoice status (manager + owner), accepts { status }
  - PUT: If status changed to "paid", sets paidAt = now
  - PUT: Creates audit log entry for invoice.update
- Ran lint: 0 errors (4 warnings in pre-existing files)

Stage Summary:
- All 4 API route files created and passing lint with no errors
- Subscription routes support Ethiopian date parsing, transactional subscription+invoice creation, and cascading cancellation
- Invoice routes include auto-overdue detection and paid-at timestamp handling
- All write operations create audit log entries for traceability

---
Task ID: 4-d
Agent: api-developer
Task: Create API routes for payments, audit-logs, and CSV exports

Work Log:
- Created GET+POST /api/payments route at src/app/api/payments/route.ts
  - GET: List payments with server-side pagination (page, limit, memberId, method, isVoided, startDate, endDate filters)
  - GET: Includes member (firstName, lastName, photo) and invoice relations
  - POST: Record new payment (manager + owner only), accepts { invoiceId, memberId, amount, paymentDate, method, notes? }
  - POST: Generates receiptNumber as "RCPT-" + timestamp + random 4 digits
  - POST: Supports Ethiopian date format (dd/mm/yyyy) via parseEthiopianDate, falls back to ISO string
  - POST: Auto-updates invoice status to "paid" when total non-voided payments cover invoice amount
  - POST: Creates audit log entry for payment.create
- Created GET /api/payments/[id] route at src/app/api/payments/[id]/route.ts
  - Returns single payment with full member details, invoice (including subscription/service), and user who created
- Created POST /api/payments/[id]/void route at src/app/api/payments/[id]/void/route.ts
  - Void a payment (owner only)
  - Sets isVoided = true, voidedAt = now, voidedBy = session.userId
  - Checks if invoice should revert to "pending" (if no other non-voided payments cover it)
  - Creates audit log entry for payment.void
- Created GET /api/audit-logs route at src/app/api/audit-logs/route.ts
  - List audit logs (owner only) with server-side pagination
  - Supports filters: page, limit, userId, action, entity, startDate, endDate
  - Includes user relation (name, email)
  - Returns paginated response with { data: [...logs], pagination }
- Created GET /api/export/members route at src/app/api/export/members/route.ts
  - Export members as CSV (manager + owner only)
  - Supports status filter query param
  - Returns CSV with headers: Name, Phone, Email, Status, Created Date (EC)
  - Sets Content-Type: text/csv and Content-Disposition: attachment
- Created GET /api/export/payments route at src/app/api/export/payments/route.ts
  - Export payments as CSV (manager + owner only)
  - Supports startDate, endDate query params (Ethiopian or ISO format)
  - Returns CSV with headers: Receipt#, Member, Amount, Method, Date (EC), Voided
  - Sets Content-Type: text/csv and Content-Disposition: attachment
- Ran lint: 0 errors, 0 warnings

Stage Summary:
- All 6 API route files created and passing lint cleanly
- Payment routes support full CRUD with Ethiopian date handling, auto invoice status updates, and void functionality
- Void payment checks invoice coverage and reverts status to "pending" if needed
- Audit logs route provides filtered, paginated access for owner role
- CSV export routes generate proper CSV with Ethiopian date formatting, escaped fields, and correct Content-Type headers

---
Task ID: 4-b
Agent: api-developer
Task: Create API routes for members and services

Work Log:
- Created GET+POST /api/members route at src/app/api/members/route.ts
  - GET: List members with server-side pagination (page, limit) and filtering (search, status, showDeleted)
  - GET: Search filters across firstName, lastName, phone, email fields
  - GET: Computes subscription status per member: active, expiring_soon, expired, no_subscription
  - GET: Status computation checks subscription endDate against now and now+7days thresholds
  - GET: Supports status filtering (post-filter after computation for accurate results)
  - GET: Returns paginated response with { data: [...members with status], pagination: { total, page, limit, totalPages } }
  - POST: Create new member (manager + owner only), accepts { firstName, lastName, phone?, email?, photo?, emergencyContact?, notes? }
  - POST: Creates audit log entry for member.create
  - POST: Returns created member with computed status "no_subscription"
- Created GET+PUT+DELETE /api/members/[id] route at src/app/api/members/[id]/route.ts
  - GET: Get single member with full relations (subscriptions with service+invoices, invoices with subscription+payments, payments with invoice)
  - GET: Includes computed subscription status
  - PUT: Update member (manager + owner), accepts partial update fields
  - PUT: Prevents updating deleted members
  - PUT: Creates audit log entry for member.update, returns member with computed status
  - DELETE: Soft-delete member (owner only), sets isDeleted=true, deletedAt=now
  - DELETE: Creates audit log entry for member.delete
- Created POST /api/members/[id]/restore route at src/app/api/members/[id]/restore/route.ts
  - POST: Restore soft-deleted member (owner only), sets isDeleted=false, deletedAt=null
  - POST: Validates member exists and is actually deleted before restoring
  - POST: Creates audit log entry for member.restore
- Created GET+POST /api/services route at src/app/api/services/route.ts
  - GET: List all active services by default, optionally include inactive with ?includeInactive=true
  - GET: No pagination needed, returns { data: [...services] }, ordered by name asc
  - POST: Create service (owner only), accepts { name, nameAm?, description?, descriptionAm?, price, duration, isActive? }
  - POST: Validates price is non-negative number and duration is positive integer
  - POST: Creates audit log entry for service.create
- Created PUT+DELETE /api/services/[id] route at src/app/api/services/[id]/route.ts
  - PUT: Update service (owner only), accepts partial update fields
  - PUT: Validates price/duration if provided
  - PUT: Creates audit log entry for service.update
  - DELETE: Soft-deactivate service (owner only), sets isActive=false
  - DELETE: Creates audit log entry for service.deactivate
- Tested all endpoints manually with curl:
  - GET /api/members returns 10 members with correct statuses (active, expiring_soon, expired)
  - GET /api/members?status=active correctly filters to 3 active members
  - GET /api/members?search=Solomon finds 1 matching member
  - POST /api/members creates new member with status "no_subscription"
  - PUT /api/members/[id] updates member fields correctly
  - DELETE /api/members/[id] soft-deletes (owner only, manager gets 403)
  - POST /api/members/[id]/restore restores deleted member
  - GET /api/services returns 6 active services
  - POST /api/services creates new service with validation
  - PUT /api/services/[id] updates service fields
  - DELETE /api/services/[id] deactivates service
- Ran lint: 0 errors, 0 warnings

Stage Summary:
- All 5 API route files created, tested, and passing lint cleanly
- Member routes support full CRUD with soft-delete/restore, subscription status computation, and role-based access control
- Subscription status computation: active (endDate >= now, none within 7 days), expiring_soon (any endDate within 7 days), expired (all endDate < now), no_subscription (no subscriptions)
- Service routes support create/update/deactivate with owner-only write access
- All write operations create audit log entries for traceability
- Role-based access: owner can do everything, manager can create/update but not delete/restore/deactivate, unauthenticated users get 401

---
Task ID: 6
Agent: dashboard-developer
Task: Create Dashboard page component at /home/z/my-project/src/components/pages/dashboard.tsx

Work Log:
- Created /home/z/my-project/src/components/pages/ directory
- Created DashboardPage component ('use client') at /home/z/my-project/src/components/pages/dashboard.tsx
- Implemented 4 stats cards in a responsive grid (2 cols mobile, 4 cols desktop): Total Members, Active Subscriptions (emerald), Expiring Soon (amber), Expired (red)
- Each stats card has color-coded icon background, value, and description text
- Built "Expiring Soon" alert section with amber styling, member avatars (40x40 via MemberAvatar), names, service names, Ethiopian-formatted end dates, and "Record Payment" button that navigates to payments page via useAppStore
- Built "Recently Expired" alert section with red styling, member avatars, names, expired dates, and StatusBadge components
- Both alert sections have max-h-80 overflow-y-auto with custom-scrollbar class, and empty states with icons
- Created Recent Payments table (shadcn Table) showing member name, amount (emerald), payment method (Badge), and Ethiopian-formatted date
- Created Monthly Revenue chart using recharts BarChart with ResponsiveContainer, custom tooltip (formatCurrency), formatted Y-axis (k suffix for thousands), emerald-colored bars with rounded top corners
- Added comprehensive loading states: StatsCardSkeleton, AlertListSkeleton, PaymentsTableSkeleton, chart skeleton
- Added error state with retry button for failed data fetches
- Component fetches data from /api/dashboard via dashboardApi.get()
- Passes lint with 0 errors

Stage Summary:
- Dashboard component is fully functional with 4 main sections: stats cards, alert lists, recent payments table, and monthly revenue chart
- Uses all specified imports: dashboardApi, StatusBadge, MemberAvatar, formatCurrency/formatDate/formatMemberName/formatPaymentMethod, useAppStore, shadcn Card/Badge/Button/Table, lucide-react icons, recharts
- Responsive design: 2-col grid on mobile, 4-col on desktop for stats; 1-col on mobile, 2-col on desktop for alert sections and chart/table
- Color-coded alerts: amber for expiring soon, red for expired, emerald for active/revenue
- All dates formatted using Ethiopian calendar via formatDate
- Proper loading skeletons and error handling with retry

---
Task ID: 11-12
Agent: page-developer
Task: Create Reports, Audit Logs, and Settings page components

Work Log:
- Created /home/z/my-project/src/components/pages/reports.tsx ('use client')
  - Revenue Summary Cards: Total Revenue (DollarSign icon), This Month Revenue (TrendingUp icon), Pending Invoices Value (FileText icon) in 3-col responsive grid
  - Revenue Chart: recharts BarChart with ResponsiveContainer showing monthly revenue for last 6 months, custom Tooltip with formatCurrency, Y-axis formatted with "k" suffix, primary-colored bars with rounded top corners
  - Date range selector: Two EthiopianDateInput components for start/end date filtering
  - Export buttons: "Export Members CSV" and "Export Payments CSV" with loading spinners, uses Blob/URL.createObjectURL for client-side download
  - CSV download implementation follows specified pattern: exportApi → Blob → createObjectURL → auto-click link → revokeObjectURL
  - Loading skeleton states for cards and chart
  - Error handling with toast notifications
  - Imports: exportApi, dashboardApi, EthiopianDateInput, formatCurrency, recharts components

- Created /home/z/my-project/src/components/pages/audit-logs.tsx ('use client')
  - Filter bar: User ID input, Action Type select (13 action types), Entity Type select (6 entity types), Start/End date via EthiopianDateInput
  - Clear All filters button when any filter is active
  - Audit logs table: Timestamp (formatDateTime), User (name + email), Action (color-coded badge), Entity, Entity ID (truncated with title), View detail button
  - Color-coded action badges: green for create, blue for update, red for delete/void, yellow for restore, orange for deactivate
  - Pagination: Previous/Next buttons with page info, disabled at boundaries
  - Detail dialog: Click row to see full details with parsed JSON in formatted pre block, max-h-60 scrollable
  - Empty state with search icon
  - Loading skeleton states
  - Imports: auditLogsApi, formatDateTime, EthiopianDateInput, shadcn Table/Select/Dialog

- Created /home/z/my-project/src/components/pages/settings.tsx ('use client')
  - Current User Info card: Avatar initial, name, role badge (default for owner, secondary for manager), email with icon, user ID
  - User Management card (owner only): Users table with avatar, name, email, role badge, phone, active/inactive badge
  - Create User dialog: Email, Name, Password, Role (Select: owner/manager), Phone fields with validation (email format, password min 6 chars)
  - Inline form error messages for each field
  - Not-owner notice: Shield icon with "Only owners can manage system users" message
  - About section: System name, version (1.0.0), framework (Next.js 16), calendar (Ethiopian EC), currency (ETB), database (SQLite/Prisma)
  - Loading skeleton states
  - Imports: usersApi, useAppStore

- Ran lint: 0 errors in new files (3 pre-existing errors in app-layout.tsx, 1 warning in payments.tsx)

Stage Summary:
- All 3 page components created with 'use client' directive, matching the page routing in src/app/page.tsx
- Reports page: Revenue cards + BarChart + CSV export with Ethiopian date filtering
- Audit Logs page: Filterable/paginated table with color-coded actions + detail dialog (owner only)
- Settings page: Current user info + user management with create form (owner only) + about section
- All components use shadcn/ui, toast notifications, loading skeletons, and responsive design
- No lint errors in new files

---
Task ID: 7
Agent: frontend-developer
Task: Create Members page component at /home/z/my-project/src/components/pages/members.tsx

Work Log:
- Created MembersPage component ('use client') at /home/z/my-project/src/components/pages/members.tsx
- Implemented search bar with debounced input (300ms) filtering by name, phone, or email
- Created 5 quick filter buttons: All, Active (green), Expiring Soon (yellow), Expired (red), No Subscription (gray) with colored active states
- Added Show Deleted toggle (owner-only) using Switch component with Label
- Implemented responsive member list: card layout on mobile (via useIsMobile), table layout on desktop
- Card view shows: MemberAvatar (40x40 circular), full name, phone, email, StatusBadge, and action buttons
- Table view shows: avatar + name, phone, email, status badge, join date, and action buttons column
- Created Add Member dialog with form fields: firstName (required), lastName (required), phone, email, emergencyContact, notes
- Created Edit Member dialog with same form, pre-populated with existing member data
- Created View Member dialog showing: header with avatar/name/status, contact info, subscriptions list, invoices list, payments list (all with scrollable max-h-48 overflow-y-auto)
- Implemented Delete member with AlertDialog confirmation (owner-only, soft-delete)
- Implemented Restore member with AlertDialog confirmation (owner-only, for soft-deleted members)
- Added server-side pagination with shadcn Pagination component, ellipsis for large page counts
- Pagination resets to page 1 when search or status filter changes
- Added loading skeleton states for both mobile cards and desktop table layouts
- Added empty state with icon, message, and conditional "Add Member" button
- Form validation: firstName/lastName required, email format validation
- Used toast notifications for success/error on all CRUD operations
- Role-based UI: owner sees delete/restore/show-deleted, manager sees add/edit, read-only for others
- Deleted members shown with opacity-60 and "Deleted" badge
- All sub-components extracted: MemberCard, MemberActions, MemberForm, MembersListSkeleton
- Passes lint with 0 errors in members.tsx (pre-existing errors in other files)

Stage Summary:
- Members page provides complete CRUD interface with search, filter, pagination, and responsive layout
- Uses all specified imports: membersApi, StatusBadge/StatusType, MemberAvatar, formatCurrency/formatDate/formatMemberName, useAppStore
- Uses shadcn/ui components: Card, Dialog, AlertDialog, Button, Input, Label, Badge, Separator, Switch, Table, Pagination, Skeleton, Textarea
- Responsive design: card layout on mobile (<768px), table layout on desktop
- Server-side pagination with page/limit params, debounced search, status filtering
- Role-based access: owner can delete/restore/toggle-show-deleted, manager can add/edit, all can view
- Proper loading states with skeleton components, empty state handling, and toast notifications

---
Task ID: 10
Agent: page-developer
Task: Create Payments page component at /home/z/my-project/src/components/pages/payments.tsx

Work Log:
- Created PaymentsPage component ('use client') at /home/z/my-project/src/components/pages/payments.tsx
- Implemented payments table with columns: Receipt #, Member (with MemberAvatar), Amount (formatCurrency), Method (Badge), Date (EC) (formatDate), Status (Completed/VOIDED badges), Actions (Print/Void)
- Added method filter dropdown: All Methods, Cash, Bank Transfer, Mobile Money - triggers server-side refetch via paymentsApi.list
- Added search input for filtering by receipt number or member name (client-side filter on fetched page)
- Created Record Payment dialog with:
  - Member selection dropdown (fetches from membersApi.list with limit 200)
  - Member photo/avatar display when selected (MemberAvatar size="lg" with name)
  - Pending invoices loading (fetches both "pending" and "overdue" status invoices via invoicesApi.list)
  - Invoice selection dropdown showing service name, amount, and due date
  - Auto-fill amount from selected invoice (editable)
  - Ethiopian date input (EthiopianDateInput component) with ISO date tracking
  - Payment method select (Cash, Bank Transfer, Mobile Money)
  - Optional notes textarea
  - Submit creates payment via paymentsApi.create, shows toast, refreshes table
  - Form reset on dialog close
- Created Print Receipt feature:
  - Opens new browser window with styled receipt HTML
  - Receipt layout: FCMS header, receipt number, member name, service/subscription info, amount in ETB, Ethiopian date, payment method, optional notes, "Thank you" message
  - Auto-triggers window.print() on load
  - Handles popup blocker with error toast
- Created Void Payment feature (owner only):
  - Ban icon only visible for owner role and non-voided payments
  - AlertDialog confirmation showing receipt number, member name, and amount
  - Calls paymentsApi.void(id), shows success toast, refreshes table
  - Voided payments shown with opacity-50, bg-muted/30, and gray "VOIDED" badge
- Implemented responsive design:
  - Desktop: full Table layout with all columns
  - Mobile: Card layout with key info and action buttons
  - Both layouts have loading skeleton states and empty states
- Added server-side pagination with Previous/Next buttons and page info
- Payment method filter uses server-side filtering (refetches on change)
- Search uses client-side filtering on current page data
- Passes lint with 0 errors in payments.tsx

Stage Summary:
- Payments page provides complete payment management: table view, recording, receipt printing, and voiding
- Uses all specified imports: paymentsApi, invoicesApi, membersApi, EthiopianDateInput, MemberAvatar, formatCurrency/formatDate/formatMemberName/formatPaymentMethod, useAppStore
- Uses shadcn/ui components: Card, Dialog, AlertDialog, Button, Input, Label, Badge, Select, Table, Separator, Textarea, Skeleton
- Responsive: table on desktop, card list on mobile with scrollable container
- Role-based: owner sees Void action, manager can record payments and print receipts
- Print receipt opens styled printable window with FCMS branding, Ethiopian date, and ETB amount
- Void payment with confirmation dialog, auto-refreshes table, voided items shown greyed out with VOIDED badge

---
Task ID: 9
Agent: page-developer
Task: Create Subscriptions and Invoices page components

Work Log:
- Created /home/z/my-project/src/components/pages/subscriptions.tsx ('use client')
  - Subscriptions table with columns: Member (avatar + name), Service, Start Date (EC), End Date (EC), Status, Price, Actions
  - Responsive table: Start Date and End Date hidden on mobile (hidden md:table-cell), Price hidden on small screens (hidden sm:table-cell)
  - Status filter buttons: All, Active, Expired, Cancelled
  - Custom SubscriptionStatusBadge component: Active (emerald/green), Expired (red), Cancelled (gray) with dot indicator
  - Add Subscription dialog: Member dropdown (from membersApi), Service dropdown (from servicesApi with price/duration info), EthiopianDateInput for start date, Notes textarea
  - Form validation: checks for member, service, and valid date before submission
  - Form auto-resets on dialog open, shows inline error messages
  - Cancel Subscription: AlertDialog confirmation with member name and service name, warning about cascading invoice cancellation
  - Cancel action only shows for active subscriptions (Ban icon + "Cancel" text)
  - Server-side pagination with shadcn Pagination component, ellipsis for large page counts
  - Pagination info text: "Showing X to Y of Z subscriptions"
  - Loading skeleton states (5 rows with animated pulse placeholders)
  - Empty state with message and filter hint
  - Role-based UI: Add/Cancel actions only visible for owner and manager roles
  - Imports: subscriptionsApi, membersApi, servicesApi, EthiopianDateInput, MemberAvatar, StatusBadge, formatCurrency/formatDate/formatMemberName, useAppStore

- Created /home/z/my-project/src/components/pages/invoices.tsx ('use client')
  - Invoices table with columns: Member (avatar + name), Subscription, Amount, Status, Due Date (EC), Paid Date (EC), Actions
  - Responsive table: Due Date hidden on mobile (hidden md:table-cell), Paid Date hidden on small screens (hidden lg:table-cell)
  - Status filter buttons: All, Pending, Paid, Overdue, Cancelled
  - Custom InvoiceStatusBadge component: Pending (amber/yellow), Paid (emerald/green), Overdue (red/destructive), Cancelled (gray/secondary) with dot indicator
  - Mark as Paid button: available for pending/overdue invoices, visible only for owner and manager (CheckCircle icon + "Pay" text)
  - View Invoice dialog: fetches full invoice detail from invoicesApi.get(id), shows:
    - Invoice ID, status badge
    - Member info: avatar, name, phone, email
    - Subscription info: service name, duration, start/end dates in grid layout
    - Invoice details: amount (large bold), due date, paid date, total paid in grid layout
    - Payments section: list of payments with receipt number, amount, method, date, recorded-by, voided badge, and notes
    - "Mark as Paid" button at bottom for pending/overdue invoices
  - Server-side pagination with shadcn Pagination component, ellipsis for large page counts
  - Pagination info text: "Showing X to Y of Z invoices"
  - Loading skeleton states (5 rows) and detail dialog skeleton
  - Empty state with message and filter hint
  - Voided payments shown with reduced opacity and "Voided" badge
  - Payment method formatting: cash → Cash, bank_transfer → Bank Transfer, mobile_money → Mobile Money
  - Total paid calculation: sums non-voided payment amounts
  - Imports: invoicesApi, MemberAvatar, formatCurrency/formatDate/formatMemberName/formatInvoiceStatus, useAppStore

- Ran lint: 0 errors in new files (pre-existing errors in app-layout.tsx, payments.tsx)

Stage Summary:
- Subscriptions page: full CRUD interface with table, status filtering, add dialog with Ethiopian date input, cancel confirmation, pagination, loading states, responsive design
- Invoices page: table with status filtering, mark-as-paid action, detailed view dialog with member/subscription/payments info, pagination, loading states, responsive design
- Both components use shadcn/ui components (Table, Dialog, AlertDialog, Select, Button, Badge, Skeleton, Pagination, Separator)
- Both components use custom status badges matching the specified color scheme
- Role-based access control: management actions restricted to owner/manager roles
- All dates displayed in Ethiopian Calendar format via formatDate utility
- Proper error handling, form validation, and loading states throughout
