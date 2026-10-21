# EcoHome

EcoHome helps Singapore homeowners plan their household energy use and find renovation contractors.

- **Homeowners** sign up with email or Singpass (Myinfo pre-fills their household). They can use the Energy Planner, the Simulator and the 3D room, search for contractors and request quotations.
- **Contractors** log in with Corppass (which verifies their company UEN). They set up a business profile and reply to quotation requests, with an optional AI-drafted quotation (Gemini) built from their PDF price list.

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
| `appliances.json`, `hdb_rooms.json`, `gameScenarios.json` | Catalogue data for the planner and simulator |

In development, Vite proxies `/api` to the server at `http://127.0.0.1:8000` (see `client/vite.config.js`), so the browser only ever talks to `localhost:5173`.

---

## Prerequisites

- **Node.js** `^22.18.0` or `>=24.12.0`
- **pnpm** (both `client/` and `server/` use pnpm lockfiles)
- A **MongoDB** connection string (Atlas or a local `mongod`)
- A **Gemini API key**, needed only for the AI features (quotation comparison and AI quotation drafts)

---

## Getting started

### 1. Install dependencies

```bash
cd server && pnpm install
cd ../client && pnpm install
```

### 2. Create `server/.env`

```ini
# MongoDB connection string (Atlas or local)
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

No seeding step is needed. On startup the server creates its MongoDB indexes and migrates any older records.

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

Then open **http://localhost:5173**.

> Use `localhost`, not `127.0.0.1`. The Singpass and Corppass redirect URIs and the session cookie are tied to `localhost:5173`. Opening the app on another host makes logins fail with `?error=singpass` / `?error=corppass`.

| Service | URL |
|---|---|
| Client (Vite) | http://localhost:5173 |
| API (Express) | http://127.0.0.1:8000 |
| MockPass | http://localhost:5156 |

MockPass must be started with `pnpm mockpass`. That script sets the JWKS endpoints so MockPass can read this app's public keys at `/api/auth/singpass/jwks`. Start the API server before you log in.

### Other client scripts

```bash
pnpm build       # production build into client/dist
pnpm preview     # serve the production build
pnpm test:unit   # Vitest
pnpm test:e2e    # Playwright
pnpm lint        # oxlint + ESLint
```

---

## Test data

### Homeowners

#### Test accounts

**Email and password.** Sign up at `/signup`, for example:

| Name | Email | Password |
|---|---|---|
| Test Homeowner | `test@example.com` | `Test@1234` |

Passwords need at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol. Login and sign-up allow 10 attempts per 15 minutes.

**Singpass (MockPass).** On `/login`, choose the Singpass button and pick a persona from the MockPass dropdown. These Myinfo personas pre-fill an Energy Planner household:

| NRIC | Name | Myinfo data | Planner flat type | Estimated occupants |
|---|---|---|---|---|
| `S9812381D` | Tan Heng Huat | 3-room HDB, married, 1 child | 3-room | 3 |
| `S9812387C` | Howard Chen Yu Sheng | 4-room HDB, single | 4-room | 1 |
| `S9912369I` | Marisol Naldo | 4-room HDB, married, 3 children | 4-room | 5 |
| `S9812382B` | Freya Lim Guo En | 5-room HDB, married, 2 children | 5-room | 4 |
| `S9912374E` | Timothy Tan Cheng Guan | Condominium (not HDB) | *(none, choose one yourself)* | 4 |

An email account can also link Singpass later: in the Energy Planner, click **Retrieve Myinfo with singpass**.

#### Steps to try

1. **Log in** with email or a Singpass persona. A new Singpass user lands on the Energy Planner with the Myinfo household filled in.
2. **Energy Planner:** check and save the household, add appliances, then save, edit and delete a plan.
3. **Simulator** and **3D room:** try the energy scenarios and place appliances in a room.
4. **Find Contractors:** browse website-registered contractors and BCA-registered contractors from data.gov.sg, then request a quotation from a website-registered contractor (pick services, add a description and budget). At least one contractor must have finished their profile first (see [Contractors](#contractors)).
5. **My Quotations:** edit a request while it is still *pending*, then see the contractor's quote or rejection once they reply. Comparing quotations with AI needs `GEMINI_API_KEY`.

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
3. **Open a quotation request** after a homeowner has sent you one (homeowner step 4).
4. **AI draft (optional):** upload your own PDF price list (max 5 MB). Gemini drafts a quotation for you to review. Needs `GEMINI_API_KEY`.
5. **Respond** with *quoted* (with a total) or *rejected*. The homeowner sees the result in **My Quotations**.

> `server/users.json` and `server/plans.json` are leftover sample data from the earlier file-based version. Households and plans are now stored in MongoDB per account.

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

---

## Going live with Singpass / Corppass

Set the `SINGPASS_*` and `CORPPASS_*` variables to the values from the Singpass and Corppass developer portals. Register `https://<your-site>/api/auth/singpass/jwks` as the app's JWKS URL. With `NODE_ENV=production`, the server requires `SESSION_SECRET` and sends secure cookies.
