# ParkEase

**Smart Mall Parking Intelligence System**
Book smarter. Enter faster. Park better.

ParkEase is a mall parking management project. This repository contains the MERN foundation and authentication and owner account approval. Approved malls support parking discovery and published bay inventory. Drivers can reserve parking by time window and cancel before arrival. Drivers can generate expiring QR passes; assigned guards verify and confirm entry/exit, and completed visits produce actual-time bills. Owners and admins can review reservation registers, gate history, and analytics.

## Tech stack

- MongoDB — database; Mongoose — JavaScript connection layer.
- Express.js — REST API.
- React.js with Vite — browser UI and development server.
- Node.js — JavaScript backend runtime.
- Plain CSS and JavaScript throughout; authentication models and utilities live in the server workspace.

## Architecture

```text
React Frontend :5173
      ↓ fetch GET /api/health
Express REST API :5001
      ↓ Routes → Controllers
Business Logic (future services)
      ↓ Mongoose
MongoDB
```

The server connects to MongoDB before accepting requests. The health endpoint reports API liveness; it does not query parking data or check ongoing database readiness.

## Project structure

```text
ParkEase/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/    # Navbar, Footer, FeatureCard, PageContainer
│   │   ├── pages/         # Home, Login, Register, Dashboard, NotFound
│   │   ├── services/      # Central fetch helper
│   │   ├── utils/         # Reserved for future shared helpers
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── src/
│   │   ├── config/db.js
│   │   ├── constants/roles.js
│   │   ├── controllers/healthController.js
│   │   ├── middleware/   # JSON 404 and centralized errors
│   │   ├── models/       # User and RefreshToken schemas
│   │   ├── routes/
│   │   ├── services/     # No feature logic yet
│   │   ├── utils/
│   │   ├── app.js        # Express configuration
│   │   └── server.js     # Environment, DB connection, listener
│   ├── test/app.test.js
│   ├── .env.example
│   └── package.json
├── .gitignore
├── eslint.config.mjs
├── package-lock.json
├── package.json
└── README.md
```

Empty reserved folders contain `.gitkeep` so teammates receive the same structure.

## Local setup

