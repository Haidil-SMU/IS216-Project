# EcoHome

EcoHome helps Singapore homeowners plan their household energy use and find renovation contractors.

- **Homeowners** sign up with email or Singpass (Myinfo pre-fills their household). They can use the Energy Planner, the My HDB simulator and 3D Spatial, search for contractors and request quotations.
- **Contractors** log in with Corppass (which verifies their company UEN). They set up a business profile, show past projects in a portfolio and reply to quotation requests, with an optional AI-drafted quotation (Gemini) built from their PDF price list.

The app has a **Vue 3 + Vite** client and an **Express + MongoDB** server. Locally, Singpass and Corppass are simulated by [MockPass](https://github.com/opengovsg/mockpass).

---

## Repository layout

```
client/   Vue 3, Pinia, vue-router, Three.js, Bootstrap (Vite dev server)
server/   Express 5 API, MongoDB, sessions, Singpass / Corppass login
```

| Server file | What it does |
|---|---|
| `server.js` | App entry point: sessions, quotation, planner and AI routes |
| `db.js` | MongoDB connection (database `ecohome`), indexes, startup migrations |
| `auth.js` | Email + password accounts, sessions, role guards |
| `oidc.js` | Shared OpenID Connect set-up and this app's keys |
| `singpass.js` / `myinfo.js` | Singpass login and Myinfo → household mapping |
| `corppass.js` / `contractor.js` | Corppass login, contractor profiles, BCA UEN lookup |
| `profile.js` | Profile pictures (stored in MongoDB, one per account) |
| `portfolio.js` | Contractor portfolios: past projects and their photos (stored in MongoDB) |
| `spatialRoutes.js` | 3D Spatial API: rooms, floor plan edits and appliance placements |
| `floorplan.js` / `layout.js` / `roomSync.js` | Room layouts per flat type, floor plan edit rules, and updating rooms when the flat type changes |
| `energyplanner-model.js` | MongoDB queries for households, rooms and plans |
| `appliances.json`, `gameScenarios.json` | Static data served by `GET /api`. The planner, simulator and 3D Spatial read flat types and the appliance catalogue from MongoDB instead |

In development, Vite proxies `/api` to the server at `http://127.0.0.1:8000` (see `client/vite.config.js`), so the browser reaches the API through `localhost:5173`.

---

## Prerequisites

- **Node.js** `^22.18.0` or `>=24.12.0`
- **pnpm** (both `client/` and `server/` use pnpm lockfiles)
- A **MongoDB** connection string for a database that already holds the app's reference data (see [Reference data](#reference-data))
- A **Gemini API key**, needed only for the AI features (AI quotation drafts and organising uploaded price lists)

---

## Getting started

### 1. Install dependencies

```bash
cd server && pnpm install
cd ../client && pnpm install
```

### 2. Create `server/.env`

```ini
# MongoDB connection string (the database must already hold the reference data)
DB=mongodb+srv://<user>:<password>@<cluster>/

# Long random string used to sign session cookies. Generate one with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=

# Gemini key for the AI quotation features
GEMINI_API_KEY=

# Optional: API port (default 8000; the Vite proxy expects 8000)
# PORT=8000

# Optional: Singpass / Corppass overrides. The defaults below point at MockPass.
# SINGPASS_DISCOVERY_URL=http://localhost:5156/singpass/v3/fapi/.well-known/openid-configuration
# SINGPASS_CLIENT_ID=ecohome-local
# SINGPASS_REDIRECT_URI=http://localhost:5173/api/auth/singpass/callback
# SINGPASS_SCOPES=openid user.identity name hdbtype housingtype regadd marital childrenbirthrecords
# SINGPASS_KEYS_FILE=./keys/singpass-jwks.json
# CORPPASS_DISCOVERY_URL=http://localhost:5156/corppass/v2/.well-known/openid-configuration
# CORPPASS_CLIENT_ID=ecohome-local
# CORPPASS_REDIRECT_URI=http://localhost:5173/api/auth/corppass/callback
```

`.env` is git-ignored. Never commit real credentials.

### 3. Generate the login keys (once)

```bash
cd server && pnpm keys
```

This writes `server/keys/singpass-jwks.json`, the signing and encryption keys used for both Singpass and Corppass. The folder is git-ignored. Run `node scripts/generate-singpass-keys.js --force` to replace the keys.

### Reference data

On startup the server creates its MongoDB indexes and migrates any older records, but it does not create the reference data. The `flat_types` and `catalogue_items` collections must already exist in the `ecohome` database, and this repository has no seed script for them. Use the team's shared Atlas database, or copy those collections from it. On an empty database the household form does not appear, so new homeowners cannot get past My Profile.

---

## Running the app

Open three terminals:

```bash
# 1. MockPass (simulated Singpass + Corppass), port 5156
cd server && pnpm mockpass

# 2. API server, port 8000
cd server && pnpm start

# 3. Client, port 5173
cd client && pnpm dev
```

Then open **http://localhost:5173**. The first visit in each browser session shows a splash screen that waits for you to click and switch the lights on.

> Use `localhost`, not `127.0.0.1`. The Singpass and Corppass redirect URIs and the session cookie are tied to `localhost:5173`. Opening the app on another host makes logins fail with `?error=singpass` / `?error=corppass`.

| Service | URL |
|---|---|
| Client (Vite) | http://localhost:5173 |
| API (Express) | http://127.0.0.1:8000 |
| MockPass | http://localhost:5156 |

MockPass must be started with `pnpm mockpass`. That script sets the JWKS endpoints so MockPass can read this app's public keys at `/api/auth/singpass/jwks`. Start the API server before you log in.

The script sets its environment variables Unix-style, so on Windows it needs a different command. In PowerShell, from `server/`:

```powershell
$env:SHOW_LOGIN_PAGE='true'
$env:FAPI_CLIENT_JWKS_ENDPOINT='http://127.0.0.1:8000/api/auth/singpass/jwks'
$env:CP_RP_JWKS_ENDPOINT='http://127.0.0.1:8000/api/auth/singpass/jwks'
npx -y @opengovsg/mockpass@4.9.3
```

### Other scripts

In `client/`:

```bash
pnpm build       # production build into client/dist
pnpm preview     # serve the production build
pnpm test:unit   # Vitest, in watch mode
pnpm test:e2e    # Playwright (see End-to-end tests below)
pnpm lint        # oxlint + ESLint, and applies their automatic fixes to your files
pnpm format      # Prettier, rewrites files in src/
```

In `server/`:

```bash
pnpm test        # Node test runner, no database needed
```

### End-to-end tests

Install the browser once with `pnpm exec playwright install chromium` in `client/`.

`pnpm test:e2e` starts its own API server on port 8011 and Vite on port 5174, so it can run alongside your dev servers. The API server uses `E2E_DB` if it is set, otherwise a local `mongod` at `mongodb://127.0.0.1:27017`, so one of them must be available.

> The database name is always `ecohome`, and the tests create real accounts. Never point `E2E_DB` at the shared Atlas database.

---

## Test data

### Homeowners

#### Test accounts

**Email and password.** Sign up at `/signup`, for example:

| Name | Email | Password |
|---|---|---|
| Test Homeowner | `test@example.com` | `Test@1234` |

Passwords need at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol. Login and sign-up allow 10 attempts per 15 minutes.

**Session length.** With *Keep me logged in on this device* ticked (the default), a session lasts 30 days. Unticked, it ends after an hour idle. Singpass and Corppass logins always last 30 days.

**Singpass (MockPass).** On `/login`, choose the Singpass button and pick a persona from the MockPass dropdown. These Myinfo personas pre-fill a household on the My Profile page:

| NRIC | Name | Myinfo data | Planner flat type | Estimated occupants |
|---|---|---|---|---|
| `S9812381D` | Tan Heng Huat | 3-room HDB, married, 1 child | 3-room | 3 |
| `S9812387C` | Howard Chen Yu Sheng | 4-room HDB, single | 4-room | 1 |
| `S9912369I` | Marisol Naldo | 4-room HDB, married, 3 children | 4-room | 5 |
| `S9812382B` | Freya Lim Guo En | 5-room HDB, married, 2 children | 5-room | 4 |
| `S9912374E` | Timothy Tan Cheng Guan | Condominium (not HDB) | *(none, choose one yourself)* | 4 |

An email account can also link Singpass later: on **My Profile**, click **Retrieve Myinfo with singpass**.

#### Steps to try

1. **Log in** with email or a Singpass persona. A new Singpass user lands on My Profile with the Myinfo household filled in. New accounts must save a household there first; until then, the planner, My HDB, Find Contractors and 3D Spatial send them back to My Profile.
2. **My Profile** (click your name in the navbar): check and save the household on the *My Household* tab (each account has one household).
3. **3D Spatial:** place appliances in a room. The first visit creates the household's rooms, which My HDB needs, and the Energy Planner reads the appliances placed here.
4. **Energy Planner:** your household and its placed appliances load automatically. Save, edit and delete a plan.
5. **My HDB:** try the energy scenarios.
6. **Find Contractors:** browse website-registered contractors and BCA-registered contractors from data.gov.sg, open **View Portfolio** on a website-registered contractor, then request a quotation from them (pick services, add a description and budget). At least one contractor must have finished their profile first (see [Contractors](#contractors)).
7. **My Profile → My quotations** (click your name in the navbar): edit a request while it is still *pending*, then see the contractor's quote or rejection once they reply. You can select quotations to compare, but the AI comparison is not connected in the client yet.

### Contractors

#### Test accounts

Go to `/login?as=contractor` (or choose **Contractor** on the login page) and use the Corppass button. Every Corppass user from the same UEN shares one contractor account.

| Case | How to log in on MockPass | UEN | What happens |
|---|---|---|---|
| **Registered with BCA** | In MockPass's custom-profile form, enter any NRIC (e.g. `S8979373D`) and type UEN `201925566H` | `201925566H` | The account is named **#1 DESIGN STUDIO PTE. LTD.** from BCA's register of contractors, and profile set-up pre-fills the service *Interior Design & Renovation* |
| **Not registered with BCA** | Pick the preset user `S8979373D / UEN: 123456789A` from the dropdown | `123456789A` | No BCA match: the account is named after the UEN and the set-up form starts empty |

The BCA lookup calls data.gov.sg live (5-second timeout, results cached for an hour). If it can't be reached, a registered UEN behaves like an unregistered one. `201925566H` is a real public BCA register entry, used here only as lookup test data.

#### Steps to try

1. **Log in** with one of the UENs above. You land on the **Contractor Dashboard**.
2. **Set up the business profile.** Only complete profiles appear in the homeowners' Find Contractors.
3. **Open a quotation request** after a homeowner has sent you one (homeowner step 6). If they attached their saved household, you can view its 3D layout read-only.
4. **AI draft (optional):** on the *Price List* tab, upload and save your own PDF price list (max 5 MB). It is required before drafting and is reused for later drafts until you replace it. Gemini then drafts a quotation for you to review. Needs `GEMINI_API_KEY`.
5. **Respond** with *quoted* (with a total) or *rejected*. The homeowner sees the result under **My Profile → My quotations**.
6. **Portfolio (optional):** on the *Portfolio* tab, add up to 10 past projects with photos (max 2 MB each). Homeowners see them through **View Portfolio** in Find Contractors.

> `server/users.json` and `server/plans.json` are leftover sample data from the earlier file-based version. Households and plans are now stored in MongoDB per account. `server/App.vue` and `server/main.js` are also leftovers: the server does not use them, and the client has its own versions in `client/src/`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Missing DB connection string in server/.env` | Create `server/.env` with `DB=...` |
| `MongoDB error: ...` and the server exits | Check the connection string and, on Atlas, the IP access list |
| `Login keys not found at ...` | Run `pnpm keys` in `server/` |
| Redirected to `/login?error=singpass` or `?error=corppass` | Make sure MockPass and the API are running, and that you opened `localhost:5173` |
| `GEMINI_API_KEY is not configured.` | Add `GEMINI_API_KEY` to `server/.env` and restart the server |
| `EADDRINUSE` | Another process is using 5173, 8000 or 5156. Stop it or change the port |
| My Profile shows no household form | The database has no `flat_types` data. See [Reference data](#reference-data) |
| `No household with rooms found.` on My HDB | Open 3D Spatial once to create the rooms |
| `No electrical appliances were found in this household's saved rooms.` on the Energy Planner | Place at least one appliance in 3D Spatial |

---

## Going live with Singpass / Corppass

Set the `SINGPASS_*` and `CORPPASS_*` variables to the values from the Singpass and Corppass developer portals. Register `https://<your-site>/api/auth/singpass/jwks` as the app's JWKS URL. With `NODE_ENV=production`, the server requires `SESSION_SECRET` and sends secure cookies.

The server only listens on `127.0.0.1` and does not serve the client, so production needs a reverse proxy in front of it. On one HTTPS site, have the proxy forward `/api` to the server and serve `client/dist` for everything else, falling back to `index.html` so page addresses like `/MyProfile` still load.
