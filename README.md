# Ledger OnBoard

A web-based boarding house discovery, rental ledger, and business analytics platform for Dagupan City, Pangasinan.

The project has two parts:

- `backend/` — REST API (Node.js, Express, MongoDB/Mongoose)
- `frontend/` — single-page app (React, Vite, Tailwind CSS)

## Main features

- **Tenants** — browse and filter approved boarding houses on a card grid and a Leaflet map, view property details, reserve a room, view statements of account, and pay (cash or GCash proof upload).
- **Landlords** — submit business verification documents (Mayor's/Business Permit, BIR Form 2303), publish properties with photos and an optional video once verified, manage rooms and reservations, invite caretakers, verify payments, and view analytics (occupancy, collection rate, outstanding balances).
- **Caretakers** — activate their account from an emailed invitation, view assigned rooms, log utility readings, and record cash payments.
- **Admins** — review landlord business verification, manage user accounts, moderate reviews, and view audit logs.
- **Accounts & security** — email OTP verification at registration, optional email OTP login (MFA), password reset by email code, password strength indicator, role-based access control, rate limiting, and automatic archiving of accounts inactive for 30 days (with a warning at day 25 and a recovery flow).

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, React Router, Axios, Leaflet / react-leaflet, Recharts |
| Backend | Node.js, Express 4, Mongoose 8, JSON Web Tokens, express-validator, multer, nodemailer, node-cron |
| Database | MongoDB (local or MongoDB Atlas) |
| Testing | Jest + Supertest + mongodb-memory-server (backend), Vitest + Testing Library (frontend) |

## Prerequisites

- Node.js 20 or newer, and npm
- A MongoDB database — a local `mongod` or a MongoDB Atlas cluster

## Setup

```bash
# Backend
cd backend
npm install
cp .env.example .env      # then edit .env (see below)

# Frontend
cd ../frontend
npm install
```

### Environment variables (`backend/.env`)

`backend/.env.example` lists every variable with comments. The important ones:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long random strings used to sign access and refresh tokens |
| `CLIENT_ORIGIN` | Frontend URL allowed by CORS (default `http://localhost:5173`) |
| `EMAIL_TRANSPORT` | `console` prints emails (OTP codes, invitations) in the backend terminal; any other value sends real email using the `SMTP_*` settings |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing email settings (for Gmail, use an App Password) |
| `ACCOUNT_ARCHIVE_WARNING_DAYS`, `ACCOUNT_ARCHIVE_DAYS`, `ACCOUNT_LIFECYCLE_CRON` | Inactivity warning/archive thresholds and the daily job schedule |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `MAX_VIDEO_UPLOAD_MB` | Upload folder and size limits |

Never commit `backend/.env`; it is excluded by `.gitignore`.

The frontend needs no environment file for local development: the Vite dev server proxies `/api` and `/uploads` to `http://localhost:5000`.

## Running the app

Open two terminals:

```bash
# Terminal 1 — API on http://localhost:5000
cd backend
npm run dev

# Terminal 2 — web app on http://localhost:5173
cd frontend
npm run dev
```

### Demo data (optional)

```bash
cd backend
npm run seed
```

This creates one account per role — `ledgeronboard@gmail.com` (admin), `demo.landlord@gmail.com`, `demo.tenant@gmail.com`, `demo.caretaker@gmail.com` — plus a sample approved property. The seed script prints the shared demo password; it is for local development only.

## Running tests

```bash
# Backend: end-to-end API tests against an in-memory MongoDB (no database setup needed)
cd backend
npm test

# Frontend: component and page tests
cd frontend
npm test
```

Other frontend commands: `npm run build` (production build to `frontend/dist`) and `npm run lint`.

## Project structure

The backend follows a layered architecture: **Route → Controller → Service → Repository → Model**.

| Folder | Contents |
|---|---|
| `backend/routes/` | Route definitions and middleware for each resource, combined in `routes/index.js` |
| `backend/controllers/` | Map HTTP requests to service calls (no business logic) |
| `backend/services/` | Business rules and workflows (billing, utilities, analytics, verification, email, …) |
| `backend/repositories/` | Database queries — the only layer that uses Mongoose models |
| `backend/models/` | Mongoose schemas |
| `backend/validators/` | express-validator rules for request input |
| `backend/middleware/` | Authentication, role checks, rate limiting, uploads, error handling |
| `backend/jobs/` | Scheduled account-inactivity job |
| `backend/tests/` | End-to-end API tests |
| `frontend/src/views/` | Pages, grouped by role (`public`, `auth`, `tenant`, `landlord`, `caretaker`, `admin`) |
| `frontend/src/components/` | Shared UI components (map, property cards, forms, layout) |
| `frontend/src/services/` | API clients, one per resource |
| `frontend/src/context/` | Authentication and notification state |
| `frontend/src/routes/` | Role-based route guards and redirects |

## Security notes

- Passwords are hashed with bcrypt; refresh tokens are stored only as hashes and revoked on logout and password change.
- Every protected API route checks the user's role on the server, and the user's account status is re-checked on each request.
- All request input is validated, and `helmet` and `express-mongo-sanitize` are applied globally.
- Landlord verification documents and payment proof images are never publicly served; they are only available through authenticated, ownership-checked routes.
- Registration requires Privacy Policy consent, which is recorded with a timestamp.

## Deployment notes

- Serve the API behind HTTPS (a reverse proxy or your hosting platform's TLS) and set `CLIENT_ORIGIN` to the frontend's HTTPS URL.
- Use a MongoDB user limited to this application's database.
- Uploaded files are stored on local disk in `backend/uploads/`; a multi-server deployment would need shared or object storage.
