# Live delivery tracking setup

Delivery Tracking now uses the phone's browser GPS, Google Maps, and the
database. It does not simulate a rider's position. The staff order queue on
this page updates actual database order statuses in sequence.

## Database

Back up the database. After the existing `customer_orders` and `users` tables
are installed, apply
[`migrations/001_add_paymongo_payment_fields.sql`](./migrations/001_add_paymongo_payment_fields.sql)
and then
[`migrations/002_add_delivery_tracking.sql`](./migrations/002_add_delivery_tracking.sql).
The first adds payment status fields used to protect unpaid GCash orders; the
second creates a table for each order's current rider location. Neither
migration changes or deletes existing orders.

## Google Maps

Create a Google Maps JavaScript API browser key and set it as
`GOOGLE_MAPS_API_KEY` in `backend/.env` (see [`.env.example`](./.env.example)).
Enable Maps JavaScript API, Geocoding API, and Directions API (Legacy) in the
associated Google Cloud project and configure billing. The server returns this browser key
to the pages; it is not a server secret. Restrict the key to your exact website
referrers and the required APIs. Do not paste the key into customer-side code.

## Rider phone

1. Serve the site and backend over HTTPS. Browsers only provide device GPS on
   HTTPS (or localhost during development); a public HTTPS host is required for
   customer phones to receive live updates.
2. Sign in on the rider's phone with a staff or admin account.
3. Open Staff → Delivery Tracking. For each order, confirm each step with the
   button shown: `Pending` → `Confirmed` → `Preparing` → `Out for Delivery`.
   Only advance an order when that step is complete; each change is saved to
   MySQL and shown to the customer. GCash orders cannot be confirmed until
   their payment status is `Paid`.
4. After the order is handed to the rider, press **Start GPS Sharing** and
   allow location access. Keep the page open during delivery, then press
   **Stop GPS Sharing**.

Only staff and admin accounts can change these statuses. The API enforces the
sequential transitions and only accepts GPS updates once an order is `Out for
Delivery`.

My Orders refreshes the authenticated customer's live location every few
seconds and displays the road route and a driving-time estimate. Customers must
be signed in to the account that placed the order. Location is saved as the
latest fix only; stopping GPS sharing deletes it. No location history is kept.

Mobile browsers may pause GPS when the page is backgrounded or the phone is
locked. This browser-based setup is not a substitute for a native app that can
reliably track in the background.
