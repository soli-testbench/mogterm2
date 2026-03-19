# Integration Summary

## Plan Branch
agent/73047d31-b9aa-4262-9d19-24eac57184c8
## Upstream Repository
soli-testbench/mogterm2

## Suggested PR Title
feat(renderer): add dynamic terminal resize support

## Suggested PR Description
## Summary

Adds dynamic terminal resize support to the terminal emulator, enabling real-time response to window/container resize events.

### Changes

- **Cell measurement** (`_measureCellSize`): Measures character cell dimensions (width/height) by creating a hidden probe span with the terminal's font settings, enabling accurate cols/rows calculation from pixel dimensions.
- **ResizeObserver** (`_setupResizeObserver`): Attaches a `ResizeObserver` to the terminal container to detect size changes automatically.
- **Debouncing**: Resize events are debounced at 100ms to prevent excessive recomputation during continuous resizing.
- **Dimension update** (`_handleResize`): Computes new cols/rows from container pixel size, calls `terminal.resize(cols, rows)` to update internal state, re-renders the terminal, and fires an `onResize` callback for backend PTY notification (SIGWINCH equivalent).
- **Cleanup** (`dispose`): Disconnects the ResizeObserver and clears timers.
- **Tests**: Added resize-specific tests (grow, shrink, 1x1, scroll region reset, post-resize functionality) — all 119 tests pass.

### Acceptance Criteria Met

- [x] ResizeObserver detects container size changes
- [x] Character cell dimensions measured from rendered font
- [x] Resize events debounced (100ms)
- [x] `terminal.resize(cols, rows)` called with new dimensions
- [x] Backend/PTY notified via `onResize` callback
- [x] Terminal re-rendered correctly after resize
- [x] Existing functionality preserved (scrollback, cursor, escape sequences)
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