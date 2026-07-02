# Deployment Architecture — Cloud, Single-Device, and Multi-Device Local

> Status: **PLAN** — this document describes what we've designed and agreed on. As of this writing, only the Cloud setup is actually built/live. The offline/SQLite setup described below is NOT YET IMPLEMENTED — see "Build order" at the end for what's left.
>
> This is a planning/architecture document, separate from `DOCUMENTATION.md` (which documents what's actually shipped).

---

## 1. The three deployment modes

| Mode | Database | Who it's for | Status |
|------|----------|---------------|--------|
| **Cloud SaaS** | PostgreSQL (Neon) | Schools with reliable internet, multi-tenant hosted | ✅ Live |
| **Offline, single device** | SQLite | A school with no/poor internet, one computer runs everything | 🔲 Planned, not built |
| **Offline, multiple devices (local "center server")** | SQLite | Same as above, but several devices (teacher laptops, tablets, admin PC) share one server over the school's LAN | 🔲 Planned — same build as single-device, no separate work |
| **Future: cloud sync** | SQLite ⇄ Postgres | An offline school that occasionally connects to the internet to back up / sync to the cloud | 🔲 Deferred — not being built yet |

Mobile (the React Native/Expo app) is **online-only**. For offline/local use, any device (including phones/tablets) just opens the responsive web app in a browser pointed at the local server — no native offline mobile work needed.

---

## 2. Cloud setup (existing, for reference)

Already live. See `DOCUMENTATION.md` and the project's deployment history for full detail. Summary:
- **Web**: Next.js on Vercel
- **API**: Node/Express on Railway
- **Database**: PostgreSQL on Neon
- Multi-tenant — many schools share one deployment, isolated by `schoolId`.

This document doesn't change anything about the cloud setup. It's listed here so the three modes can be compared side by side, and because the future sync feature will eventually bridge offline installs back to this cloud Postgres.

### 2a. Cloud deployment gotchas — schema drift & migration discipline (incident 2026-07-01/02)

**What happened**: Railway's start command is `prisma migrate deploy && node dist/index.js`. On 2026-07-01 this started crash-looping in production with `P3018`/`P3009` ("migration failed to apply... column already exists"). Root cause: throughout this project's development, schema changes were repeatedly applied straight to a database via `npx prisma db push` (fast iteration, no migration file generated) rather than `prisma migrate dev`. Migration files got written *after the fact* for some of these changes (their own comments say so, e.g. `add_school_cover_images`: *"was added to schema.prisma without ever generating a tracked migration"*), but were never actually reconciled against production's real migration ledger (`_prisma_migrations`) before `migrate deploy` started actually running there for real. The result: `migrate deploy` tried to re-run `ADD COLUMN`s that already existed on the live table, failed, and (per Prisma's safety design) refused to apply anything else until manually resolved — this took production down entirely (not just that one migration; **every** subsequent deploy failed the same way until fixed).

**Going forward — the actual rule**: any schema change that's ever pushed straight to a shared/production-adjacent database (via `db push`) needs a matching tracked migration reconciled against **every** environment that will later run `migrate deploy` on it, before that ever happens for real — not left for `migrate deploy` to discover the mismatch itself in production. Concretely: after a `db push`, either (a) generate the matching migration with `prisma migrate dev --create-only` and run `prisma migrate resolve --applied <name>` against every already-drifted environment right away, or (b) just prefer `prisma migrate dev` over `db push` in the first place for anything on a path to production. Don't let migration files silently accumulate untested against the actual prod database.

**Recovery pattern, if this happens again**: for each failing migration, decide per-file whether it's safe to `prisma migrate resolve --applied <name>` (mark done without running) or should actually run for real — inspect the `.sql` file first. `ADD COLUMN`/`CREATE TABLE`/`CREATE TYPE` are safe to resolve either way. **Anything with `DROP COLUMN`/`DROP TABLE`/`ALTER ... DROP` is not** — verify with a read-only query first that the data being dropped is actually empty in production before letting it run (don't assume dev's schema state matches prod's). See the incident's own check: confirmed `School.accessExpiresAt`/`restrictionNote` and the `SyncCursor`/`SyncToken`/`SyncTombstone` tables were all empty in production before letting `20260627081138_add_school_acronym_batch` (which drops all of them) actually execute — see section 9, which is updated to reflect they're now gone.

