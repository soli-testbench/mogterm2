# Implementation Plan: BEL Control Code Event Emission

## Summary

Wire up BEL (0x07) handling in the Terminal class (`src/terminal.js`) to emit a callback event, and add a default visual bell handler in the Renderer (`src/renderer.js`). This is a small, well-scoped feature that touches 4 files.

## Architecture Analysis

The codebase has two layers relevant to this task:

1. **Terminal engine** (`src/terminal.js`) — Pure state machine. Parser callbacks (`onPrint`, `onExecute`, `onCsiDispatch`, etc.) drive state changes. The `_execute()` method already has a `case 0x07: // BEL` stub that does nothing.

2. **Renderer** (`src/renderer.js`) — DOM renderer that reads terminal state and renders it. Currently has no event subscription — it just reads `terminal.getState()`.

The codebase uses a simple **callback property** pattern for events (e.g., `parser.onPrint`, `parser.onExecute`). Following this pattern, the Terminal class should expose an `onBell` callback property.

## Research

xterm.js added `onBell` in v4.12.0 ([Issue #3014](https://github.com/xtermjs/xterm.js/issues/3014)). Their approach: the terminal emits a bell event, and the UI layer subscribes to it independently. The bell event carries no data (it's a `void` callback). This matches our acceptance criteria for full decoupling.

## Changes

### 1. `src/terminal.js` — Add `onBell` callback

- Add `this.onBell = null;` in the constructor (following the pattern of other state like `this.title`).
- In `_execute()`, change `case 0x07` from a bare `break` to `this.onBell?.(); break;`. The optional chaining (`?.`) ensures no error if no handler is registered (AC #5).
- In `reset()`, set `this.onBell` back to `null` is NOT needed — the callback is external configuration, not terminal state. The `title` callback pattern shows that external registrations persist across resets.

### 2. `src/renderer.js` — Add visual bell handler

- Add a `_setupBellHandler()` method called from the constructor that subscribes to `terminal.onBell`.
- The handler adds a CSS class (`mogterm-visual-bell`) to the container for a brief flash, then removes it after the animation completes.
- The flash uses a CSS animation (opacity pulse or border flash) defined inline or via a `<style>` injection to keep it self-contained.

### 3. `src/mogterm.css` — Add visual bell animation

- Add `.mogterm-visual-bell` class with a brief flash keyframe animation.

### 4. `test/terminal.test.js` — Add bell event test

- Add a test that creates a Terminal, registers an `onBell` callback, writes `\x07`, and asserts the callback was invoked (AC #6).
- Add a test verifying no error when BEL is processed without a handler registered.

## Files Changed

| File | Change |
|------|--------|
| `src/terminal.js` | Add `onBell` property, invoke from `case 0x07` |
| `src/renderer.js` | Subscribe to `terminal.onBell`, trigger visual flash |
| `src/mogterm.css` | Add `.mogterm-visual-bell` animation keyframes |
| `test/terminal.test.js` | Add bell callback test |

## Scope Assessment

**Mode: single** — This is a small, tightly coupled feature. All changes are sequential and interdependent (the test needs the callback, the renderer needs the callback). No benefit from parallelism.

## Acceptance Criteria Mapping

| AC | Implementation |
|----|---------------|
| 1. Terminal exposes `onBell` callback | `this.onBell = null` in constructor |
| 2. `case 0x07` invokes bell callback | `this.onBell?.()` in `_execute()` |
| 3. UI/Renderer has visual bell handler | `Renderer._setupBellHandler()` with CSS flash |
| 4. Engine doesn't depend on rendering | `onBell` is a plain callback, no DOM imports |
| 5. No errors without handler | `?.()` optional chaining |
| 6. Test verifies bell event | New test in `terminal.test.js` |
