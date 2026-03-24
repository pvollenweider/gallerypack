# ADR-003: Engine isolation strategy

**Status:** Accepted
**Date:** 2026-03-24

## Context

The build engine (Sharp image processing, HTML generation) is CPU and memory intensive. In the current architecture it runs in-process in the same Node.js server that handles HTTP requests, blocking the event loop during heavy builds.

Options:
1. Keep in-process (current) — simple, no IPC overhead
2. Spawn a child process per build (current approach: `child_process.spawn('node', ['build/index.js', slug])`) — isolates crashes, but unstructured
3. Move to a dedicated worker process connected via a job queue
4. Use worker_threads

## Decision

**Phase 1–2:** Keep the current `spawn('node', ['build/index.js', slug])` pattern. It already gives process isolation and crash containment. The API server enqueues a job in `server/data/jobs.json`, spawns the build, and streams stdout via SSE — this works and is battle-tested.

**Phase 3+:** Migrate to a proper queue (SQLite-backed in Phase 3, Redis-backed optionally in Phase 4). The `workers/builder` package will be a long-running process that polls the queue, calls the engine package directly (no subprocess spawn), and writes results back to the queue table.

The engine package (`packages/engine`) is pure functions — no global state, no HTTP, no file system side effects beyond the `src/` and `dist/` directories it is given. This makes it safe to call from both the worker and from tests.

## Consequences

- No breaking change to the current CLI or hosted server in Phase 1
- `packages/engine` must not import anything from `apps/api` (one-way dependency)
- Build progress streaming changes in Phase 3: instead of piping child process stdout to SSE, the worker writes progress events to a `build_events` table, and the API streams them via SSE (polling or LISTEN/NOTIFY equivalent for SQLite = polling every 500 ms)
- Worker restarts are handled by the OS process manager (systemd / Docker restart policy); no internal retry logic in Phase 1
