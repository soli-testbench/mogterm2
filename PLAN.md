# Plan: Add Dynamic Terminal Resize Support

## Current State

The renderer (`src/renderer.js`) already has the core resize infrastructure from commit `4859e31`:
- `_measureCellSize()` — measures character cell dimensions from rendered font
- `_setupResizeObserver()` — attaches ResizeObserver with debouncing (100ms)
- `_handleResize()` — computes cols/rows, calls `terminal.resize()`, re-renders, fires `onResize` callback
- `dispose()` — cleanup method for observer and timers
- `onResize` callback property for PTY/backend notification

## Remaining Work

The **demo page** (`demo/index.html`) needs updates to exercise and demonstrate the resize feature:

1. **CSS resize handle** — Add `resize: both; overflow: hidden;` and explicit dimensions to `#terminal-container` so users can drag to resize
2. **Status indicator** — Add a visible element showing current `cols x rows` that updates in real time
3. **Hook onResize** — Wire `renderer.onResize` to update the status display and simulate PTY notification

## Architecture

- `src/renderer.js` — Complete, no changes needed
- `src/terminal.js` — Has `resize(cols, rows)` method, no changes needed
- `demo/index.html` — Needs CSS + JS updates for resize demo

## Key Decisions

- **No new dependencies**: `ResizeObserver` has >96% browser support. No polyfill needed.
- **Callback pattern for PTY notification**: `onResize(cols, rows)` callback on Renderer matches existing callback patterns in the codebase.
- **Debounce**: 100ms via setTimeout/clearTimeout — standard value balancing responsiveness and performance.

## Sources

- ResizeObserver API: MDN Web Docs (native browser API)
- Cell measurement technique: standard approach used by xterm.js

## Verification

- All 119 existing tests pass (`node test/terminal.test.js`)
- Demo page shows draggable resize handle on terminal container corner
- Status indicator shows live cols x rows during resize
- All existing demo buttons continue to work after resize
