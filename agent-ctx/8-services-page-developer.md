# Task 8: Services Page Component

## Work Summary
Created `/home/z/my-project/src/components/pages/services.tsx` - a 'use client' component for managing fitness center services.

## Features Implemented
1. **Services Grid** - Responsive card grid (1-col mobile, 2-col tablet, 3-col desktop)
   - Card shows: name, Amharic name (if available), description, price in ETB (formatCurrency), duration in days, Active/Inactive badge
   - Inactive services shown with reduced opacity
   
2. **Add Service Dialog** (owner only)
   - Modal form with: Name (required), Name Amharic, Description, Description Amharic, Price ETB (required), Duration days (required), Active toggle
   
3. **Edit Service Dialog** (owner only)
   - Pre-populated form with existing service data
   - Same fields as Add dialog
   
4. **Activate/Deactivate Toggle** (owner only)
   - Uses servicesApi.update with isActive field
   - Visual feedback with Power/PowerOff icons

5. **Additional Features**
   - "Show inactive" switch (owner only) in header
   - Empty state with CTA for owners
   - Loading spinner
   - Bilingual support (English/Amharic) via locale from useAppStore
   - Form validation: name required, price >= 0, duration >= 1
   - Toast notifications for success/error
   - Role-based UI: session.role === 'owner' gates all CRUD controls

## API Integration
- `servicesApi.list({ includeInactive })` - fetch services
- `servicesApi.create(data)` - add new service
- `servicesApi.update(id, data)` - edit service / toggle active state

## Lint Status
0 errors on services.tsx (pre-existing errors in app-layout.tsx are unrelated)
