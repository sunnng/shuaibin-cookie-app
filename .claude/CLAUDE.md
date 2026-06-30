# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository contains two projects:
- `shuaibin-cookie-app` — TypeScript management platform (Turborepo + Elysia + React).
- `shuaibin-cookie-client` — Lua automation script for the 懒人精灵 platform, packaged as an APK and run inside Android emulators.

## Common Commands

All commands use `bun` (pinned to `bun@1.3.14`) and are run from the repository root unless noted.

### Development
- `bun install` — Install dependencies.
- `bun run dev` — Start web (Vite on port 3001) and server (Elysia on port 3000) in parallel via Turbo.
- `bun run dev:web` — Start only the web app.
- `bun run dev:server` — Start only the API server.
- `cd apps/web && bun run desktop:dev` — Start the Tauri desktop app in dev mode.
- `cd apps/web && bun run desktop:build` — Build the Tauri desktop app.

### Build & Type Check
- `bun run build` — Build all packages and apps.
- `bun run check-types` — Run TypeScript type checks across the monorepo.
- `cd apps/server && bun run compile` — Build a standalone `server` binary with Bun (`bun build --compile`).
- `cd apps/server && bun run start` — Run the compiled server from `dist/index.mjs`.
- `cd apps/web && bun run serve` — Preview the built web app.

### Database (SQLite/libSQL via Drizzle)
Run from root; commands are forwarded to `@shuaibin-cookie-app/db`:
- `bun run db:local` — Start local Turso dev server (`turso dev --db-file local.db`).
- `bun run db:push` — Push schema changes to the database.
- `bun run db:generate` — Generate Drizzle migrations.
- `bun run db:migrate` — Run migrations.
- `bun run db:studio` — Open Drizzle Studio.

### Lint & Format
- `bun run check` — Run Ultracite/Biome checks.
- `bun run fix` — Auto-fix Ultracite/Biome issues.

### Tests
There is no test runner configured in this project yet. If tests are added, use Bun's built-in runner: `bun test` (or `bun test <path>` for a single file).

### Client Script (`shuaibin-cookie-client`)
The client is a 懒人精灵 (LanRen) Lua project. It is not built from the command line:
- Open `shuaibin-cookie-client/帅斌饼干/帅斌饼干.lcprojit` in the LanRen IDE.
- Build/package the project from the IDE to produce the APK (`com.sun.cookierunkingdom`).
- Upload the resulting APK via the management web UI (`/scripts`), then assign and start it on a simulator.

## Game Script Control Center (`shuaibin-cookie-app`)

`shuaibin-cookie-app` is the management platform. It manages Android emulator instances, uploads the `shuaibin-cookie-client` script APKs, schedules tasks, and communicates bidirectionally with running scripts over WebSocket.

### Database Tables

Defined in `packages/db/src/schema/`:

- `simulators` — Emulator instances.
  - `id`, `name`, `brand` (`leidian` | `mumu` | `bluestacks` | `adb`)
  - `adbId`, `adbPort`, `androidId` (stable device identifier from `settings get secure android_id`)
  - `status` (`offline` | `online` | `busy`)
  - `resolution`, `createdAt`, `lastSeen`
- `tasks` — Script assignments.
  - `id`, `simulatorId`, `scriptName`, `scriptPackage`, `scriptVersion`
  - `status` (`idle` | `running` | `paused` | `completed` | `error`)
  - `progress`, `currentMessage`, `retryCount`, `maxRetries`
  - `startedAt`, `finishedAt`, `createdAt`

### API & Service Modules

