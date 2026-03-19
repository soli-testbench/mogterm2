# Integration Summary

## Plan Branch
agent/1f835417-2111-44a1-8917-4c062d8dacdb

## Suggested PR Title
feat(scrollback): add terminal scrollback buffer with viewport navigation

## Suggested PR Description
## Summary

Adds a scrollback buffer to the terminal emulator so users can scroll up to review output that has scrolled off-screen.

### Changes

**`src/terminal.js`**
- Added scrollback ring buffer array, populated when rows are evicted by `_scrollUp()` on the primary screen buffer
- Constructor accepts `options.scrollbackLines` (default 1000) to configure buffer capacity
- Oldest lines are discarded when buffer exceeds the configured limit
- Alternate screen mode (CSI ?1049h/l) sets `_altScreenActive` flag to prevent scrollback capture
- `getState()` exposes `scrollback` array and `scrollbackLength`
- Added `clearScrollback()` method; ED mode 3 now clears scrollback
- `reset()` clears scrollback buffer

**`src/renderer.js`**
- Added scroll offset state (`_scrollOffset`) distinguishing live mode (0) from scrolled-up mode
- Mouse wheel handler scrolls through scrollback buffer (3 lines per tick)
- PageUp/PageDown navigate in page-sized increments
- End key snaps viewport back to live position
- When scrolled up, new output does not force-scroll to bottom
- Visual "New output below" indicator appears when scrolled up and new content arrives; clicking it returns to live mode
- Cursor is only rendered when in live mode

### Acceptance Criteria

- [x] Rows scrolled off top retained in scrollback buffer (configurable max, default 1000)
- [x] Mouse wheel scrolling navigates scrollback
- [x] PageUp/PageDown scroll in page-sized increments
- [x] End key returns to live/bottom position
- [x] New output while scrolled up does NOT force-scroll; indicator shown
- [x] Live mode auto-scrolls as before
- [x] Buffer size configurable via `options.scrollbackLines`
- [x] Oldest lines discarded when buffer exceeds limit
- [x] Alternate screen buffer mode does not interact with scrollback

### Testing

All 97 existing tests pass with zero regressions. Scrollback logic verified with inline integration tests covering buffer capture, capping, alt-screen guard, getState exposure, clearScrollback, and reset behavior.
## Merged Sub-Branches
agent-task-1f835417-sub-0

---

## Original Task

**Description**: Add a scrollback buffer to the terminal emulator so users can scroll up to review output that has scrolled off-screen. When rows are evicted from the visible terminal grid (via `_scrollUp` in `terminal.js`), they should be captured into a capped ring buffer rather than discarded. The `Mogterm` component should support scroll position state, distinguishing between 'live' mode (pinned to bottom) and 'scrolled' mode (viewing history). Navigation through the scrollback buffer should be supported via mouse wheel and keyboard shortcuts (Page Up, Page Down, End to return to live mode). New output arriving while scrolled up should not forcibly snap the viewport to the bottom. A configurable buffer size limit (number of retained lines) should be exposed via the options object.

**Acceptance Criteria**:
1. Rows scrolled off the top of the terminal viewport are retained in a scrollback buffer up to a configurable maximum (default e.g. 1000 lines).
2. Mouse wheel scrolling navigates through the scrollback buffer when the terminal has focus.
3. Page Up and Page Down keys scroll through history in page-sized increments.
4. End key (or equivalent) returns the viewport to the live/bottom position.
5. When the user is scrolled up, new output does NOT force-scroll to bottom; a visual indicator shows that new content is available below.
6. When the user is at the bottom (live mode), new output auto-scrolls as before.
7. The scrollback buffer size is configurable via `options.scrollbackLines` (or similar) passed to the constructor.
8. When the buffer exceeds the configured limit, oldest lines are discarded.
9. Alternate screen buffer mode (CSI ?1049h/l) does not interact with scrollback (scrollback is only for the primary buffer).