---
Task ID: 1
Agent: Main Agent
Task: Implement manual payment flow, 3 services (Gym/Karate/Aerobics), and subscription renewal

Work Log:
- Analyzed current codebase: members, subscriptions, payments, invoices, services pages and APIs
- Updated seed script to use 3 services: Gym (1500 ETB/30d), Karate (2000 ETB/30d), Aerobics (1200 ETB/30d) with Amharic translations
- Added member details (weight, height, blood type, address, emergency contact) to seed data
- Created `/api/subscriptions/[id]/renew` API endpoint for subscription renewal
- Added `renew` method to `subscriptionsApi` in api-client
- Updated subscriptions page with Renew button for expired/cancelled subscriptions
- Added renew confirmation dialog with manual payment info banner
- Updated subscription creation dialog with manual payment instructions and info banner
- Added Renew button in member detail view for expired subscriptions
- Updated payments page header and dialog description to emphasize manual payment flow
- Added info banner in Record Payment dialog explaining manual payment process
- Re-seeded database with new 3-service structure
- Verified lint passes cleanly

Stage Summary:
- 3 services configured: Gym (1500 ETB), Karate (2000 ETB), Aerobics (1200 ETB)
- Manual payment flow clearly documented in UI with info banners
- Subscription renewal API and UI fully implemented
- Renew creates new subscription + pending invoice, old subscription marked expired
- All pages updated to reflect manual payment process
