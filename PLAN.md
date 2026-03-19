# Plan: Add Terminal Scrollback Buffer

## Overview

Add a scrollback buffer to the VT100 terminal engine (`terminal.js`) that captures rows evicted by `_scrollUp`, and update the DOM renderer (`renderer.js`) to support viewport scrolling through the buffer via mouse wheel and keyboard shortcuts.

## Architecture

### 1. Scrollback Buffer in `terminal.js`

**Ring buffer implementation**: Use a plain array with a configurable max size (`scrollbackLines`, default 1000). When `_scrollUp` evicts a row from the visible grid and we are on the **primary screen buffer** (not alternate screen), push a deep copy of the evicted row onto the scrollback array. When the array exceeds the limit, shift the oldest entry off.

Key design decisions:
- **Deep copy on capture**: Rows are arrays of cell objects with `attr` sub-objects. We must clone them when capturing to avoid mutation.
- **Primary buffer only**: When mode 1049 (alternate screen) is active, `_scrollUp` must NOT capture rows. Track this with a boolean `_altScreenActive` flag set in `_setPrivateMode`.
- **Exposed via constructor option**: `new Terminal(cols, rows, { scrollbackLines: 1000 })`. The third parameter is an options object.
- **Exposed via `getState()`**: Add `scrollback` array and `scrollbackLength` to the state object so the renderer can access it.
- **`clearScrollback()`** method for ED mode 3 (erase display + scrollback).

### 2. Viewport Scrolling in `renderer.js`

The renderer currently renders exactly `state.rows` rows from `state.cells`. With scrollback, the "virtual" content is `scrollback.concat(cells)` — the scrollback rows above, the live grid below.

**Scroll offset model**: `_scrollOffset` is the number of rows the viewport is scrolled UP from the bottom (live position). `0` = live mode (pinned to bottom). Max = `scrollback.length`.

**Rendering with offset**:
- Total virtual rows = `scrollback.length + state.rows`
- Viewport shows rows `[totalRows - state.rows - _scrollOffset, totalRows - _scrollOffset)`
- When `_scrollOffset === 0`, this is exactly the live `state.cells` — no change from current behavior
- When scrolled up, we slice from the combined virtual buffer

**Event handling**:
- `wheel` event on container: deltaY > 0 scrolls down (decrease offset), deltaY < 0 scrolls up (increase offset). Clamp to [0, scrollback.length].
- `keydown` on container (requires `tabindex`): PageUp/PageDown scroll by `state.rows` lines. End key snaps to live (offset = 0).
- Container needs `tabindex="0"` and `outline: none` for keyboard focus.

**New content indicator**: When `_scrollOffset > 0` and new content arrives (detected on `render()` when scrollback length increases or live grid changes), show a small "New output below" bar at the bottom of the container. Clicking it snaps to live.

**Auto-scroll behavior**: When `_scrollOffset === 0` (live mode), new output auto-scrolls as before. When scrolled up, `_scrollOffset` stays fixed — new content pushes into scrollback, increasing the total buffer, but the viewport doesn't move.

### 3. Files Changed

| File | Changes |
|------|---------|
| `src/terminal.js` | Add scrollback buffer array, capture in `_scrollUp`, options constructor param, alt-screen guard, expose in `getState()`, `clearScrollback()`, reset scrollback in `reset()` |
| `src/renderer.js` | Add `_scrollOffset` state, wheel/keyboard handlers, viewport rendering from scrollback+cells, "new output" indicator, CSS for indicator |

### 4. Testing Strategy

- Existing tests must continue to pass (scrollback changes are additive and don't alter the visible grid behavior).
- Manual verification via `demo/index.html` — run demos that produce lots of output, scroll up/down with wheel and keys.

## Scope Assessment

**Single agent** — all changes are tightly coupled: the buffer in terminal.js feeds the viewport logic in renderer.js. No meaningful parallelism.
