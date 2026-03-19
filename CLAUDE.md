# Integration Summary

## Plan Branch
agent/73047d31-b9aa-4262-9d19-24eac57184c8

## Suggested PR Title
feat(renderer): add dynamic terminal resize support

## Suggested PR Description
## Summary
- Added `ResizeObserver`-based container resize detection in `Renderer` class with 100ms debounce
- Added `_measureCellSize()` to compute character cell dimensions from rendered font for accurate cols/rows calculation
- Added `onResize(cols, rows)` callback for PTY/SIGWINCH notification to backend
- Added `dispose()` method for cleanup of observer and timers
- Added 5 new resize edge-case tests (grow, shrink/clamp cursor, 1x1, scroll region reset, post-resize functionality)

## Test plan
- [x] All 119 existing + new tests pass (`node test/terminal.test.js`)
- [x] Resize grow preserves content
- [x] Resize shrink clamps cursor to new bounds
- [x] Resize to 1x1 works without errors
- [x] Scroll region resets on resize
- [x] Terminal operations work correctly after resize

🤖 Generated with [Claude Code](https://claude.com/claude-code)

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