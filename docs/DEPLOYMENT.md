# ParkEase deployment: Render + MongoDB Atlas

The React build and Express API run as one Render Node web service. The browser uses `/api` on the same HTTPS origin, so secure HttpOnly refresh cookies work without third-party-cookie exceptions. MongoDB Atlas stores all persistent application data.

## Hosting configuration

Use the repository root, not `client/` or `server/`, as the Render root directory. Deploy the branch containing the latest workflow/UI changes and `render.yaml`; older `main` does not contain them until the team merges the branch.

| Setting | Value |
| --- | --- |
| Service type | Web service |
| Runtime | Node 24 |
| Plan | Free demo |
| Region | Singapore |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health check | `/api/health/ready` |
| Auto deploy | Off for the first deployment |

`render.yaml` expresses this configuration. Atlas must be set up separately. The Blueprint can generate the JWT secret and prompt for the database connection string. Use a separate ParkEase database and a database user with `readWrite` only on that database. The app creates its collections/indexes at startup and requires replica-set transaction support.

## Environment variables

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `24` |
| `VITE_API_URL` | `/api` — public build setting, not a secret |
| `MONGODB_URI` | Atlas SRV URI with database path `/parkease` and the ParkEase database user's credentials |
| `JWT_ACCESS_SECRET` | Generated random secret, at least 32 bytes |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `BCRYPT_SALT_ROUNDS` | `10` |
| `ENTRY_GRACE_MINUTES` | `15` |
| `QR_TTL_SECONDS` | `300` |
| `EXPIRY_SWEEP_MS` | `30000` |

Render supplies `PORT` and `RENDER_EXTERNAL_URL`. Do not hardcode the port. The frontend origin defaults to `RENDER_EXTERNAL_URL` for CORS and refresh/logout origin validation. If you later add a custom domain, set `CLIENT_URL=https://your-domain.example` with no path or trailing slash and consistently use that hostname.

Enter database credentials and JWT secrets only through secret environment settings. Do not commit `.env` files, put secrets in `VITE_*` variables, or paste them in issues or PR descriptions. If entering a URI manually, URL-encode the username/password components and preserve the `/parkease` database path.

## Atlas network access

In the new Render service, open **Connect → Outbound** and copy its current CIDR ranges. Add those ranges to the ParkEase Atlas project's network access list. Use the ranges Render shows for the selected service/region, not an unrestricted `0.0.0.0/0` rule.

If you need to run administrative commands locally, temporarily allow your current public IP as a separate Atlas access-list entry and remove it afterward. No existing local development records are copied automatically to Atlas. A new deployment starts with a new database; moving existing data is a separate, deliberate migration.

## Initial administrator

Public registration creates drivers or pending mall owners. It cannot create administrators.

To create the first admin, run the existing seed command once with the production Atlas URI and explicit `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` supplied privately. An existing admin is left unchanged by repeat runs. Never seed your ordinary development credentials into production.

On Free Render, you can temporarily set the start command to:

```sh
npm run seed:admin --workspace server && npm start
```

Supply the three `ADMIN_*` values as secret environment variables first. After the first successful startup, restore `npm start` and remove the `ADMIN_PASSWORD` environment variable. Alternatively, run the seed command locally with production secrets loaded from an ignored environment file and your temporary Atlas IP access. A clean deployment is not ready for owner approvals until the first admin is created and can sign in.

## Verify after deployment

```sh
node scripts/check-deployment.mjs https://YOUR-SERVICE.onrender.com
```

This verifies the React build, static JavaScript, deep-link refreshes, API liveness/readiness, worker startup, and JSON 404 handling. Also verify in a browser:

1. Register a driver, sign in, refresh the page, sign out, and sign in again.
2. Sign in as admin, approve an owner, and approve their mall.
3. Publish inventory and create/assign a guard. The guard changes their temporary password.
4. Reserve a bay, issue entry QR, verify and confirm entry, issue exit QR, confirm exit, and open the final bill.
5. Test camera scanning on a phone using the HTTPS deployment URL and allow camera access when prompted.
6. Check owner analytics and reservation/gate-history views.

Readiness returns HTTP 503 if the database, replica-set capabilities, or required indexes are unavailable. A missing frontend build fails startup. The latest tested code must be pushed before asking Render to deploy it.

## Free-demo limits and recovery

Render Free services sleep after 15 minutes without incoming traffic. A later visit wakes the service and can take about a minute. The in-process expiry sweep stops while the service is asleep; it resumes after startup. Booking and entry eligibility use deadlines directly, so a late worker does not make an expired credential eligible. Continuous background processing requires an always-on service; do not describe the free demo as production-grade continuous operation.

The deployment writes no persistent data to Render's filesystem. Atlas holds the database. Atlas Free does not include managed backups: establish a `mongodump`/`mongorestore` backup-and-restore process before storing important real data. Never delete or restore a live database just to fix a failed deployment.

For a bad application release, redeploy the previous known-good commit while preserving environment secrets. Database/model changes can require a separate rollback plan. Review runtime logs for failed expiry sweeps and check `/api/health/ready` after changes. Free services and new database accounts remain subject to the providers' account limits.

## Official references

- [Render Node/Express deployment](https://render.com/docs/deploy-node-express-app)
- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render-provided environment variables](https://render.com/docs/environment-variables)
- [Render outbound IP ranges](https://render.com/docs/outbound-ip-addresses)
- [Render Free limits](https://render.com/docs/free)
- [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
