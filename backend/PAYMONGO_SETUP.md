# PayMongo GCash test-mode setup

The customer checkout creates a PayMongo-hosted GCash session on the backend.
The browser is redirected to PayMongo; the success page does not mark an order
paid. Only a valid `checkout_session.payment.paid` webhook updates an order to
`Paid`.

## Prepare the database

Back up the database, inspect the migration, and apply
[`migrations/001_add_paymongo_payment_fields.sql`](./migrations/001_add_paymongo_payment_fields.sql)
to `jolies_pizza` before starting checkout. The migration adds fields to the
existing `customer_orders` table; it does not replace or delete order data.

## Configure the backend

Create `backend/.env` using [`.env.example`](./.env.example) as a template.
Set the database connection values and provide PayMongo **test-mode** values:

- `PAYMONGO_SECRET_KEY` — a test secret key beginning with `sk_test_`.
- `PAYMONGO_WEBHOOK_SECRET` — the signing secret for the webhook endpoint.
- `PORT` — normally `5000` for the current customer pages.
- `APP_BASE_URL` — the public origin serving this application. For deployed
  checkout and webhooks, it must be an HTTPS origin reachable by PayMongo.

Never place PayMongo secrets in customer-side files or commit `backend/.env`.

## Register the webhook

In PayMongo's dashboard, add a webhook at
`https://your-public-host/api/webhooks/paymongo` and subscribe to
`checkout_session.payment.paid`. The handler validates the PayMongo signature,
session ID, order reference, currency, and paid amount before marking an order
paid. Local development requires a public HTTPS tunnel to the backend for
PayMongo to deliver webhook events.

See PayMongo's [Hosted Checkout quick start](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start.md)
for creating sessions, redirecting customers, and configuring the paid event.
