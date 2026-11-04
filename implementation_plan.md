# Instant Billing Cleanup & Ghost Order Prevention

## Goal Description

Implement a robust workflow that:
1. **Instantly clears** customer and admin order history and table status across all devices immediately after a bill is printed.
2. **Prevents ghost orders** by validating that a mobile device ordering for a table is still the active session holder.
3. **Fixes duplicate Bar KOT printing** when both kitchen and bar items are ordered.
4. **Pushes changes to GitHub** as requested.

## User Review Required

> [!IMPORTANT]
> The changes will modify server‑side API routes and client‑side state handling. Ensure that the production environment runs a compatible version of `socket.io` (or the existing real‑time mechanism) and that the database schema includes a `customerMobile` field on `tablesessions`.

## Open Questions

> [!WARNING]
> **Session validation logic** – Should we enforce strict matching of `customerMobile` **or** also allow a fallback where the session has no stored mobile (e.g., first order)?

> [!WARNING]
> **Real‑time event channel** – The app currently uses a custom event system (`event.emit`). Confirm whether we should emit a Socket.IO event named `BILL_COMPLETED` to all clients or use the existing `orderEvent` infrastructure.

## Proposed Changes

---
### Server – Billing Route (`src/app/api/pos/billing/route.js`)
- Emit a real‑time event after successful billing to notify all clients.
- Extend table session document to store `customerMobile` when the session is created (if not already present).
- Update the route to clear `tablesessions` and then broadcast `BILL_COMPLETED` with `{ tableNo }`.

---
### Server – Place Order Route (`src/app/api/pos/place-order/route.js`)
- Add validation before processing the order:
  - Fetch the current `tablesessions` record for the given `tableNo`.
  - Verify that the session exists, is not `COMPLETED`, and that `customerMobile` matches the request's `customerMobile` (or allow if session has no mobile recorded).
  - If validation fails, return `400` with a clear error message (e.g., "Session expired or device not authorized").
- When a new session is created (no existing session), store `customerMobile` in the document.

---
### Server – KOT Print Logic (`src/app/api/pos/place-order/route.js`)
- Ensure that `kitchenKOTItems` excludes items with `department === "bar"` **and** that `barKOTItems` only includes `department === "bar"`.
- Add a guard to avoid creating two identical PrintJob entries when the same items are mistakenly categorized.

---
### Client – Menu Page (`src/app/menu/page.js`)
- Subscribe to the new `BILL_COMPLETED` real‑time event (via existing socket or event emitter).
- On receiving the event for the current table:
  - Clear `localStorage` keys: `cart`, `activeOrder`, `customerDetails`.
  - Reset UI state (order list, totals, status flags).
  - Navigate the user back to the welcome screen or show a "Thank you" message.
- Remove any stale polling that relied on periodic status checks.

---
### Admin CRM Tabs (`src/components/AdminCRMTabs.jsx`)
- Listen for `BILL_COMPLETED` to immediately update the table status UI (set to **Idle**).
- Ensure the billing history list view refreshes after the event.

---
### Database Schema (`src/lib/db.js` or migration script)
- Add `customerMobile` (string) to the `tablesessions` collection if not present.
- Provide a migration script that back‑fills existing sessions with `null`.

---
### GitHub Integration
- After local changes, run:
  ```bash
  git add .
  git commit -m "feat: instant billing cleanup, ghost order protection, KOT dup fix"
  git push origin main
  ```
- Ensure the remote repository URL is configured (the user previously pushed other changes).

## Verification Plan

### Automated Tests
- unit test for `place-order` route validation logic (mock DB with matching / non‑matching mobile).
- integration test simulating a bill print followed by a client request to place another order; expect 400.
- test that `BILL_COMPLETED` event is emitted and received by a mock client listener.

### Manual Verification
- Run the app locally, open two browser windows (customer device and admin view).
- Place an order, print the bill, and verify both windows instantly clear their carts and show the table as idle.
- Attempt to place an order from the same customer device after bill print; confirm it is blocked.
- Verify that ordering only bar items results in a single Bar KOT print, not duplicate.
- Verify that ordering kitchen + bar items results in one Kitchen KOT and one Bar KOT.

---
