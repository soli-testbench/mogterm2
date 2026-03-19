# Plan: Add Dynamic Terminal Resize Support

## Overview

Add real-time resize detection and handling to the MogTerm terminal emulator. The `Terminal.resize(cols, rows)` method already exists and handles internal state updates. This feature adds the detection and notification layers in `renderer.js`.

## Architecture

All changes are contained in `src/renderer.js` (primary) and `demo/index.html` (demo integration). No new dependencies needed — `ResizeObserver` is a native browser API.

### Components

1. **Cell dimension measurement** — Create a hidden `<span>` with the terminal's font settings, measure a single character's bounding box to get `charWidth` and `charHeight`. Remeasure on font changes.

2. **ResizeObserver** — Attach to `this.container` in the `Renderer` constructor. On resize, compute new `cols` and `rows` from `(containerWidth - padding) / charWidth` and `(containerHeight - padding) / charHeight`, floored.

3. **Debounce** — Use a simple `setTimeout`/`clearTimeout` debounce (100ms) to avoid excessive recomputation during continuous dragging.

4. **Terminal state update** — Call `this.terminal.resize(cols, rows)` with the new dimensions, then call `this.render()` to re-render.

5. **PTY notification** — Emit a callback `this.onResize(cols, rows)` that consumers can hook into to notify backend/PTY. The demo page will log resize events to demonstrate the hook.

### Key Decisions

- **No new dependencies**: `ResizeObserver` has >96% browser support (caniuse.com). No polyfill needed.
- **Measurement approach**: Use a hidden off-screen `<span>` with the same font/size to measure character cell dimensions. This is the standard approach used by xterm.js and other terminal emulators.
- **Debounce value**: 100ms — standard value balancing responsiveness and performance.
- **Callback pattern for PTY notification**: Rather than assuming a specific transport (WebSocket, HTTP, etc.), expose an `onResize(cols, rows)` callback on the Renderer. This matches the existing callback pattern used elsewhere in the codebase (e.g., `Parser.onPrint`, `Mogterm.onCommand`).

### Files Changed

| File | Change |
|------|--------|
| `src/renderer.js` | Add `_measureCellSize()`, `_setupResizeObserver()`, debounce logic, `onResize` callback |
| `demo/index.html` | Make terminal container resizable, hook `onResize` to log/display resize events |
| `test/terminal.test.js` | Add resize-related tests (terminal.resize already tested; add edge cases) |

### Acceptance Criteria Mapping

1. **ResizeObserver on container** → `_setupResizeObserver()` in Renderer constructor
2. **Cell dimension measurement** → `_measureCellSize()` creates hidden span, measures charWidth/charHeight
3. **Debounce** → `setTimeout`/`clearTimeout` at 100ms in observer callback
4. **Call terminal.resize()** → Observer callback computes cols/rows, calls `this.terminal.resize()`
5. **PTY notification** → `this.onResize?.(cols, rows)` callback after resize
6. **Re-render after resize** → `this.render()` called after `terminal.resize()`
7. **Existing functionality preserved** → All existing tests continue to pass

## Sources

- ResizeObserver API: MDN Web Docs (native browser API, no polyfill needed)
- Cell measurement technique: standard approach used by xterm.js, measuring a monospace character in a hidden element
