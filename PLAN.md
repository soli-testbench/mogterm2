# Implementation Plan: BEL Control Code Event Emission with Decoupled UI Rendering

## Summary

Add bell (BEL / 0x07) event emission to the MogTerm terminal engine and provide default audio + visual bell handlers in the renderer/UI layer. The engine stays decoupled from rendering; it simply fires a callback when BEL is encountered in GROUND state. The renderer subscribes to that callback and provides configurable audio bell (Web Audio API) and visual bell (CSS class flash) behavior.

## Codebase Analysis

### Architecture (two parallel stacks)

The project has **two terminal implementations** side by side:

1. **JS stack** (`src/parser.js` + `src/terminal.js` + `src/renderer.js`): Full-featured parser with state machine, CSI/OSC/ESC support, and a DOM renderer. Tests in `test/terminal.test.js`.
2. **TS stack** (`src/engine.ts` + `src/adapter.ts`): Simpler engine with inline parsing, used by the fixture-based test runner (`test/terminal.test.ts`). No separate parser or renderer.

The task description references `Terminal._execute()` and the `onExecute` callback pattern, which exist in the **JS stack**. The `case 0x07: break` no-op is at `src/terminal.js:139-140`. The existing callback-based event model is in `src/parser.js` (callbacks: `onPrint`, `onExecute`, `onCsiDispatch`, `onEscDispatch`, `onOscDispatch`).

The TS engine (`src/engine.ts`) also handles BEL implicitly — its `groundState()` method ignores codes < 0x20 that aren't explicitly handled (BEL 0x07 falls through to the `code >= 0x20` printable check and is silently dropped).

### Key observations

- **OSC BEL handling**: In `src/parser.js:217`, when the parser is in `OSC_STRING` state and encounters 0x07, it dispatches the OSC payload and returns to GROUND — it does NOT call `onExecute`. This means BEL-as-OSC-terminator already does NOT trigger the execute path. Acceptance criterion #6 is satisfied by the existing parser architecture.
- **Callback pattern**: The Terminal class doesn't use an EventEmitter. Callbacks are simple function properties (e.g., `this.parser.onPrint = (ch) => ...`). We should follow this same pattern by adding an `onBell` callback property on Terminal.
- **Renderer**: `src/renderer.js` takes a Terminal instance and calls `terminal.getState()` to render. It has no event subscription mechanism. We'll add bell handling as part of the renderer's setup.
- **Test patterns**: `test/terminal.test.js` uses a custom assert/test framework. `test/terminal.test.ts` uses `node:test` with fixtures via the adapter. New tests should be added to `test/terminal.test.js` (which directly tests Terminal and Parser) since we're testing event emission behavior that doesn't fit the fixture model.

## Changes

### 1. `src/terminal.js` — Emit bell event

- Add `this.onBell = null` property in constructor (follows existing callback pattern).
- In `_execute()`, change the `case 0x07` from a no-op `break` to call `this.onBell?.()`.
- Reset `this.onBell` to `null` in `reset()` is NOT needed — the callback is owned by the consumer, not terminal state. Same as how parser callbacks aren't reset.

### 2. `src/renderer.js` — Bell handlers in UI layer

- Add constructor options for bell configuration: `bellStyle` with values `'sound'`, `'visual'`, `'both'`, or `'none'` (default: `'both'`).
- Subscribe to `terminal.onBell` in the constructor.
- **Audio bell handler**: Use Web Audio API to play a short beep (800Hz sine wave, 200ms, gain 0.3). Create `AudioContext` lazily on first bell (browser autoplay policy requires user gesture context). Use a shared AudioContext instance.
- **Visual bell handler**: Add CSS class `mogterm-bell-flash` to the container for 150ms, then remove it.
- Add the `mogterm-bell-flash` CSS animation to `src/mogterm.css`.

### 3. `src/engine.ts` — Emit bell event (TS stack parity)

- Add `onBell: (() => void) | null = null` property.
- In `groundState()`, add `if (code === 0x07) { this.onBell?.(); return; }` before the printable character check.

### 4. `test/terminal.test.js` — Unit tests

Add tests:
- **BEL in GROUND state triggers bell callback**: Feed `\x07` to a Terminal, verify `onBell` was called.
- **BEL in GROUND state with surrounding text**: Feed `Hello\x07World`, verify bell fires once and text is correct.
- **OSC-terminating BEL does NOT trigger bell**: Feed `\x1b]0;Title\x07`, verify `onBell` was NOT called (only `_oscDispatch` runs).
- **Multiple BEL characters trigger multiple events**: Feed `\x07\x07\x07`, verify callback called 3 times.
- **No crash when onBell is not set**: Feed `\x07` without setting `onBell` — should not throw.

### 5. `src/mogterm.css` — Visual bell animation

```css
.mogterm-bell-flash {
  animation: mogterm-bell-flash 0.15s ease-out;
}

@keyframes mogterm-bell-flash {
  0% { filter: brightness(1.8); }
  100% { filter: brightness(1); }
}
```

## Scope Assessment

This is a **single** agent task:
- All changes are tightly coupled (engine emits event → renderer handles it → tests verify both).
- Total changes span ~5 files with small modifications each.
- No new dependencies needed.
- No parallelizable boundaries — the renderer handler depends on the engine event, and tests verify the integration.

## Research Sources

- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API) — AudioContext + OscillatorNode pattern for generating beep sounds.
- [xterm.js onBell API](https://xtermjs.org/docs/api/terminal/classes/terminal/) — Reference for how a mature terminal emulator exposes bell as an event (`terminal.onBell(callback)`), with `bellStyle` and `bellSound` options.
- [xterm.js Issue #3014](https://github.com/xtermjs/xterm.js/issues/3014) — Discussion on bell event emission pattern.
- [xterm.js Issue #1161](https://github.com/xtermjs/xterm.js/issues/1161) — Visual bell API design considerations.
