# ParkEase

**Smart Mall Parking Intelligence System**
Book smarter. Enter faster. Park better.

ParkEase is a four-person college project. This repository currently contains only the shared MERN foundation. Parking discovery, reservations, QR verification, billing, and analytics are **planned**, not implemented.

## Tech stack

- MongoDB — database; Mongoose — JavaScript connection layer.
- Express.js — REST API.
- React.js with Vite — browser UI and development server.
- Node.js — JavaScript backend runtime.
- Plain CSS and JavaScript throughout; no authentication or business schemas yet.

## Architecture

```text
React Frontend :5173
      ↓ fetch GET /api/health
Express REST API :5000
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
│   │   ├── models/       # No schemas yet
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

Install Node.js **22.12 or newer** and npm. Start a local MongoDB service, or prepare a MongoDB Atlas URI with network access configured.

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
VITE_API_URL=http://localhost:5000/api
```

`server/.env`:

```dotenv
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/parkease
CLIENT_URL=http://localhost:5173
```

Replace `MONGODB_URI` with your own Atlas URI if needed. Never commit credentials or `.env` files. Variables prefixed with `VITE_` are public browser configuration and must never hold secrets. Restart development servers after changing environment files.

With MongoDB running:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health API: http://localhost:5000/api/health

The frontend shows **API Connected** after a successful health request, or **Backend unavailable** if it cannot reach the API within five seconds. This indicator checks once on page load; reload after starting the backend. The parking illustration is conceptual and contains no live availability data.

If MongoDB cannot connect, the backend exits with a safe startup error. Check MongoDB is running, the URI is valid, and Atlas network access permits your machine. No credentials are printed. The frontend can be started separately while the database is unavailable.

On macOS, AirPlay may already use port `5000`. If so, set `PORT=5001` in `server/.env` and `VITE_API_URL=http://localhost:5001/api` in `client/.env`, then restart both servers.

## Scripts

| Command                        | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `npm run install-all`          | Install root, client, and server dependencies using npm workspaces |
| `npm run dev`                  | Run Vite and Express/nodemon together                              |
| `npm run client`               | Run only the frontend                                              |
| `npm run server`               | Run only the backend watcher                                       |
| `npm run build`                | Build the frontend into `client/dist`                              |
| `npm run lint`                 | Check JavaScript and React hooks                                   |
| `npm test`                     | Run backend API and configuration checks without MongoDB           |
| `npm start --workspace server` | Start the backend without the watcher                              |

One root lockfile tracks all workspaces. For repeatable installs after cloning, `npm ci` is also supported. Run dependency installation from the root. The backend loads `server/.env` because its workspace scripts run from `server/`.

## Current pages and API

- `/` — responsive home page, planned feature cards, real API status.
- `/login`, `/register` — explanatory placeholders, no account handling.
- `/dashboard` — public placeholder, no role checks or private data.
- Other browser paths — friendly not-found page.

Only one API is implemented:

```http
GET /api/health
```

```json
{ "success": true, "message": "ParkEase API is running" }
```

Unknown API routes return JSON with HTTP 404. Malformed JSON returns HTTP 400; unexpected errors return a generic HTTP 500 response without internal details. CORS uses `CLIENT_URL` (default `http://localhost:5173`). CORS controls browser access; authentication will be implemented later.

## Dependencies

Runtime: `react` and `react-dom` render the UI; `react-router-dom` handles pages; `express` handles HTTP requests; `mongoose` connects to MongoDB; `cors` configures browser origins; `dotenv` loads local backend configuration.

Development: `vite` and `@vitejs/plugin-react` serve/build React; `nodemon` restarts the backend; `concurrently` runs both processes; `eslint`, `@eslint/js`, `globals`, `eslint-plugin-react-hooks`, and `eslint-plugin-react-refresh` check code and React usage. Tests use Node's built-in test runner, with no test library dependency.

## Team development

Four developers will build on this foundation. Feature ownership will be agreed after this stage; nobody has been assigned a module yet.

```text
main
feature/<feature-name>
```

Create a feature branch from the latest `main`, keep changes focused, run lint/build/tests, and merge through a reviewed pull request. Discuss shared route names, model fields, and status transitions before implementing modules to reduce conflicts.

## Intentionally deferred

Authentication, password hashing, JWTs, RBAC, user/mall/slot/booking schemas, mall approval, slot CRUD, atomic allocation, reservations, QR generation/scanning, entry/exit, expiry jobs, billing, owner/admin dashboards, analytics, waitlist, payments, notifications, maps, pricing, and prediction are not implemented. `ROLES` establishes naming only: `USER`, `MALL_OWNER`, `GUARD`, `ADMIN`.

## Recommended next stage (proposal only)

Agree API contracts and entity/state definitions together, then divide feature work into four logical modules:

1. **Identity and access:** authentication, accounts, RBAC, protected frontend routes.
2. **Mall and parking inventory:** mall management/approval, slots, owner/admin management views.
3. **Reservation lifecycle:** availability, atomic allocation, bookings, cancellation, expiry.
4. **Parking operations:** QR state validation, guard entry/exit, actual-time billing, occupancy/revenue reporting.

Dependencies should be staged: shared models and authentication first, then inventory and reservations, then operational workflows. This is a proposal, not implemented scope or an assignment to individual members.

## Deployment note

Deployment is outside this stage. A future static host must send React page routes to `index.html`; configure the real API URL and allowed frontend origin when deploying.
