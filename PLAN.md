# Plan: Fix local demo server connection refused on port 8080

## Problem Analysis

The `server.js` file has two issues preventing the demo from working:

### Issue 1: IPv6/IPv4 Binding
`server.listen(port)` (line 10) is called without a host argument. Per [Node.js docs](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback), when host is omitted the server binds to `::` (IPv6 unspecified address) when IPv6 is available. While most OSes support dual-stack (accepting both IPv4 and IPv6 on `::`), some environments (including containers and sandboxes) may have IPv6 disabled or `localhost` resolving only to `127.0.0.1`, causing "connection refused".

**Fix**: Pass `'0.0.0.0'` as the host to `server.listen()` to explicitly bind to all IPv4 interfaces.

### Issue 2: No Static File Serving
The current server handler only returns a plain text response (`"Hello from mogterm2!"`). It doesn't serve the HTML, CSS, or JS files that make up the demo (`demo/index.html`, `src/*.js`, `src/*.css`, `index.html`). Even if the binding issue were fixed, navigating to `http://localhost:8080` would show plain text, not the demo page.

**Fix**: Replace the stub handler with a static file server that:
- Serves files from the project root directory
- Maps `/` to `index.html` (the project already has one at root)
- Returns correct `Content-Type` headers based on file extension
- Returns 404 for missing files
- Uses only Node.js built-in modules (`node:fs`, `node:path`, `node:http`) — no new dependencies

## Scope

This is a **single-agent** task. Both fixes are in the same file (`server.js`) and are tightly coupled — you can't meaningfully test one without the other.

## Files to Change

- `server.js` — the only file that needs modification

## Implementation Steps

1. Add imports for `node:fs` and `node:path`
2. Define a MIME type map for file extensions used in the project (`.html`, `.css`, `.js`, `.json`, `.ts`)
3. Replace the request handler to:
   - Resolve the requested URL path to a filesystem path relative to the project root
   - Default `/` to `/index.html`
   - Prevent path traversal (reject paths containing `..`)
   - Read the file and serve it with the correct Content-Type
   - Return 404 for missing files
4. Change `server.listen(port, ...)` to `server.listen(port, '0.0.0.0', ...)`
5. Update the console.log to show the full URL including `http://0.0.0.0:${port}`

## Validation

- Start the server with `node server.js`
- Verify `curl http://127.0.0.1:8080/` returns HTML content
- Verify `curl http://127.0.0.1:8080/demo/index.html` returns the demo page
- Verify `curl http://127.0.0.1:8080/src/terminal.js` returns JavaScript
- Run existing tests: `npx tsx --test test/**/*.test.ts` to ensure no regressions

## Sources

- [Node.js net.Server.listen() docs](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback) — confirms `::` default binding behavior
- [Node.js http.createServer() docs](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener) — static file serving pattern
