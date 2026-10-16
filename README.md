# Ledger OnBoard

A web-based boarding house discovery, rental ledger, and business analytics platform for Dagupan City, Pangasinan.

The project has two parts:

- `backend/` — REST API (Node.js, Express, MongoDB/Mongoose)
- `frontend/` — single-page app (React, Vite, Tailwind CSS)

## Main features

- **Student tenants** — browse and filter approved boarding houses on a card grid and a Leaflet map, view property details, verify their school ID, reserve a room, view statements of account, and pay (cash or GCash proof upload). Reserving needs an admin-approved school ID (front and back photos, the school, and the years printed on it); an ID printed "2024–2028" counts until May 31, 2028 (Manila time), after which the student uploads their current ID before reserving again. Current stays are not affected. The photos are private to the student and admins; landlords see only the school and until when the ID counts.
- **Landlords** — submit business verification documents (Mayor's/Business Permit, BIR Form 2303), publish properties with photos and an optional video once verified, manage rooms and reservations, invite caretakers, verify payments, and view analytics (occupancy, collection rate, outstanding balances).
- **Caretakers** — activate their account with a one-time code from their landlord (no email or shared password), view assigned rooms, log utility readings, and record cash payments.
- **Admins** — review landlord business documents and student school IDs (one Verifications page, two tabs), manage user accounts, moderate reviews, and view audit logs.
- **Accounts & security** — no email needed for any account flow: optional authenticator-app two-factor sign-in with backup codes, password reset with an authenticator, backup or admin-issued code, caretaker activation codes, password strength indicator, role-based access control, rate limiting, and automatic archiving of accounts inactive for 30 days with self-service recovery (see [How accounts work](#how-accounts-work-no-email)).

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
| `CLIENT_ORIGIN` | Frontend URL(s) allowed by CORS, comma-separated (default `http://localhost:5173`) |
| `EMAIL_APP_URL` | Public frontend URL for email links, e.g. `https://ledger-onboard.vercel.app`; defaults to the first `CLIENT_ORIGIN` when unset |
| `EMAIL_TRANSPORT` | `none` sends nothing (what the deployed app uses; no account flow needs email); `console` prints emails in the backend terminal; `smtp` sends real email using the `SMTP_*` settings; `brevo` sends through Brevo's HTTPS API. Any other value stops the server at startup |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Outgoing email settings, only for `smtp` (for Gmail, use an App Password) |
| `BREVO_API_KEY` | Brevo API key, used only when `EMAIL_TRANSPORT=brevo` |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Used only when `EMAIL_TRANSPORT=gmail`: sends through the Gmail API over HTTPS (works on Render free and Railway trial/Hobby, which block SMTP). `EMAIL_FROM` must be the same Gmail address. Setup is under "Email (optional)" |
| `MFA_ENCRYPTION_KEY` | 32 random bytes, base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Encrypts two-factor secrets and keys the backup-code hashes; required in production, where the server refuses to start without it. Losing or changing it breaks every authenticator setup and makes every backup code useless, so everyone must set up two-factor again |
| `EMAIL_VERIFICATION_REQUIRED` | `false` (default): no sign-up code is sent, and new accounts can sign in as soon as they are created; `true`: a code is emailed and sign-in waits until it is entered, so never use `true` together with `EMAIL_TRANSPORT=none`. Any other value stops the server at startup |
| `EMAIL_ACCOUNT_FLOWS_ENABLED` | `true`: password-reset codes, email two-factor codes, inbox confirmation and caretaker invitations are emailed; `false` (default): those flows use only authenticator, backup and administrator codes |
| `EMAIL_MFA_ENROLLMENT_ENABLED` | `true` (default): users may turn on email two-factor (also needs `EMAIL_ACCOUNT_FLOWS_ENABLED=true`); `false`: new enrollments are closed, existing ones keep working |
| `MAIN_ADMIN_EMAIL` | The main admin account (default `ledgeronboard@gmail.com`; it must have the admin role). Only the main admin can add admins and suspend, deactivate, reactivate or issue reset codes for other admins; no one can change the main admin through the admin pages |
| `EMAIL_TIMEOUT_MS` | How long a single email send may take before it fails with an error (default 10000), so a blocked mail server can't hang registration |
| `ACCOUNT_ARCHIVE_WARNING_DAYS`, `ACCOUNT_ARCHIVE_DAYS`, `ACCOUNT_LIFECYCLE_CRON` | Inactivity warning/archive thresholds and the daily job schedule |
| `MAX_UPLOAD_MB`, `MAX_VIDEO_UPLOAD_MB` | Upload size limits (photos/documents, video) |
| `UPLOAD_DIR` | Source folder for `npm run migrate:uploads` (old on-disk uploads); uploads themselves are stored in MongoDB |
| `SEED_DEMO_PASSWORD` | First password of the main admin account created by `npm run seed` (strong password required; never commit it) |

Never commit `backend/.env`; it is excluded by `.gitignore`.

### Email (optional)

Every flow works without email. With a real transport (`brevo` or `smtp`), important notifications are also emailed: reservation requests and decisions, move-out requests, new bills and both bill reminders, payment submissions and results, caretaker assignments, business verification results, and the inactivity warning and archive notice. Other notifications (maintenance, reviews, move-in confirmations, admin alerts) stay in-app only, to keep volume low. The list is `EMAILED_TYPES` in `backend/services/NotificationService.js`. Routine emails carry a one-click unsubscribe header and link (Gmail and Yahoo expect this); set `PUBLIC_API_URL` to the backend's public URL, or leave it unset on Render, which provides `RENDER_EXTERNAL_URL`. Email only goes to a confirmed inbox: one where the user has entered an emailed code (sign-up verification, email two-factor, an emailed reset code, or the one-time confirmation in Profile → Email notifications). It is on by default once confirmed. In Profile → Email notifications, users can turn it off or untick categories that suit their role (reservations, bills, payments, business verification, property assignments; see `backend/utils/emailCategories.js`); in-app notifications are unaffected. Password-change and two-factor-off notices go to confirmed inboxes even when routine email is off. Set `EMAIL_APP_URL` to the public frontend URL so email buttons point at the deployed app.

Edit wording in `backend/services/EmailService.js` and the shared colors, spacing, and layout in `backend/utils/emailTemplate.js`. Emails include inline HTML styles and a plain-text alternative. Names, reasons, codes, and URLs are escaped before being inserted into HTML.

To preview all templates locally with sample data (no email is sent):

```bash
cd backend
npm run preview:emails
```

Open any of the generated HTML files in `backend/.email-previews/` in a browser. Browser previews show the layout; Gmail may adjust colors in dark mode.

The frontend needs no environment file for local development: the Vite dev server proxies `/api` and `/uploads` to `http://localhost:5000`. For a deployed build, set `VITE_API_URL` to the backend origin (see `frontend/.env.example`), e.g. `https://ledger-onboard-backend.onrender.com`.

**Sending through Gmail without SMTP (`EMAIL_TRANSPORT=gmail`):**
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Gmail API**.
2. **OAuth consent screen:** External; add the Gmail address as a test user, then **Publish app** (In production). Unpublished apps' refresh tokens expire after 7 days.
3. **Credentials → Create credentials → OAuth client ID → Web application**, with the authorized redirect URI `https://developers.google.com/oauthplayground`. Copy the client ID and secret.
4. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), click the gear, tick **Use your own OAuth credentials** and paste them. In step 1 enter the scope `https://www.googleapis.com/auth/gmail.send`, authorize with the sending Gmail account (accept the "unverified app" warning; it is your own app), then **Exchange authorization code for tokens** and copy the refresh token.
5. Set `EMAIL_TRANSPORT=gmail`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and `EMAIL_FROM=Ledger OnBoard <that Gmail address>` on the server, then use **Profile → Email delivery check** (main admin) to confirm. Gmail allows about 500 emails a day.

## How accounts work (no email)

- **Sign-up:** tenants and landlords register, then go to the sign-in form, which says the account was created; they sign in with their email and password. No code is sent.
- **Two-factor sign-in (optional):** in Profile, scan the QR code with an authenticator app (Google or Microsoft Authenticator) and confirm with a 6-digit code. You get 10 one-time backup codes (`XXXXX-XXXXX`), shown once. Sign-in then asks for an app code or a backup code; 5 wrong codes lock code entry for 15 minutes.
- **Forgot password:** enter your email and choose "Send recovery code"; when email is set up, a 6-digit code is emailed (valid `OTP_TTL_MINUTES`, default 10). On the next page, enter that code and a new password. An authenticator code, a backup code, or a reset code from an administrator (`XXXX-XXXX`, valid 30 minutes, once) also works there. Admins create reset codes in Users after confirming the person's identity in person. A reset signs out every device.
- **Change password:** in Profile, with the current password (plus an app or backup code when two-factor is on). Every other device is signed out.
- **Archived accounts:** accounts inactive for 30 days are archived (admins never are). "Recover an archived account" takes the email, the same kinds of code as a reset, and a new password. A password reset also restores an archived account.
- **Main admin:** the admin account named by `MAIN_ADMIN_EMAIL` (default `ledgeronboard@gmail.com`). Only it can add admins (each gets a one-time setup code to use under "Forgot password?") and suspend, deactivate, archive or issue reset codes for other admins. No one can change the main admin through the admin pages.
- **Admin Archive (deleting accounts):** in Users, any admin can "Move to archive" (a reason is required). The account is signed out and blocked at once and listed under the Archive tab, where any admin can restore it to its previous status. After 30 days the daily job deletes it; the main admin can also "Delete now". Deleting erases the name, email (freeing it for a new sign-up), phone, photo, emergency contact, GCash QR, verification documents, notifications and sign-in data, and removes the email from earlier audit entries; bills, payments, reservations and reviews stay, shown as "Deleted user". Tenants and landlords with pending, approved or current reservations can't be archived until those are closed. The person is emailed when their account is closed (with the reason, the deletion date and the main admin's email to contact) and again just before it is deleted; signing in to a closed account shows the same details. These account notices, like the inactivity warning and archive notice, go to the account's email even if email notifications are off.
- **Caretakers:** a landlord invites a caretaker, and the one-time activation code (`XXXXX-XXXXX`, valid 72 hours) is emailed to the caretaker; the landlord never sees it and is told "Invitation has been sent". "Send new code" emails a fresh code and voids the old one. The email's button opens the sign-in page, where the caretaker clicks "Activate a caretaker account" and enters their email, the code and a new password. Until then they can't sign in, and an admin can't activate them. If the invitation email can't be sent, the landlord sees an error and can try "Send new code" again (the API returns the code only in that case).

## Local admin scripts

Both scripts run on your own computer against the database, need only `MONGODB_URI`, never print it, and refuse to run outside an interactive terminal (use PowerShell or Windows Terminal, not Git Bash). Against MongoDB Atlas, your IP address must be allowed under Network Access.

Set the connection string for the current PowerShell window without it showing on screen or in history:

```powershell
cd backend
$s = Read-Host "Paste MONGODB_URI" -AsSecureString
$env:MONGODB_URI = [System.Net.NetworkCredential]::new('', $s).Password
```

- **Give one account a new password** (for example, a locked-out admin): `npm run password:reset -- --email someone@gmail.com`. It asks you to type YES, then for the new password twice at a hidden prompt, signs the account out everywhere and writes an audit entry.
- **One-time migration after the email codes were retired:** `npm run migrate:retire-email-otp -- --dry-run` shows counts only and changes nothing; without `--dry-run` it shows the same counts and asks for YES. It turns off old email two-factor, marks unverified accounts verified, and makes any saved copy of the old shared caretaker password unusable. It deletes nothing, sends no email, writes an audit entry per changed account, and a second run changes nothing. Back up the `users` collection first (for example with MongoDB Compass: Export Data, full collection, JSON).

When you are done, run `Remove-Item Env:MONGODB_URI`, close the window, and remove your IP from Atlas Network Access if you added it.

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

### Main admin account (new databases)

```bash
cd backend
npm run seed
```

This creates the main admin account (`MAIN_ADMIN_EMAIL`, default `ledgeronboard@gmail.com`) if the database doesn't have it yet, with the password set in `SEED_DEMO_PASSWORD` (backend `.env`); change it after signing in. An existing admin is left unchanged. There are no demo accounts: tenants and landlords register through the app with their own Gmail, and landlords invite their caretakers, so nothing the app sends goes to an inbox nobody owns.

### Moving old uploads into MongoDB (one time)

Uploaded files are stored in MongoDB GridFS. If you have files from before that change in `backend/uploads/`, copy them in with:

```bash
cd backend
npm run migrate:uploads
```

It keeps the same filenames, skips files already copied, and deletes nothing from disk.

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

- Passwords are hashed with bcrypt; refresh tokens are stored only as hashes. Each account has a session version that every token carries: a password reset or change, suspension, deactivation or archiving raises it and signs the account out everywhere.
- One-time codes (admin reset codes, activation codes) are stored only as hashes and work once; authenticator secrets are encrypted with `MFA_ENCRYPTION_KEY`, and backup codes are stored as keyed hashes. Code-only requests (reset, recovery, activation) give one generic error and have their own failure limits.
- Every protected API route checks the user's role on the server, and the user's account status is re-checked on each request.
- All request input is validated, and `helmet` and `express-mongo-sanitize` are applied globally.
- Landlord verification documents and payment proof images are never publicly served; they are only available through authenticated, ownership-checked routes.
- Registration requires Privacy Policy consent, which is recorded with a timestamp.

## Deployment notes

- Serve the API behind HTTPS (a reverse proxy or your hosting platform's TLS) and set `CLIENT_ORIGIN` to the frontend's HTTPS URL.
- Current setup: frontend on Vercel (`frontend/` with `VITE_API_URL=https://ledger-onboard-backend.onrender.com`; `frontend/vercel.json` rewrites all routes to `index.html`), backend on Render (`npm start`, `NODE_ENV=production`, `CLIENT_ORIGIN` = the Vercel URL, `EMAIL_TRANSPORT=none`, and `MFA_ENCRYPTION_KEY`, without which production refuses to start; keep a private copy of that key).
- Use a MongoDB user limited to this application's database.
- Uploaded files (property photos/videos, payment proofs, business documents) are stored in MongoDB GridFS (bucket `uploads`), so they survive redeploys and restarts. Property media is served publicly at `/uploads/properties/<file>`; payment proofs and business documents are only available through their authenticated routes. They count toward the database's storage quota (512 MB on the Atlas free tier).