- `packages/api/src/routers/simulator.ts` — `list`, `discover`, `launch`, `shutdown`, `delete`, `arrange`.
- `packages/api/src/routers/script.ts` — `list`, `delete`, `byPackage`.
- `packages/api/src/routers/task.ts` — `list`, `assign`, `start`, `pause`, `resume`, `stop`, `restart`, `logs`. `start`, `pause`, `resume`, and `stop` accept `{ taskIds: string[] }` and operate in batches.
- `packages/api/src/services/simulator-discovery.ts` — Discovers LeiDian, MuMu, and generic adb devices; launch/shutdown/window arrangement; `setupAdbReverse` / `removeAdbReverse`; `isClientRunning` / `scanRunningClients`; `getEmulatorAndroidId`.
- `packages/api/src/services/client-monitor.ts` — Periodic scan of online simulators for the running Client APK and in-memory status cache.
- `packages/api/src/services/apk-parser.ts` — Extracts `packageName`, `versionName`, and `mainActivity` via `aapt`, with AXML binary fallback.
- `packages/api/src/services/script-store.ts` — JSON metadata store plus APK files in `apps/server/data/scripts/`.
- `packages/api/src/services/task-runner.ts` — adb install/start/stop/restart task operations.
- `packages/api/src/services/websocket-store.ts` — In-memory device/monitor connections and per-device log cache (500 entries).
- `packages/api/src/services/watchdog.ts` — 10s interval heartbeat monitor; auto-retry on timeout, alert when retries exhausted.

### Server Endpoints

In `apps/server/src/index.ts`:

- `POST /api/scripts/upload` — Multipart APK upload; parses metadata, stores the file in `apps/server/data/scripts/`, and persists JSON metadata.
- `WS /ws/script` — Device channel. Messages: `register`, `heartbeat`, `status`, `log`.
- `WS /ws/monitor` — Dashboard channel. Receives broadcasts; accepts `sendCommand` to forward to devices.
- `/rpc*` and `/api-reference*` — oRPC RPC and OpenAPI reference.

### Frontend Routes

In `apps/web/src/routes/`:

- `/` — Landing page.
- `/dashboard` — Task control console with bulk actions, task table, and assign dialog.
- `/scripts` — Script library with APK upload and delete.
- `/devices` — Simulator management with discover, launch, shutdown, delete, and arrange buttons.

### Runtime Data & Environment

- `apps/server/data/scripts/` — Stored APK files and `scripts.json` metadata.
- `local.db` — SQLite file used by default `DATABASE_URL`.

Server-side emulator tool paths can be overridden via environment variables:

- `LEIDIAN_PATH` — Path to `ldconsole.exe` (default: discovered in common LeiDian install locations).
- `MUMU_PATH` — Reserved for MuMu CLI path.
- `ADB_PATH` — Path to `adb` executable (default: discovered from LeiDian bundle, Android SDK, or `adb` on PATH).
- `AAPT_PATH` — Path to `aapt` executable (default: discovered from `ANDROID_HOME`/`ANDROID_SDK_ROOT`).

## Client Script Architecture (`shuaibin-cookie-client`)

`shuaibin-cookie-client/帅斌饼干` is a Lua script for the **懒人精灵** (LanRen) platform. It is packaged by the LanRen IDE into an APK (package `com.sun.cookierunkingdom`) and runs inside Android emulators. The management server (`shuaibin-cookie-app`) discovers emulators, installs the APK, and starts it via adb.

### Entry Point & Startup Flow
- Entry: `帅斌饼干/脚本/main.lua` → `require("ui.app").init()`.
- `ui/app.lua` bootstraps in order:
  1. `lib.hot-update.runOnStartup()` — check remote `update.txt` and install `sb.lrj` if newer.
  2. `lib.license.init()` — 百宝云 license/authorization.
  3. `lib.ocr.init(...)` — initialize TomatoOCR.
  4. Build imgui window (功能 / 配置 / 卡密 tabs).
  5. On 「启动脚本」 click: verify license, close UI, set `Runtime.register = Register.all`, then `Runtime.run()`.