Install Node.js **22.12 or newer** and npm. Start a local MongoDB replica set (see [replica set setup](docs/MILESTONE_1_PLAN.md#3-required-environment-variables--local-mongodb-replica-set-setup)) or use a transaction-capable Atlas deployment. Registration and refresh session changes use transactions.

```bash
git clone https://github.com/oceankumar/ParkEase.git
cd ParkEase
npm run install-all
cp client/.env.example client/.env
cp server/.env.example server/.env
```

On Windows, copy the example files using your editor or `Copy-Item` in PowerShell.

`client/.env`:

```dotenv
VITE_API_URL=http://localhost:5001/api
```

`server/.env`:

```dotenv
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/parkease?replicaSet=rs0
CLIENT_URL=http://localhost:5173
JWT_ACCESS_SECRET=replace-with-a-random-32-byte-secret
```

Set `JWT_ACCESS_SECRET` to a generated secret of at least 32 bytes before calling the auth APIs. Replace `MONGODB_URI` with your Atlas URI if applicable. Never commit credentials or `.env` files. Variables prefixed with `VITE_` are public browser configuration and must never hold secrets. Restart development servers after changing environment files.

With MongoDB running:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5001
- Health API: http://localhost:5001/api/health

The frontend shows **API Connected** after a successful health request, or **Backend unavailable** if it cannot reach the API within five seconds. This indicator checks once on page load; reload after starting the backend. The parking illustration is conceptual and contains no live availability data.

If MongoDB cannot connect, the backend exits with a safe startup error. Check MongoDB is running, the URI is valid, and Atlas network access permits your machine. No credentials are printed. The frontend can be started separately while the database is unavailable.

The frontend defaults to port `5001` for the API. If you use a different backend port, update `VITE_API_URL` in `client/.env` and restart Vite. Open the frontend at `http://localhost:5173` to match the default `CLIENT_URL` used for cookie requests.

## Scripts

| Command                        | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `npm run install-all`          | Install root, client, and server dependencies using npm workspaces |
| `npm run dev`                  | Run Vite and Express/nodemon together                              |
| `npm run client`               | Run only the frontend                                              |
| `npm run server`               | Run only the backend watcher                                       |
| `npm run build`                | Build the frontend into `client/dist`                              |
| `npm run test:client`          | Run client service, rendering, and DOM interaction tests           |
| `npm run lint`                 | Check JavaScript and React hooks                                   |
| `npm test`                     | Run backend checks; set AUTH_TEST_MONGODB_URI for integration tests           |
| `npm start --workspace server` | Start the backend without the watcher                              |

One root lockfile tracks all workspaces. For repeatable installs after cloning, `npm ci` is also supported. Run dependency installation from the root. The backend loads `server/.env` because its workspace scripts run from `server/`.

## Current pages and API

- `/` — responsive home page and an illustrated parking journey.
- `/login`, `/register` — sign in or register as a driver or mall owner.
- `/dashboard` — requires sign-in and displays the team’s driver dashboard or the signed-in role’s account view. Admins can approve or reject pending owners and suspend active owners. Approved owners can submit mall profiles and see their status under **My malls**. Admins review pending mall profiles under **Mall submissions**.
- Drivers can check a time window on a published parking map, reserve a matching bay, and review or cancel it under **My bookings**. Mall hours and reservation times use IST.
- Owners can open **My malls → Manage parking layout** on an approved mall, build rows, save a draft, and publish. The **Published bays** tab handles maintenance and reopening separately.
- `/malls`, mall details, and parking availability — discovery and profile screens show approved mall profiles. Drivers can browse published floor layouts and see which bays are available or under maintenance.
- `/dashboard/bookings/:id` — driver reservation details, ten-second status refresh, expiring entry/exit QR passes, a manual credential fallback, cancellation before arrival, and the final bill link after exit.
- `/dashboard/operations` — assigned guards choose a mall, scan a QR or paste a manual credential, verify the vehicle, and explicitly confirm entry/exit. Temporary-password guards are sent to their profile first.
- `/dashboard/activity` — guard gate history, action filters, and cursor pagination.
- `/dashboard/reservations`, `/dashboard/gate-activity` — owner/admin reservation register and gate history with mall selection; reservation filters include vehicle/bay, lifecycle status, and IST arrival dates.
- `/dashboard/analytics`, `/dashboard/guards`, `/dashboard/profile` — reporting, guard assignment management, and account settings.
- Other browser paths — friendly not-found page.

The liveness endpoint is:

```http
GET /api/health
```

```json
{ "success": true, "message": "ParkEase API is running" }
```

Unknown API routes return JSON with HTTP 404. Malformed JSON returns HTTP 400; unexpected errors return a generic HTTP 500 response without internal details. CORS uses `CLIENT_URL` (default `http://localhost:5173`). The authentication APIs are `POST /api/auth/register`, `/login`, `/refresh`, and `/logout`, and `GET /api/auth/me`. Use the bearer access token with `/me`. Send the refresh cookie with requests to `/refresh` and `/logout`, along with the configured `Origin` and `X-Requested-With: XMLHttpRequest`. Logout revokes the refresh family. Existing access tokens expire on their normal schedule after logout. A password change increments the account session version and immediately rejects existing access tokens, as well as revoking refresh sessions.

To create the initial Admin, set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` in `server/.env`. Set `ADMIN_NAME` optionally, then run:

```bash
npm run seed:admin --workspace server
```

Log in with that account and use its bearer token with `GET /api/admin/mall-owners?status=PENDING_APPROVAL` and `PATCH /api/admin/mall-owners/:userId/status`. Send `{ "status": "ACTIVE" }` to approve a pending owner, `{ "status": "REJECTED", "rejectionReason": "..." }` to reject a pending owner, or `{ "status": "SUSPENDED" }` to suspend an active owner.

The database integration test runs when `AUTH_TEST_MONGODB_URI` is set before `npm test`. Use an isolated replica set with permission to create and drop the randomly named test database.

## Dependencies

Runtime: `qrcode` creates pass images locally and `@zxing/browser` provides camera QR decoding (loaded on demand); `react` and `react-dom` render the UI; `react-router-dom` handles pages; `express` handles HTTP requests; `mongoose` connects to MongoDB; `cors` configures browser origins; `dotenv` loads local backend configuration.

Development: `vite` and `@vitejs/plugin-react` serve/build React; `nodemon` restarts the backend; `concurrently` runs both processes; `eslint`, `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` check code and React usage. Tests use Node's built-in test runner; client interaction tests use `jsdom` and React Testing Library. Physical camera scanning still requires a device check.

## Team development

Four developers will build on this foundation. Feature ownership will be agreed after this stage; nobody has been assigned a module yet.

```text
main
feature/<feature-name>
```

Create a feature branch from the latest `main`, keep changes focused, run lint/build/tests, and merge through a reviewed pull request. Discuss shared route names, model fields, and status transitions before implementing modules to reduce conflicts.

## Parking visit verification

1. As an approved owner, publish a parking layout and create or assign a guard under **Guards**.
2. A newly created guard signs in and changes their temporary password under **Profile**, then signs in again.
3. As a driver, check availability and reserve a bay. Open **My bookings → Open details**.
4. At the scheduled arrival time, generate an entry pass. Show the QR to the guard, or reveal the manual credential if the camera is unavailable.
5. The assigned guard selects the correct mall and **Entry**, verifies the credential, matches the vehicle and bay, then confirms. Verification alone makes no gate change.
6. The driver refreshes their booking or waits up to ten seconds to see **ACTIVE**, then generates an exit pass when leaving.
7. The guard selects **Exit**, verifies and confirms. The driver can then open or print the final bill; the owner can inspect the visit in **Reservations** and **Gate activity**.

QR credentials stay in page memory, are not sent to third-party QR services, and disappear on navigation/reload. A replacement invalidates the old pass. The server remains authoritative about expiry, eligibility, assignment, and consumption. Camera access starts only after choosing **Scan QR with camera**; it needs browser permission and HTTPS or localhost. Manual credentials support browsers/devices without a usable camera.

An uncertain gate confirmation keeps its operation ID for the same retry while the console stays open. Retry before switching pages; if the page was closed, check recent activity and the driver's booking before attempting another gate action. Gate history is mall-scoped. Final bills record amounts owed; they do not collect or record payment.

## Remaining work

Analytics visual polish, broader device and browser automation, CI, deployment/monitoring and backup runbooks, password recovery, and repository cleanup remain. Payment collection, notifications, waitlists, AI floor-plan recognition, indoor routing, dynamic pricing, and prediction are separate future features. Published parking layouts are schematic bay views, not turn-by-turn navigation maps.

## Deployment note

The repository includes a combined Render web-service configuration in `render.yaml`. Express serves the production React build and `/api` on one HTTPS origin; MongoDB Atlas provides persistent storage. See [the deployment guide](docs/DEPLOYMENT.md) for environment variables, admin bootstrap, network access, free-demo limits, and verification. Run `node scripts/check-deployment.mjs https://YOUR-SERVICE.onrender.com` after deployment.
