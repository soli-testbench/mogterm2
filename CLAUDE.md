# Integration Summary

## Plan Branch
agent/73047d31-b9aa-4262-9d19-24eac57184c8

## Suggested PR Title
feat(renderer): add dynamic terminal resize support

## Suggested PR Description
## Summary

- Added `ResizeObserver` in `renderer.js` to detect container size changes and trigger terminal dimension recalculation
- Implemented character cell measurement (`_measureCellSize`) using a hidden DOM probe element to accurately compute cols/rows from pixel dimensions
- Resize events are debounced at 100ms via `setTimeout`/`clearTimeout` to prevent excessive recomputation
- `terminal.resize(cols, rows)` is called with newly computed dimensions, properly adjusting the cell buffer, cursor position, and scroll region
- An `onResize(cols, rows)` callback notifies the backend/PTY layer of new dimensions (SIGWINCH equivalent)
- Terminal content is re-rendered after resize via `this.render()`
- Added `dispose()` method for cleanup of observer and timers
- All 34 existing tests pass — no regressions

## Test plan
- [x] All 34 existing terminal tests pass
- [x] Verified ResizeObserver setup and debounce logic in renderer.js
- [x] Verified terminal.resize() correctly adjusts buffer dimensions
- [x] Verified onResize callback mechanism for PTY notification

🤖 Generated with [Claude Code](https://claude.com/claude-code)
## Merged Sub-Branches
agent-task-73047d31-sub-0

---

## Original Task

**Description**: Enable the terminal emulator to respond to window/container resize events in real time, updating the terminal dimensions (rows and columns) and notifying the underlying shell/process so that CLI applications reflow their output correctly. The terminal already has a `resize(cols, rows)` method in terminal.js that handles the internal state update. This feature adds the detection and notification layers: (1) measure character cell dimensions from the rendered font to compute cols/rows from pixel dimensions, (2) attach a ResizeObserver in renderer.js to detect container size changes, (3) debounce resize events to avoid excessive recomputation, and (4) notify the backend PTY via a resize message/endpoint (SIGWINCH equivalent) so the attached process adjusts its output dimensions.

**Acceptance Criteria**:
1. A ResizeObserver (or equivalent) on the terminal container detects size changes and triggers terminal dimension recalculation.
2. Character cell dimensions (width/height) are measured from the rendered font to accurately compute columns and rows from container pixel size.
3. Resize events are debounced (e.g., 100-150ms) to prevent excessive recomputation during continuous resizing.
4. The existing `terminal.resize(cols, rows)` method is called with the newly computed dimensions, updating internal terminal state.
5. A message or API call is sent to the backend/PTY layer to notify it of the new terminal dimensions (SIGWINCH equivalent).
6. The terminal content is re-rendered correctly after resize with no visual artifacts.
7. Existing terminal functionality (scrollback buffer, cursor positioning, escape sequence handling) continues to work correctly after resize.