### Core Framework
| Module | Path | Responsibility |
|---|---|---|
| `Runtime` | `core/runtime.lua` | Permanent run engine: main loop, guard/scheduler init, idle waiting. |
| `Scheduler` | `core/scheduler.lua` | Serial task scheduling; first matching condition runs its action. |
| `Guard` | `core/guard.lua` | Popup-trap registry and scan; long sleeps are sliced to call `Guard.check()`. |
| `StateMachine` | `core/state-machine.lua` | Minimal per-task state machine with retry/timeout semantics. |
| `TaskBuilder` | `game/task-builder.lua` | Wrapper around `Scheduler.add` for feature flags, readiness, and leave-square logic. |
| `Register` | `game/register.lua` | Injects all business tasks, guard traps, and idle providers. |
| `StatusHud` | `lib/status-hud.lua` | Top floating status bar. |
| `DeviceWs` | `lib/device-ws.lua` | Connects to management server `WS /ws/script`: register/heartbeat/status/log + handles command. |
| `IntentExtra` | `lib/intent-extra.lua` | Reads `device_id` / `ws_address` from the launch Intent. |
| `UserConfig` | `lib/user-config.lua` | Merges `config.lua` defaults with persisted store data. |

### Runtime Main Loop (`Runtime.run`)
```
while true do
    if DeviceWs.shouldStop() then break end
    Guard.check()                              -- clear popups first
    if DeviceWs.isPaused() then
        Guard.sleep(GUARD_INTERVAL_MS, GUARD_INTERVAL_MS)
    else
        hasWork, ok = Scheduler.run(STOP_ON_ERROR) -- execute one serial round
        if not ok then return end                  -- fatal error path
        if hasWork then
            DeviceWs.sendStatus("running", nil, "执行中")
            Guard.sleep(STEP_DELAY_MS, GUARD_INTERVAL_MS)
        else
            -- idle wait driven by Scheduler.getIdleProviders()
            wait according to nearest timer or default IDLE_DELAY_MS
        end
    end
end
```
- `GUARD_INTERVAL_MS` = 500, `STEP_DELAY_MS` = 5000, `IDLE_DELAY_MS` = 30000.
- Idle providers return `(remainSeconds, label)` so the HUD shows e.g. "勘查 120s · 战斗 3600s".
- `DeviceWs.start()` is called at the beginning of `Runtime.run()`; all logs are forwarded via a `Logger` sink.

### Business Modules
Each major game feature lives under `game/` and typically has:
- `*_任务.lua` — high-level task/runner (`SquareTask.run()`).
- `*_会话.lua` — daily completion flags, cooldowns, progress persistence via `lib.store`.
- `*_页面.lua` — screen detection and tap helpers.
- `*_路由.lua` — navigation between screens.
- `*_特征库.lua` / `*_坐标库.lua` — image/color features or fixed coordinates.

Registered tasks (priority order in `game/register.lua`):
1. 矿山勘查 / 矿山开采 / 矿山战斗 / 解除洋菜冻
2. 海滩交易所 / 王国竞技场 / 梦幻繁星岛 (yield to mine tasks)
3. 布谷鸟广场 (yields to mine tasks)
4. 洗脆饼词条 (does not yield)

`TaskBuilder.new("name", opts)` handles feature switch, readiness check, optional `precondition`, `leaveSquare`, and logging. Non-mine tasks usually set `precondition = isMineSchedulerIdle` so mine tasks run first.

### Management Server Device Channel (`lib/device-ws.lua`)
- Connects to the management server's `WS /ws/script` endpoint.
- Reads `ws_address` and `device_id` from the launch Intent (fallback to `config.lua` `STATIC.SERVER`).
- When neither Intent nor config provides `device_id`, uses `lib.device-info.getStableDeviceId()` (Android ID / `getDeviceId()`) so manually started clients can still be identified.
- On connect: sends `{ type: "register", deviceId, brand, model, width, height }`.
- Sends `{ type: "heartbeat" }` every `SERVER.HEARTBEAT_INTERVAL_SEC` seconds.
- Sends `{ type: "status", status, progress?, message? }` on state changes and during idle.
- Sends `{ type: "log", level, message }` via a `Logger` sink so all logs are forwarded.
- Receives `{ type: "command", command, payload? }` from the server:
  - `pause` — sets `DeviceWs.isPaused()` to true; `Runtime.run()` skips task execution.
  - `resume` — clears the paused flag.
  - `stop` — sets `DeviceWs.shouldStop()` to true; `Runtime.run()` exits cleanly.
