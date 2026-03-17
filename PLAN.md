# Cursor Blink Animation — Implementation Plan

## Summary

Add a standards-compliant blinking cursor animation across both rendering paths in MogTerm: the interactive `Mogterm` component (`mogterm.js` + `mogterm.css`) and the VT100 demo renderer (`renderer.js` + `demo/index.html`). The implementation uses pure CSS animations with minimal JS for the "stop while typing" behavior.

## Codebase Analysis

The project has **two independent cursor rendering systems**:

| System | Files | Current Cursor Behavior |
|--------|-------|------------------------|
| Interactive terminal | `src/mogterm.js`, `src/mogterm.css`, `index.html` | Block cursor with `step-end` blink via CSS `@keyframes mogterm-blink`. Hides cursor when unfocused. No typing-pause, no reduce-motion, hard step-end (not smooth). |
| VT100 demo renderer | `src/renderer.js`, `demo/index.html` | Solid block cursor via inline `backgroundColor` on the cursor cell. No blink at all. |

## Changes Required

### 1. `src/mogterm.css` — Update cursor animation (CSS only)

**Current state:** Has `@keyframes mogterm-blink` with `step-end` (hard on/off) at 1s cycle. Missing `prefers-reduced-motion` support.

**Changes:**
- Change `@keyframes mogterm-blink` from `step-end` to a smooth `ease-in-out` opacity fade for a polished look, keeping the 1s period (500ms on, 500ms off ≈ 1 Hz, well under the WCAG 3 Hz threshold).
- Add a `.mogterm-cursor--typing` modifier class that sets `animation: none; opacity: 1;` to keep the cursor solid while the user types.
- Add `@media (prefers-reduced-motion: reduce)` rule that disables the blink animation entirely, showing a solid cursor.
- Ensure cursor color uses the existing `#d4d4d4` (matches the design system text color, visible on both the dark `#1e1e1e` background and inverted contexts).

**Resulting CSS structure:**
```css
.mogterm-cursor {
  /* existing block cursor styles */
  animation: mogterm-blink 1s ease-in-out infinite;
}

.mogterm-cursor--typing {
  animation: none;
  opacity: 1;
}

.mogterm:not(:focus) .mogterm-cursor {
  animation: none;
  background: transparent;
}

@keyframes mogterm-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .mogterm-cursor {
    animation: none;
    opacity: 1;
  }
}
```

### 2. `src/mogterm.js` — Add typing-pause logic (JS)

**Changes:**
- In `_onKeyDown()`, after any printable/navigation key event, add the `mogterm-cursor--typing` class to the cursor element and set/reset a debounce timer.
- After ~1 second of inactivity, remove the `mogterm-cursor--typing` class so the blink animation resumes.
- Store the timer ID and cursor element reference on the instance.
- Since `_render()` rebuilds the DOM each time, the typing class must be re-applied during render if the typing timer is still active. Track a `this._isTyping` boolean flag that `_render()` checks when creating the cursor element.

**Implementation approach:**
```js
// In _onKeyDown, after any handled key:
this._isTyping = true;
clearTimeout(this._typingTimer);
this._typingTimer = setTimeout(() => {
  this._isTyping = false;
  this._render(); // re-render to remove typing class
}, 1000);

// In _render, when creating cursor span:
if (this._isTyping) {
  cursor.classList.add('mogterm-cursor--typing');
}
```

### 3. `src/renderer.js` — Add cursor blink to VT100 renderer

**Current state:** Cursor is rendered as a `<span>` with inline `backgroundColor`/`color` styles. No CSS class, no animation.

**Changes:**
- Add a CSS class `mogterm-vt-cursor` to the cursor span instead of (or in addition to) inline styles.
- Add a `<style>` element injected into the container (or rely on `mogterm.css` being loaded) with the blink keyframes.
- Simpler approach: add a `mogterm-vt-cursor` class and corresponding `@keyframes` in `mogterm.css`. The renderer already sets `backgroundColor` inline which will override a CSS class background, so use the class to apply only the animation.
- The cleanest approach: add the CSS class to the cursor span for the animation, keep inline styles for color. The animation targets `opacity` which doesn't conflict with inline color styles.
- Add `prefers-reduced-motion` handling in the same CSS.
- Since the VT100 renderer doesn't have keyboard input (it's output-only), the "stop while typing" criterion doesn't apply here.

**Specific changes to `renderer.js`:**
- In the `render()` method, add `span.classList.add('mogterm-vt-cursor')` to the cursor cell's span.
- In `_setup()`, inject a minimal `<style>` block with the animation keyframes and reduce-motion query (to avoid requiring `mogterm.css` to be loaded in the demo page).

### 4. `demo/index.html` — No changes needed

The demo uses `renderer.js` which will get the blink animation through the injected styles. The raw input field (`#raw-input`) is a native `<input>` element whose caret is controlled by the browser natively — no custom cursor needed there.

### 5. `index.html` — No changes needed

Already loads `mogterm.css` and uses the `Mogterm` class.

## Acceptance Criteria Mapping

| Criterion | How Addressed |
|-----------|--------------|
| Cursor blinks with smooth on/off or fade animation | `ease-in-out` opacity animation on `mogterm-cursor` and `mogterm-vt-cursor` |
| Blink rate ~1–1.2 Hz (500ms on/off) | `animation: mogterm-blink 1s ease-in-out infinite` (1 Hz = well under 3 Hz WCAG limit) |
| Cursor stops blinking while typing, resumes after ~1s | JS debounce timer adds/removes `mogterm-cursor--typing` class |
| Respects `prefers-reduced-motion` | `@media (prefers-reduced-motion: reduce)` disables animation |
| Consistent across all text inputs/editors | Both `mogterm.js` and `renderer.js` cursor paths covered |
| Cursor color matches design system | Uses existing `#d4d4d4` / `#ffffff` cursor colors from current code |

## Testing

- Existing tests (`test/mogterm.test.js`, `test/terminal.test.ts`) focus on terminal logic, not DOM rendering. They should pass without modification.
- Manual testing: open `index.html` and `demo/index.html`, verify cursor blinks, stops on typing, resumes after pause.
- Verify `prefers-reduced-motion` by toggling OS setting or using Chrome DevTools rendering panel.

## Research Sources

- [WCAG 2.3.1: Three Flashes or Below Threshold](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html) — 3 Hz flash threshold
- [WCAG 2.3.2: Three Flashes](https://www.w3.org/WAI/WCAG21/Understanding/three-flashes.html) — Level AAA no-flash requirement
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — CSS media query for reduced motion
- [IBM Accessibility: Blinking elements](https://www.ibm.com/able/guidelines/software/swblinking.html) — Recommends <2 Hz or >55 Hz blink rate

## Mode

**Single agent** — all changes are in 3 tightly-coupled files (`mogterm.css`, `mogterm.js`, `renderer.js`) with shared CSS patterns. No benefit from parallelism.
