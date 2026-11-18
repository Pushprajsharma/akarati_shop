# Aakarati Mobile — Next.js + MongoDB

A single-admin customer khata/passbook and invoice application.

## Features
- Admin login with an HTTP-only signed session cookie.
- Customer create, search and passbook.
- Manual debit and credit entries.
- Invoice creation with multiple line items.
- Paid invoices generate a debit and matching credit.
- Unpaid invoices generate a debit only.
- Invoice history filtered by customer.
- Printable invoice page with historical previous/closing balance snapshots.
- MongoDB indexes.

## Requirements
- Node.js 20.9 or newer
- MongoDB Atlas (recommended) or a MongoDB replica set
- npm

## Setup

1. Extract the ZIP.
2. Open the extracted folder in VS Code.
3. Install packages:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env.local`.
5. Fill in:
   - `MONGODB_URI`
   - `MONGODB_DB`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `AUTH_SECRET` (at least 32 characters)
   - `APP_URL`

6. Start development:

   ```bash
   npm run dev
   ```

7. Open http://localhost:3000/login and sign in using the admin credentials.

8. Build for production:

   ```bash
   npm run build
   npm start
   ```

## MongoDB collections

Collections are created automatically when the first documents are inserted:
- `customers`
- `transactions`
- `invoices`

Invoice line items are embedded in each invoice document (`items` array). This keeps invoice header and item details together. Transactions remain in their own collection.

Indexes are created automatically by the database helper when the application first connects.

## Important: MongoDB transactions

Invoice creation uses a MongoDB multi-document transaction so the invoice and its passbook entries are committed together. MongoDB transactions require a replica set or sharded cluster. MongoDB Atlas supports this. A standalone local `mongod` server does not support transactions; use an Atlas cluster or configure a local single-node replica set.

## Accounting rules

Balance = opening balance + debit entries - credit entries.

- Unpaid invoice: one DEBIT for the invoice total; balance increases.
- Paid invoice: one DEBIT and one CREDIT for the invoice total; balance is unchanged.
- A payment on an older outstanding invoice should be entered as a manual CREDIT transaction. Do not mark a new invoice as paid to settle old debt.

## Security notes

- Change the sample admin credentials and generate a unique AUTH_SECRET.
- Keep `.env.local` out of Git.
- Keep the MongoDB database user least-privileged.
- Use HTTPS in production.
- This starter is designed for one trusted admin. It does not yet implement multi-user roles, audit log exports, invoice cancellation/reversal, GST calculations, or payment gateway integration.
- Add rate limiting and password hashing / an external identity provider before exposing login publicly.

## Routes

- `/login`
- `/customers`
- `/customers/[id]`
- `/invoices`
- `/invoice/[id]`

API routes are under `/api`.