- Auto-reconnects with `SERVER.RECONNECT_DELAY_SEC` backoff.

### Stable Device Identifier (`lib/device-info.lua`)
- `DeviceInfo.getAndroidId()` reads `Settings.Secure.ANDROID_ID` via Java reflection.
- `DeviceInfo.getStableDeviceId()` returns `ANDROID_ID` if available, otherwise falls back to `getDeviceId()`.
- Used by `lib.device-ws` when the server did not pass `device_id` in the launch Intent, enabling auto-binding after manual APK starts.

**Note:** The old `lib/remote-control/` module (independent WebSocket remote control on port 8080) has been removed. The client now talks directly to `shuaibin-cookie-app`'s management server protocol.

### Client Configuration (`config.lua`)
`config.lua` is the single static config source. Key sections:
- `STATIC.DISPLAY` — assumed screen size (1600×900).
- `STATIC.HOT_UPDATE` — remote update URL/version/package.
- `STATIC.LICENSE` — 百宝云 activation API.
- `STATIC.OCR` — TomatoOCR license and engine params.
- `STATIC.RUNTIME` — main-loop timing.
- `STATIC.SERVER` — management server `WS /ws/script` URL, heartbeat interval, reconnect delay, and optional fallback `DEVICE_ID`.
- `STATIC.USER` — default user settings (mine, biscuit, square, seasideMarket, arena, starlight).