**Two real operational gotchas hit while recovering, worth knowing before this happens again:**
1. **This dev machine cannot reach Neon's Postgres port 5432 directly** (`ETIMEDOUT`/`ENETUNREACH` on outbound 5432 — a local network/ISP restriction, confirmed from a genuinely separate terminal, not a Claude Code sandbox issue). This means `railway run <command>` — which executes **locally** on the dev machine, just injecting production env vars — cannot be used for anything that opens a direct DB connection from here. Two things that *do* work: Neon's own web SQL Editor (console.neon.tech — plain HTTPS through the browser, no port issue) for raw read-only queries, and `railway ssh` into an actually-*running* container (Railway's own infrastructure can reach Neon fine — proven by the original crash logs showing 6 migrations actually applying before the drift was hit).
2. **`railway up` deploys the current local working tree directly — it bypasses git entirely.** It doesn't care what branch is checked out, what's committed, or what's pushed to `origin`; it uploads whatever's on disk *right now*. Must be run from the **monorepo root**, not a subpackage directory — running it from inside `apps/api` uploads only that folder, breaking `npm run build --workspace=api` (no workspace root to resolve). Used this deliberately during the 2026-07-01/02 recovery (deployed a temporary no-op `start` command to get a stable container to `railway ssh` into, fixed the DB from inside it, then redeployed the real `start` command) — but this means whatever branch happens to be checked out locally when you run it goes live immediately, with no PR/review step. Worth being deliberate about which branch is checked out before ever running `railway up` again.

---

## 3. Offline setup — core architecture (single AND multiple devices)

**Key simplification: single-device and multi-device are the exact same build.** One machine is "the server" — it runs the API, the SQLite database file, and serves the web app. Whether it's used by just that machine or by ten devices on the same WiFi is purely a matter of whether other browsers point at `localhost` or at that machine's LAN IP. No separate multi-device mode to design or build.

```
            ┌─────────────────────────────────────────┐
            │   The "server" machine (one per school)  │
            │                                          │
            │   ┌────────────┐      ┌───────────────┐  │
            │   │  Express   │◄────►│  SQLite file  │  │
            │   │    API     │      │ (local disk)  │  │
            │   └─────┬──────┘      └───────────────┘  │
            │         │                                │
            │   ┌─────▼──────┐                         │
            │   │  Next.js   │                         │
            │   │  web app   │                         │
            │   └────────────┘                         │
            └─────────────────┬────────────────────────┘
                               │  school's LAN/WiFi
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐   ┌──────▼─────┐   ┌──────▼─────┐
        │ that same  │   │  teacher's │   │   admin's  │
        │  machine,  │   │   laptop   │   │   tablet,  │
        │  browser   │   │  (browser) │   │  any phone │
        └────────────┘   └────────────┘   └────────────┘
```

### Why SQLite (not Postgres+Docker) for this path
- No database *server process* to install/manage — it's a single file Express opens directly.
- Removes the Docker Desktop prerequisite entirely (heavy install, virtualization requirements, and — per this project's own experience standing up the Docker prototype — a real source of friction: port conflicts, daemon permissions, password resets, multi-flag commands).
- Devices never touch the database directly anyway (web/mobile only ever call the API over HTTP) — so SQLite's single-writer limitation is a non-issue. The API process is the only thing that ever opens the file, regardless of how many devices are hitting it over the network.
- A school's realistic write volume (a few teachers entering marks) is nowhere near SQLite's throughput ceiling.
- Trivial backup: copy one file.

### Networking — no baked-in LAN IP
The earlier Docker prototype baked an absolute LAN URL into the web build at build time (`NEXT_PUBLIC_API_URL=http://<ip>:5000/api`), which meant rebuilding every time the network/IP changed. The SQLite/native plan drops this: the web app derives the API origin **at runtime from the browser's current URL** (`window.location.hostname`) instead of a hardcoded address. Same server, same ports, works unmodified on `localhost`, on any LAN IP, after a network change, with no rebuild. CORS is already permissive (`app.use(cors())`), so this requires no API changes either.

---

## 4. Packaging & installation

### Windows (primary target — most schools)
- **Single executable**: the API is built as one native binary using Node's built-in Single Executable Application (SEA) support — bundles the Node runtime + app code. The school never installs Node.js, never sees a terminal.
- **Real installer**: built with **Inno Setup** (free, mature, used by software like Git for Windows) — produces one `ReportCardSetup.exe`. Standard "Next → Next → Install → Finish" flow.
- **Runs as a Windows Service** (via `node-windows`, registering directly against the Windows Service Control Manager) — starts at boot, before any user logs in. *(Earlier considered NSSM for this; switched to `node-windows` because NSSM has occasional antivirus false-positive history as a generic "wrap any exe as a service" tool.)*
- **Firewall rule added automatically by the installer**, scoped to the Private network profile only and to the specific ports used — so other devices on the LAN can reach it without a confusing Windows Firewall block, and without over-opening the machine to the Public network.
- **Desktop shortcut** opens a chromeless browser "app mode" window (no address bar/tabs, using whatever browser is already on the machine — Edge ships with Windows) — looks and feels like a native app, no separate UI framework needed.
- Data (the SQLite file + uploaded images) lives in `%APPDATA%`, following OS convention, surviving reinstalls.

### Linux / macOS (secondary — minority of schools)
Simpler equivalent, no installer wizard:
- Linux: a systemd **user service** for auto-start.
- macOS: a **LaunchAgent** (`~/Library/LaunchAgents/*.plist`) for auto-start.
- Same single-executable approach, same app-mode shortcut trick.
- Lower priority/polish than Windows — "good enough," not gold-plated, since this is the minority case.

---

## 5. Reliability — "shuts down every night, must start smoothly every morning"

This was the explicit non-functional requirement driving most of the above choices:
- **Auto-start at boot, not at login** — a Windows Service / systemd service / LaunchAgent starts the server before anyone logs in, so a shared office PC sitting at the lock screen still has the server running.
- **SQLite WAL mode** enabled — tolerates abrupt power-off without corruption (atomic transactions), and lets reads proceed without blocking on writes when multiple devices are active.
- **Backup**: a simple one-command (eventually one-click) backup — just copying the SQLite file (and the uploads folder) — far simpler than the Postgres `pg_dump` approach used for the cloud DB.

---

## 6. Antivirus / SmartScreen — what we're doing, and why

Service installation + firewall modification + an unsigned, brand-new executable are exactly the behavioral pattern AV heuristics watch for (malware does the same things for persistence/remote access). Budget-conscious plan for now (no paid certificate yet):

| Mitigation | Cost | Status |
|---|---|---|
| Use `node-windows` instead of NSSM (avoids a tool with AV flagging history) | Free | Planned |
| Scope firewall rule to Private network + specific ports only | Free | Planned |
| Distribute the installer via USB/direct transfer rather than a web download link | Free | Avoids the Windows "Mark of the Web" SmartScreen trigger entirely for those copies |
| Submit the installer to Microsoft's free file-submission portal for reputation review | Free | To do once built |
| Let SmartScreen reputation build naturally with real-world usage over time | Free | Passive, compounds with adoption |
| ~~Self-signed certificate~~ | Free | **Not a real mitigation** — Windows doesn't trust self-signed certs any more than no signature; sometimes treated as *more* suspicious. Don't bother. |
| Real code signing (proper CA, or Microsoft Trusted Signing ~$10/mo) | $$ | **Deferred** until there's revenue — revisit then |

Realistic expectation: this reduces but does not eliminate the chance of an occasional one-time AV/SmartScreen warning on a new install. That's the reality for all small/indie Windows software, not a flaw specific to this plan.

---

## 7. Build process (developer side)

- **Internet is needed exactly once, at build time**, on the developer's machine (downloading npm packages, building the app, bundling the Node runtime, compiling the installer). The resulting installer file then needs **zero internet**, ever, on the school's machine — install, daily use, restarts, all fully offline.
- Building the **Windows** installer from a **Linux** dev machine needs **Wine** installed locally, to run Inno Setup's Windows-only compiler (a standard, well-supported workflow). The Node SEA executable itself cross-builds for Windows without Wine (just needs the official prebuilt Windows `node.exe` + the `postject` tool).
- Delivery to a genuinely offline school: build → copy the installer onto a flash drive/external disk → carry it to the school → install with the machine fully disconnected.

---

## 8. Schema changes needed for SQLite — ✅ DONE 2026-06-24

Verified empirically (not just from docs) by test-validating a throwaway schema against Prisma 7.8.0: **enums and `Json` fields both work fine on SQLite** — contrary to older assumptions about SQLite/Prisma support. The **only** real incompatibility is scalar lists (`String[]`):
- `School.coverImages String[]` → `Json` in the SQLite schema (`apps/api/prisma/sqlite/schema.prisma`), default `"[]"`. Confirmed via a smoke test that it still behaves like a real JS array at runtime (spread, push-equivalent, etc.) — no application code changes needed for this field.
- **Real Prisma quirk found and fixed**: Prisma's SQLite migration generator emits invalid SQL for `Json` fields that have a `@default("...")` — it renders e.g. `DEFAULT {}` / `DEFAULT []` **unquoted**, which SQLite rejects (`unrecognized token: "{"`). Fixed by hand-editing the generated `migration.sql` to quote them (`DEFAULT '{}'`, `DEFAULT '[]'`). **Watch for this again** any time a new `Json`-with-default field is added to the SQLite schema and a fresh migration is generated — check the generated SQL before applying it, don't assume it's valid.
- Built and verified: separate schema at `apps/api/prisma/sqlite/schema.prisma`, its own migration history at `apps/api/prisma/sqlite/migrations/`, a dedicated `prisma.sqlite.config.ts`, a SQLite-specific driver-adapter connection file (`src/config/prisma.sqlite.ts`, using `@prisma/adapter-better-sqlite3` — the existing `config/prisma.ts` uses `@prisma/adapter-pg`, Postgres-only, so this had to be a separate file, not a shared one with branching), and a smoke test (`src/scripts/sqliteSmokeTest.ts`) exercising creates/updates/relations/nullable scores/JSON fields end-to-end. All passed.
- Prisma client for the SQLite variant generates to `apps/api/generated/sqlite-client` (gitignored, like `dist/`) — kept separate from the default `node_modules/@prisma/client` output so generating one never clobbers the other.
- **Ongoing cost to be aware of**: maintaining **two schemas / two migration histories** long-term — Postgres for the cloud SaaS, SQLite for offline installs. Any future schema change has to be made in both places by hand (no tooling syncs them automatically). This was an explicit, accepted tradeoff given the priority on a zero-friction offline install experience.

---

## 9. Future: cloud sync (deferred — not being built now)

Explicitly out of scope for the current phase, per the decision to focus on offline-first before any "online syncing Postgres and all the rest." Noted here so the intent isn't lost:
- The general idea: an offline SQLite install occasionally connects to the internet and pushes/pulls changes to a central cloud Postgres — for backup, cross-device access, or remote support.
- Even with sync, **the school's machine would still only ever run SQLite** — Postgres stays purely on the cloud side as the central reconciliation point. Sync doesn't mean installing Postgres locally.
- There *was* early, unfinished groundwork for this sitting in the Postgres migration history — `SyncTombstone` / `SyncToken` / `SyncCursor` tables and `School.accessExpiresAt` / `restrictionNote` columns — but it was never wired to any Prisma model or app code, and was **actually dropped from production on 2026-07-02** as part of applying migration `20260627081138_add_school_acronym_batch` (confirmed empty in prod first — see section 2a). If this phase gets picked up, it starts from scratch, not from this leftover scaffolding.

---

## 10. What exists today vs. what's planned

- The repo currently has a **Docker + Postgres** offline prototype (`Dockerfile.local`, `docker-compose.local.yml`, `.env.local-install`, plus an `adminer` service for DB browsing) — built and verified working end-to-end (including demo login) as a proof of concept that "the app can run fully offline on one machine."
- That prototype is **superseded by the plan in this document** — we deliberately moved away from Docker once SQLite removed Docker's only reason for being there (running Postgres as a separate service). The Docker files haven't been deleted/cleaned up yet; they're left as-is for now and can be removed once the SQLite/native path is working, but shouldn't be mistaken for the long-term direction.

## 11. Build order

1. ✅ **SQLite schema migration** — done 2026-06-24, see section 8.
2. ✅ **Single-executable packaging (API)** — done 2026-06-24, see section 12. Proven on Linux; Windows/macOS builds not yet attempted.
3. ✅ **Web app packaging + runtime API-origin detection** — done 2026-06-24, see section 13. Proven on Linux; Windows/macOS builds not yet attempted.
4. ✅ **Launcher (start-if-needed + app-mode browser window)** — done 2026-06-24, see section 14. Proven on Linux; the actual OS desktop-shortcut *file* (`.desktop`/`.lnk`) pointing at this executable is still step 6's job (the Windows installer), this step built and proved the executable the shortcut will point at.
5. ✅ **Auto-start registration** — done 2026-06-24, see section 15. **Linux (systemd) fully verified on real hardware**, including crash-recovery. **Windows (`node-windows` + firewall) and macOS (LaunchAgent) are written but UNVERIFIED** — no Windows/Mac machine available to test; needs real hardware before being trusted.
6. ✅ **Windows installer** — done 2026-06-24, see section 16. Compiled and run end-to-end under Wine (no Windows machine available) — caught and fixed a real, significant bug along the way (steps 2-5 had only ever produced Linux binaries, mislabeled with Windows names). Genuinely the most-verified the Windows path has been, but Wine's Service Control Manager/`netsh` are known-incomplete, so real Windows hardware is still needed for final confirmation before trusting this with an actual school.
7. ✅ **Backup tooling** — done 2026-06-24, see section 17.

## 12. Single-executable packaging (API) — ✅ DONE 2026-06-24

Built and **verified in full isolation** (a temp directory with nothing but the executable and its native dependency folder — no ambient monorepo `node_modules` reachable) on Linux: fresh never-migrated database → first startup applies migrations automatically → create-superadmin/login work end-to-end → killed and restarted → data persists, migration correctly does not reapply. That last part is the actual proof of the "shuts down every night, must start smoothly every morning" requirement.

**Tooling** (`apps/api/scripts/offline-build/`):
- `bundle.mjs` — esbuild bundles `src/index.ts` (untouched) into one CJS file, with a resolve plugin that swaps a few imports purely at build time: `config/prisma` → `config/prisma.sqlite`, `routes/demo.routes` → an empty stub, `better-sqlite3` → a createRequire shim (see gotchas below). `.sql` files load via esbuild's built-in `text` loader.
- `sea-config.json` + `package.mjs` — generates the Node SEA blob, copies the current `node` binary, injects the blob via `postject`, and copies `better-sqlite3`/`bindings`/`file-uri-to-path` into `release/node_modules/` alongside the executable. Run with `node scripts/offline-build/package.mjs`.
- Output: `apps/api/release/reportcard-api` (+ its `node_modules/` folder) — copy both, the executable alone isn't enough.

**Three real Node SEA gotchas found and fixed (none documented clearly anywhere obvious, all confirmed empirically):**
1. **A `require.main === module` "run directly" guard fires incorrectly once bundled.** `scripts/seedDemo.ts` had one (`if (require.main === module) resetDemoSchool()`), meant to only run when that file is executed directly. esbuild flattens every source file into one shared module scope, so the check became true on *every* startup of the bundled server — silently wiping/rebuilding a "demo" tenant each time. Harmless in this case (errored quietly, no such tenant existed) but a real hazard in general. Fixed by excluding the demo route from the offline build entirely (it's a cloud-only feature anyway, irrelevant offline) rather than patching the guard. **Lesson: grep for `require.main === module` before bundling anything new into this pipeline** — any hit needs the same exclude-or-restructure treatment.
2. **A SEA executable's embedded `require()` cannot resolve `node_modules` at all** — it only loads built-ins (`ERR_UNKNOWN_BUILTIN_MODULE` for anything else). This is a documented but easy-to-miss Node SEA limitation. Native addons (here, `better-sqlite3`) need `module.createRequire(process.execPath)` instead, which does real filesystem resolution from the executable's own directory — hence shipping `release/node_modules/` alongside it. See `shims/better-sqlite3.shim.js`.
3. **`__dirname` does not behave normally inside a SEA executable** — it collapsed to `/`, turning the uploads-folder fallback path (`path.join(__dirname, '../../uploads')`) into the literal root `/uploads` (`EACCES`, can't mkdir there). Not a bug to fix in shared code — `UPLOAD_DIR` is already meant to be set explicitly in non-dev deployments (same pattern as the Railway/cloud deploy) — just something the eventual launcher/installer must always set, never rely on the fallback.

**No Prisma CLI on the school's machine, so migrations can't run via `prisma migrate deploy`.** Built a minimal custom runner instead: `src/config/sqliteMigrations.ts` inlines each migration's raw SQL as a string at build time (explicit imports, one per migration folder — not auto-generated, add a new line by hand when a migration is added), and `src/config/sqliteMigrate.ts` applies any not-yet-applied ones via direct `better-sqlite3` calls on startup, tracked in a small own-rolled `_app_migrations` table (deliberately not Prisma's `_prisma_migrations` format — not needed for a single embedded file with no concurrent-writer races, and avoids depending on a Prisma-internal format). Wired in at the top of `config/prisma.sqlite.ts`, before the Prisma adapter connects.

**Bundle size**: ~12MB unminified (not yet optimized — fine for now, single binary, no install step needed regardless).

## 13. Web app packaging + runtime API-origin detection — ✅ DONE 2026-06-24

Unlike the API, the web app is **not** a Node SEA executable. Next's request pipeline dynamically loads per-route compiled chunks from `.next` at runtime via many internal dynamic `require()` calls — forcing that into a single-file SEA bundle isn't something Next supports or tests. Instead, this uses Next's own official minimal-dependency deployment mode, **`output: 'standalone'`**, which already solves the same underlying problem (run without `npm install` on the target machine) in a way Next actually ships.

- **`next.config.ts`**: `output: 'standalone'` is gated behind `process.env.OFFLINE_BUILD === '1'` — completely unset (so behavior is byte-identical) for the normal dev/Vercel build. The existing `/uploads/:path*` rewrite needed **no change** — it already fell back to `http://localhost:5000/api` when `NEXT_PUBLIC_API_URL` is unset, which is exactly correct here: that rewrite runs server-side, proxying to the API on the *same machine* via loopback, regardless of which LAN IP a browser used to reach the web server.
- **`lib/api/client.ts`**: this is where the actual LAN-IP problem lived. Changed `axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL })` to a `resolveBaseURL()` that uses `NEXT_PUBLIC_API_URL` when set (cloud/dev — zero behavior change) and falls back to `` `${window.location.protocol}//${window.location.hostname}:5000/api` `` in the browser otherwise. The browser already knows the right host — it's the same machine serving the page, just port 5000 instead of 3000 — so there's no LAN IP to bake in or go stale on a network change, unlike the earlier Docker prototype.
- **The empty-string trick**: `apps/web/.env.local` sets `NEXT_PUBLIC_API_URL` for normal dev, and Next's env loader only fills a value from `.env.local` when it isn't *already* set in `process.env` — so the offline build script explicitly sets it to `''` (not just omitted) before running `next build`. Empty string counts as "already set" (skips the .env.local value) but is falsy in app code (`if (process.env.NEXT_PUBLIC_API_URL)` correctly falls through to the runtime branch). Verified directly: grepped the built client chunks for `localhost:5000` (absent) and `location.hostname` (present).
- **`apps/web/scripts/offline-build/package.mjs`**: runs the gated build, assembles `release/`, bundles a copy of the `node` binary alongside (same idea as the API — target machine needs no system Node.js install).

**Real gotcha found**: in a monorepo (Turborepo/npm workspaces), Next's standalone tracer mirrors the workspace path *inside* the output — the actual entry point is `release/apps/web/server.js`, not `release/server.js`. Next's own docs note that `public/` and `.next/static` must be copied into that **nested** app folder by hand (standalone's dependency tracing doesn't include them) — copying to the release root instead would silently 404 every static asset. `package.mjs` copies to the correct nested path.

**Verified in full isolation** (copied `release/` to a clean temp directory, nothing from the monorepo reachable): server starts, login page returns 200, and — the real proof static assets are wired correctly — the actual JS chunk referenced by the login page's HTML returns 200 with the correct content-type, not a 404.

**Another gotcha for next time**: Next's standalone `server.js` re-spawns into a detached `next-server` process with a different PID (reparented away from whatever shell launched it), so `kill $!` doesn't work on it the way it does for the API's SEA executable — kill by port (`fuser -k <port>/tcp`) instead when testing this one.

## 14. Launcher (start-if-needed + app-mode browser window) — ✅ DONE 2026-06-24

One executable that's idempotent regardless of which deployment model ends up in front of it: if the API/web servers are already running (e.g. started by a system service once step 5 exists), it just opens the browser; if not, it starts them itself first. This means the same launcher works whether or not auto-start-on-boot is wired up yet — useful right now (no service exists yet) and still correct later (service starts them at boot, the desktop icon just opens a window).

- **`scripts/offline-build/launcher/`** (repo root, not inside either app — it's cross-cutting): `index.ts` (orchestration), `appData.ts` (OS-standard per-user data folder resolution + one-time secret generation/persistence), `browser.ts` (per-OS Chromium-family detection for `--app=` mode, falling back to the OS default browser if none found).
- Resolves the API/web paths **relative to its own executable's location** (`path.dirname(process.execPath)`), not `__dirname` — same SEA gotcha as section 12, applies here too.
- **Secrets persistence**: `JWT_SECRET`/`SUPERADMIN_SECRET` are generated once on first run and saved to `config.json` in the app-data folder, then reused forever after — regenerating them on every launch would invalidate every existing login's JWT and lose the original superadmin bootstrap secret on every restart. This is the actual reason a literal "launcher" needs to exist at all rather than just a static shortcut — someone has to own this one-time setup.
- **Logging**: spawned children's stdout/stderr are redirected to `logs/api.log` / `logs/web.log` in the app-data folder (the target audience has no terminal to see crash output otherwise) — wrote a `launcher-error.log` too for the case where the web server never comes up within the timeout.
- Has **zero native dependencies** (just `child_process`/`fs`/`path`/`http`, all built-ins) — much simpler SEA packaging than the API: no `createRequire` shim, no `node_modules` to ship alongside, just one self-contained executable (`scripts/offline-build/build-launcher.mjs`).
- **`scripts/offline-build/assemble-release.mjs`**: orchestrates the API's `package.mjs`, the web's `package.mjs`, and the launcher build, combining everything into one `release/` folder at the repo root:
  ```
  release/
    reportcard-launcher(.exe)   <- what the eventual desktop shortcut points at
    api/reportcard-api(.exe) + node_modules/
    web/apps/web/server.js + node(.exe) + ...
  ```

**Verified in full isolation** (copied `release/` to a clean temp dir, `HOME` pointed at an empty temp directory to simulate a genuinely fresh machine): first run creates the app-data folder, generates secrets, starts both servers, both log files show correct startup, full create-superadmin/login flow works. **Ran the launcher a second time** — confirmed idempotency: no duplicate servers spawned, `api.log` unchanged (no second startup banner), same persisted data still reachable.

**Testing gotcha worth remembering**: the launcher hardcodes ports 5000/3000 (matching the real app) — testing it on a dev machine that already has the *actual* cloud dev servers running on those same ports causes the launcher to silently (and correctly!) treat them as "already up" and do nothing, which looks like a bug but isn't. Added `RC_API_PORT`/`RC_WEB_PORT` env var overrides (defaulting to 5000/3000) specifically so this can be tested without colliding with — or touching — whatever a developer already has running.

## 15. Auto-start registration — ✅ DONE 2026-06-24 (Linux verified; Windows/macOS drafted, unverified)

### Design: the service supervises children directly; the launcher stays exactly as built in section 14
A real auto-start service needs proper supervision (restart on crash, accurate running/stopped status) — different from the desktop shortcut's fire-and-forget detached spawn. Added a `--service` mode to the **same** launcher executable (one binary, two roles) rather than building a separate one:
- **No flag (desktop shortcut)**: unchanged from section 14 — check if already running, start detached if not, open the browser.
- **`--service` flag (what the OS service manager runs)**: spawns the API and web processes as its own direct (non-detached) children, stays alive forever, never opens a browser (this runs before any login, often with no display server at all).

**A real bug found through actually testing this on hardware, not just writing it**: the first version of `--service` mode tried to retry each crashed child internally with its own backoff/give-up counter. Once *both* children exhausted their retry budget and stopped being restarted, there was nothing left keeping the supervisor's own event loop alive — so the supervisor process exited with status 0 ("success"). systemd read that as "the service finished cleanly" and never restarted it, even though the actual app was completely down. Fixed by deleting that internal retry logic entirely: now, if *either* child dies for any reason, the supervisor kills the other and exits non-zero — and systemd's own `Restart=on-failure` (which already has well-tested backoff/give-up semantics via `RestartSec`/`StartLimitBurst`) is the only supervisor. Don't reinvent what the OS service manager already does well.

### Linux (systemd user service) — verified on real hardware
- `scripts/offline-build/service/linux-install.sh` / `linux-uninstall.sh` — generates `~/.config/systemd/user/reportcard.service` (`ExecStart=<launcher> --service`, `Restart=on-failure`, `StartLimitIntervalSec=60`/`StartLimitBurst=5` as the give-up threshold), then `daemon-reload` + `enable` + `start`.
- **`loginctl enable-linger $USER`** — easy to miss: a systemd **user** service only runs while that user is logged in *unless* lingering is enabled, which makes it start at boot regardless of login. Exactly the "shared office PC sitting at the lock screen" requirement from the original ask.
- **Tested for real on this machine** (registered, verified, then fully uninstalled and restored afterward — same isolate-then-clean-up discipline as every other step): `active (running)` with the correct cgroup tree (launcher supervising both children) confirmed via `systemctl --user status`; killed the API child directly with `pkill` — confirmed the **whole unit restarted** (new start timestamp, new main PID) within seconds, both endpoints healthy again afterward; `systemctl --user stop` confirmed to leave zero orphaned processes/ports.
- **Disclosed, not silently reverted**: enabling lingering changes a real account setting. It was already `Linger=yes` on this machine by the time I checked (couldn't establish whether that predated this session) — left as-is rather than guessing and toggling someone's existing setting. Worth knowing this is a real, only-somewhat-reversible side effect of installing this service on any machine.

### Windows (`node-windows` + firewall rule) — written, NOT yet tested
No Windows machine available while building this — confirmed the `node-windows` `Service` API surface I used (`name`/`script`/`description` options, `'install'`/`'start'`/`'alreadyinstalled'`/`'uninstall'` events) is real by reading its source directly (`node-windows` throws immediately on any non-Windows platform, so it can't even be instantiated here to test against) — that's a meaningfully weaker confidence level than "ran it," and it should be treated that way until verified on real hardware, ideally during step 6.
- `scripts/offline-build/service/windows/service-wrapper.js` — `node-windows` wraps a JS *script* run by `node.exe`, not an arbitrary native `.exe` directly, so this tiny wrapper is what it actually launches; it just execs `reportcard-launcher.exe --service` and inherits stdio.
- `install-service.js` / `uninstall-service.js` — registers/starts the service, and adds/removes a `netsh advfirewall` rule scoped to the **Private** network profile only (ports 3000/5000) — needs to run elevated (Administrator), via the release's own bundled `node.exe`.

### macOS (LaunchAgent) — written, NOT yet tested
Also no Mac hardware available. `scripts/offline-build/service/macos-install.sh` / `macos-uninstall.sh` — generates `~/Library/LaunchAgents/com.reportcardsystem.server.plist` (`RunAtLoad`+`KeepAlive` both true, so launchd starts it at login and restarts it if it ever exits) and loads it via `launchctl`.

## 16. Windows installer (Inno Setup) — ✅ DONE 2026-06-24

### Compiling on Linux: Wine
Inno Setup's compiler (`ISCC.exe`) is Windows-only. Installed Wine + the official Inno Setup installer (run *through* Wine, downloaded directly from `jrsoftware.org`'s GitHub releases) — `sudo apt install wine` (needed the user to run this, no passwordless sudo in this sandbox), then `wine innosetup-6.7.3.exe /VERYSILENT`. `ISCC.exe` then runs fine under Wine for actually compiling `.iss` scripts.

### A real, significant bug this step caught: steps 2-5 had only ever produced Linux binaries
The installer extracted every file correctly on the first attempt (icons, registry uninstall key, all succeeded) — but the post-install `[Run]` step failed outright: `web\node.exe` — *File not found*. The actual `node.exe` in the release was a **Linux ELF binary**, just named `node.exe` because the naming logic checked `process.platform === 'win32'` — true only when *building*, not relevant to what's being *targeted*. Same root cause hit `reportcard-api.exe`, `reportcard-launcher.exe`, and the `better-sqlite3` native addon (compiled for Linux). Every "Proven on Linux" caveat in sections 12-15 was, more precisely, "the logic is cross-platform-aware, but every artifact produced so far has only ever been a Linux binary" — this is the step that actually surfaced it.

**Fixed with `scripts/offline-build/target-node-binary.mjs`** — a `TARGET_PLATFORM` env var (defaults to the host's own platform, so the already-verified Linux path is completely unaffected):
- Same platform as host → `process.execPath` directly, no download, no behavior change.
- `TARGET_PLATFORM=win32` from any host → downloads and caches Node's own official prebuilt `node.exe` directly from `nodejs.org/dist/<version>/win-x64/node.exe` (confirmed this exists as a direct, non-zipped download). The SEA blob itself is platform-agnostic content; injecting it into the *correct* platform's node binary via `postject` is what actually matters.
- `better-sqlite3`'s native addon needed the same fix a different way: re-running `npm install better-sqlite3` in an isolated directory with `npm_config_platform=win32`/`npm_config_arch=x64` set makes its installer (`prebuild-install`) fetch the genuine Windows prebuild from GitHub releases instead of building for the host — confirmed by checking the resulting `.node` file is a `PE32+ DLL`, not Linux ELF.
- Applied to all three build scripts that previously copied `process.execPath` blindly: `apps/api/scripts/offline-build/package.mjs`, `apps/web/scripts/offline-build/package.mjs`, `scripts/offline-build/build-launcher.mjs`.
- Full cross-build: `TARGET_PLATFORM=win32 node scripts/offline-build/assemble-release.mjs`. Verified afterward with `file` on all four binaries — genuine `PE32+ executable ... for MS Windows` across the board.

### The installer script (`scripts/offline-build/windows-installer/reportcard-system.iss`)
- Installs the whole `release/` folder to `{autopf}\ReportCardSystem` (Program Files), `PrivilegesRequired=admin` (needed anyway for the service + firewall rule — triggers the standard one-time UAC prompt).
- Desktop + Start Menu shortcuts point at `reportcard-launcher.exe` directly (no arguments — desktop-shortcut mode from section 14).
- `[Run]` calls `web\node.exe windows\install-service.js` post-install (reuses the web release's bundled node rather than shipping a third copy just for this), then offers the standard "Launch now" checkbox.
- `[UninstallRun]` calls `uninstall-service.js` *before* files are removed, so the service/firewall rule are cleaned up rather than left orphaned pointing at deleted files.

### A second false alarm, also caught by actually testing rather than assuming
After fixing the binaries, the installer ran further but `install-service.js` crashed: `Error: open EBADF` inside `node-windows`'s own `console.log` call. First suspected the `runhidden` Inno Setup flag (a hidden child process can get invalid stdio handles) and removed it — **didn't fix it**. Isolated further by running the exact same command directly, outside the installer: still failed *only when output was piped through another command* (`| tail`), and **succeeded completely** when redirected to a real file instead. This was an artifact of how this sandbox's piped command output interacts with Wine's child-process stdio — not a real bug in `install-service.js`, and not something that would occur from Inno Setup's real `CreateProcess` call either here or on real Windows. Confirmed by re-running the *actual installer* end-to-end with file-redirected output:
```
Service installed, starting...
Service started.
Firewall rule added for port 3000.
Firewall rule added for port 5000.
...
Process exit code: 0
```
Generated XML service config matches what was hand-verified against `node-windows`'s source in section 15.

### Honest limit of this verification
Wine's Service Control Manager and `netsh advfirewall` are both known-incomplete reimplementations, not the real thing. Confirmed this directly rather than assuming success: after the "Service started" message, checked for an actual running process under Wine (`wine cmd /c tasklist`) — found none. The ports that briefly looked like evidence of a running service turned out to be an unrelated orphaned process from earlier testing in this same session, not anything Wine started. So: the **installer packaging, file layout, and every script's logic/API usage** are now verified about as thoroughly as possible without real Windows hardware — but whether the service **actually persists and survives a reboot** on real Windows is still an open question for the first real-hardware test.

## 17. Backup tooling — ✅ DONE 2026-06-24

One-command database + uploads backup, triggered from a button in the web app's Settings page (the school admin is already there daily — no separate tool to find or learn) rather than a CLI script.

### Why not a raw file copy
SQLite's actual **Online Backup API** is used (`better-sqlite3`'s `db.backup()`), not a naive copy of the `.db` file — a plain copy risks an inconsistent snapshot if a write is touching the file at that exact moment (worse with WAL mode, where the live state is split across the main file and a `-wal` file that have to be consistent *together*). The backup connection opens **read-only**, confirming it never needs write access to produce a safe snapshot.

**Real gap found and fixed along the way**: WAL mode had been *documented* as a decision in section 5 since early in this build but was **never actually implemented** — grepped the actual source and confirmed no `PRAGMA journal_mode` was ever set anywhere. Fixed in `sqliteMigrate.ts` (sets it once at startup, idempotent to repeat). Matters directly here: WAL is what lets the backup's read-only connection and the live server's connection coexist without lock contention.

### Cloud-safety, same swap pattern as the demo route (section 12)
A full database dump is only safe because an offline install is single-tenant — doing this against the shared multi-tenant Postgres would be a serious cross-tenant data exposure risk. `src/routes/backup.routes.ts` (shared, what the normal cloud `tsc` build sees) is a stub that returns 503 "only available for offline installs." The bundler (`bundle.mjs`) swaps it for the real implementation (`scripts/offline-build/stubs/backup.routes.offline.ts`) only when building the offline bundle — the cloud build never sees the real code at all, not even a dead code path behind a flag.
- `GET /api/backup/download`, `protect` + `restrictTo('SCHOOL_ADMIN', 'VICE_PRINCIPAL')` — same auth convention as every other admin-only route (e.g. `fees.routes.ts`).
- Backs up the db, walks `UPLOAD_DIR` recursively, zips both together (`apps/api/src/utils/zip.ts` — a dependency-free STORE-format writer, adapted from the existing browser-side `apps/web/lib/zip.ts` for Node `Buffer`s instead of strings/Blobs, since a database file and uploaded images are binary), streams the zip as the response, cleans up its temp file in a `finally`.

### Web UI
Settings page, gated behind `NEXT_PUBLIC_OFFLINE_BUILD` (new — same env-flag pattern as `OFFLINE_BUILD` in `next.config.ts` from section 13, just also exposed to the client bundle since the *UI* needs to know, not just the server). Set in `apps/web/scripts/offline-build/package.mjs`'s build env. A "Download Backup" button calls the endpoint with `responseType: 'blob'` and saves it via the existing `saveBlob` helper (already used for CSV exports) — no new client-side mechanism needed.

### Verified
- Full flow, real isolated test: created a school + admin, uploaded a fake file into `UPLOAD_DIR`, downloaded a backup, **extracted it with the standard system `unzip`** (cross-validates the zip format against a real third-party tool, not just round-tripping through my own code) — `data.db` opened cleanly with `better-sqlite3` and contained the exact school/user rows (including `_app_migrations`); the uploaded file came back byte-identical.
- **Restore path also verified, not just the file's validity**: extracted a real backup and pointed a *completely independent* fresh server instance at it (different process, different `JWT_SECRET`, different upload directory — nothing shared with the original) — logged in successfully with the original school admin's credentials and got back the correct school data. This is the actual disaster-recovery scenario, not just "the zip opens."
- Auth verified from both directions: `SCHOOL_ADMIN` → 200 with a valid zip; `SUPERADMIN` → 403 (correctly rejected, not just unauthenticated); no token → 401.
- Re-ran the entire bootstrap-to-backup flow through the **fully assembled launcher-managed release** (not just the API directly) to confirm the feature works in the actual shipped shape, not only in a more isolated API-only test.
- **Not done**: did not visually click through the Settings page in a real browser window (no screenshot/visual-inspection tool available) — verified via build-artifact inspection (the UI strings compiled into the correct nested bundle path) and `tsc --noEmit`, not by looking at it. Worth a real look once there's a way to check.
