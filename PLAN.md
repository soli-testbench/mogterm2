# Implementation Plan: Decoupled Bell Event Emission

## Summary

Add a bell event callback to both engine implementations (`src/engine.ts` and `src/terminal.js`) that fires when a BEL control code (0x07) is parsed. The engine stays agnostic to how the bell is handled (audio, visual, or ignored).

## Current State

### Two Engine Implementations

1. **`src/engine.ts`** (`MogTermEngine`) — TypeScript engine with inline parser. Used by the test adapter (`src/adapter.ts`) and test suite (`test/terminal.test.ts`). BEL (0x07) is currently silently ignored in `groundState()` — it doesn't match any control code check and fails the `code >= 0x20` printable test.

2. **`src/terminal.js`** (`Terminal`) — JavaScript engine using `Parser` from `src/parser.js`. BEL is dispatched via `parser.onExecute(0x07)` and handled in `_execute()` as a no-op `break`.

### Existing Event Pattern

The codebase uses **simple callbacks** (not EventEmitter). The parser in `parser.js` exposes `onPrint`, `onExecute`, `onCsiDispatch`, `onEscDispatch`, `onOscDispatch` — all nullable function properties set by the consumer. This is the established convention.

## Design Decision: Callback vs EventEmitter

**Choice: Simple callback property** (`onBell: (() => void) | null`)

**Rationale:**
- Matches the existing convention used throughout `parser.js` and `terminal.js`
- No new dependencies needed
- Satisfies all acceptance criteria: registering no handler silently ignores BEL, UI layer can register a handler
- Simpler than introducing an EventEmitter pattern that doesn't exist in the codebase
- The acceptance criteria say "callback, listener, or event emitter" — callback is sufficient

## Changes Required

### 1. `src/engine.ts` — MogTermEngine

- Add public property: `onBell: (() => void) | null = null`
- In `groundState()`, add a check for `code === 0x07` that calls `this.onBell?.()`
- Place it alongside the other C0 control code checks (after TAB, before the printable check)

### 2. `src/terminal.js` — Terminal

- Add public property: `this.onBell = null` in constructor
- In `_execute()`, update `case 0x07` to call `this.onBell?.()` instead of bare `break`

### 3. `test/terminal.test.ts` — New test suite

- Add a new test suite "Bell event" with fixtures or inline tests:
  - BEL byte fires the onBell callback exactly once
  - Multiple BEL bytes fire multiple events (no debouncing)
  - No handler registered = no error (silent ignore)
  - BEL inside other content still fires (e.g., "Hello\x07World")
  - BEL carries no payload (callback receives no arguments)

### 4. `src/adapter.ts` — Test adapter (optional)

- May need minor update if tests require bell tracking through the adapter, but since bell tests can instantiate `MogTermEngine` directly in the test file, this is likely unnecessary.

## Files Changed

| File | Change |
|------|--------|
| `src/engine.ts` | Add `onBell` callback property, handle 0x07 in `groundState()` |
| `src/terminal.js` | Add `onBell` callback property, invoke in `_execute()` case 0x07 |
| `test/terminal.test.ts` | Add bell event test suite |

## Scope Assessment

**Mode: single**

This is a well-contained, small feature:
- 3 files modified, ~30 lines of code total
- No new dependencies
- No architectural changes
- Clear acceptance criteria
- All changes are in the same domain (engine layer)

Parallel execution would add overhead without benefit — the changes are tightly coupled and trivial in scope.

## Sources

- Codebase analysis: `src/parser.js` callback pattern (lines 31-36), `src/terminal.js` `_execute` method (lines 137-156), `src/engine.ts` `groundState` method (lines 88-125)
- BEL control code: standard C0 control character 0x07 per ECMA-48 / ANSI X3.64