### Important Client Conventions
- Use `lib.store` (wrapping LanRen's `readFile`/`writeFile` JSON store) for persistence, not raw file IO.
- Use `lib.logger` for consistent log output; logs are automatically forwarded to the management server via `lib.device-ws` when connected.
- Use `Guard.sleep(ms, stepMs)` instead of raw `sleep()` for long waits so popup traps keep firing.
- Return `false` from a task `action` to indicate expected failure; unhandled exceptions respect `STOP_ON_ERROR`.
- Feature files under `game/` are loaded by `game/register.lua`; add new features there and register an idle provider if the feature has cooldowns.
- Server commands (`pause`, `resume`, `stop`) are handled by `lib.device-ws`; do not add custom command dispatchers unless the server is updated accordingly.

## Project Architecture

This repository contains two independent but related projects:
- `shuaibin-cookie-app` — Turborepo management platform generated by Better-T-Stack.
- `shuaibin-cookie-client` — Lua automation script for the 懒人精灵 platform.

### Server/Web Workspace Layout
- `apps/web` — Vite + React 19 + TanStack Router frontend. Runs on port 3001.
- `apps/server` — Elysia + oRPC backend. Runs on port 3000. Exposes `/rpc` and `/api-reference`. Built with `tsdown`.
- `packages/api` — Shared oRPC router, procedures, and context definitions consumed by both server and web.
- `packages/db` — Drizzle ORM schema, migrations, and database client.
- `packages/ui` — Shared shadcn/ui components and global Tailwind styles.
- `packages/env` — T3-style environment validation via `@t3-oss/env-core` (`server.ts` and `web.ts`).
- `packages/config` — Shared `tsconfig.base.json`.

### Data Flow
1. APKs are uploaded via `POST /api/scripts/upload`; metadata is stored in `apps/server/data/scripts/scripts.json` and the file in `apps/server/data/scripts/`.
2. Tasks are created via the `task.assign` oRPC procedure and persisted in the `tasks` table.
3. `task.start` calls `installAndStart` in `task-runner.ts`, which uses adb to install the `shuaibin-cookie-client` APK, runs `adb reverse tcp:3000 tcp:3000`, and starts `package/activity` on the simulator.
4. The running client connects to `WS /ws/script` using `ws://localhost:3000/ws/script` (via adb reverse) and sends `register` with a stable device identifier. The server resolves the identifier against `simulators.androidId` and binds the WebSocket to the matching simulator record.
5. `client-monitor.ts` independently scans online simulators for the Client APK process and exposes `clientRunning`/`clientCheckedAt` via `simulator.list`.
5. Server handlers update the `tasks` table and broadcast to monitors via `websocket-store.ts`.
6. Dashboard clients connect to `WS /ws/monitor` to receive broadcasts and send `sendCommand` messages back to devices.
7. Frontend components call `orpc.<procedure>.queryOptions()` from `apps/web/src/utils/orpc.ts`.
8. `orpc` is `createTanstackQueryUtils` wrapping an `RPCLink` to `${VITE_SERVER_URL}/rpc`.
9. The server mounts `RPCHandler` on `/rpc*` and `OpenAPIHandler` on `/api-reference*` inside an Elysia app.
10. The shared `appRouter` in `packages/api/src/routers/index.ts` defines procedures using `publicProcedure` from `packages/api/src/index.ts`.
11. `packages/api/src/context.ts` creates the request context (`auth`/`session` currently null).
12. `packages/db/src/index.ts` exports a `createDb()` factory and a singleton `db` using libSQL.

### Important Conventions
- **Imports in `apps/web`**: use `@/` for local source and `@shuaibin-cookie-app/ui/*` for shared UI.
- **Imports in `apps/server`**: use `@/` for local source.
- **Shared packages** are imported via their workspace names (e.g., `@shuaibin-cookie-app/api/routers/index`).
- **Routes**: TanStack Router is file-based. Add files under `apps/web/src/routes/`. The generated `routeTree.gen.ts` is created at build/dev time.
- **Styling**: Tailwind CSS v4 with CSS variables defined in `packages/ui/src/styles/globals.css`; the web app imports them via `@shuaibin-cookie-app/ui/globals.css`.
- **shadcn/ui**: Shared primitives live in `packages/ui/src/components`. The UI package uses `@base-ui/react` and `@shadcn/react` for headless primitives. Add shared components with `npx shadcn@latest add <component> -c packages/ui`. App-specific blocks can be added from `apps/web`.
- **Environment variables**: Server reads `apps/server/.env` (`DATABASE_URL`, `CORS_ORIGIN`, `NODE_ENV`); web reads `apps/web/.env` (`VITE_SERVER_URL`). These are committed files, not `.env.example`.

### Tauri Desktop
- Config is in `apps/web/src-tauri/tauri.conf.json`.
- Dev URL is `http://localhost:3001`; frontend dist is `../dist`.
- Desktop commands must be run from `apps/web`.

## Code Standards

This project uses **Ultracite** (Biome-based). The Biome config is in `biome.json` and extends `ultracite/biome/core` and `ultracite/biome/react`.

- Use `const` by default; `let` only when reassigning; never `var`.
- Prefer `for...of` over `.forEach()` and indexed `for` loops.
- Use optional chaining (`?.`) and nullish coalescing (`??`).
- Use arrow functions for callbacks and short functions.
- Prefer `unknown` over `any`; use type narrowing over type assertions.
- Function components only; call hooks at top level.
- Use `key` with unique IDs in lists.
- Provide meaningful `alt` text, labels, and semantic HTML.
- Add `rel="noopener"` to `target="_blank"` links.
- Avoid `dangerouslySetInnerHTML`, `eval()`, and direct `document.cookie` assignment.
- Remove `console.log`, `debugger`, and `alert` before committing.
- React 19+: use `ref` as a prop, not `React.forwardRef`.
- Tailwind classes in JSX use `className`; Biome's `useSortedClasses` rule will sort classes in `clsx`/`cva`/`cn` calls.

Most formatting is auto-fixed. Focus manual review on business logic, naming, architecture, edge cases, and accessibility.
