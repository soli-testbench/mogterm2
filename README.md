# MogTerm

A virtual terminal emulator engine for the browser. MogTerm interprets terminal output (ANSI/VT100 escape sequences, control codes), maintains terminal state (screen buffer, cursor, text attributes), and produces renderable output for a browser-based UI.

## Architecture

```
src/
  parser.js     – Escape sequence state machine (CSI, OSC, ESC, C0 controls)
  terminal.js   – Terminal state: cell grid, cursor, attributes, modes
  renderer.js   – DOM renderer that turns terminal state into HTML
  index.js      – Public API re-exports

demo/
  index.html    – Browser demo with interactive examples

test/
  terminal.test.js – Unit tests for parser and terminal
```

### Parser (`src/parser.js`)

A character-by-character state machine that recognizes:
- **C0 control codes** – BEL, BS, HT, LF, VT, FF, CR
- **CSI sequences** – `ESC [ <params> <final>` (cursor movement, erase, SGR, scroll, etc.)
- **OSC sequences** – `ESC ] <payload> BEL/ST` (window title, etc.)
- **ESC sequences** – `ESC <final>` (save/restore cursor, index, reset)

The parser emits callbacks: `onPrint`, `onExecute`, `onCsiDispatch`, `onOscDispatch`, `onEscDispatch`.

### Terminal (`src/terminal.js`)

Maintains the full terminal state:
- **Cell grid** – 80x24 (configurable) array of cells, each with a character and attributes
- **Cursor** – row, column, visibility
- **Text attributes** – bold, dim, italic, underline, blink, inverse, hidden, strikethrough, fg/bg color (standard, 256-color, truecolor)
- **Modes** – auto-wrap, application cursor keys, alternate screen buffer
- **Scroll region** – configurable top/bottom margins

Key API:
- `write(data)` / `feed(data)` – feed raw string data into the terminal
- `getState()` – returns the full screen state for rendering
- `toString()` – plain-text screen dump
- `reset()` – full terminal reset
- `resize(cols, rows)` – resize the terminal

### Renderer (`src/renderer.js`)

Renders terminal state into a DOM container. Converts cell attributes to inline CSS styles (colors, bold, italic, underline, etc.). Supports the full ANSI 16-color palette, 256-color mode, and truecolor (24-bit RGB).

## Running the Demo

Serve the project root with any HTTP server:

```bash
# Using Python
python3 -m http.server 8080

# Using Node
npx serve .
```

Then open `http://localhost:8080/demo/` in a browser.

The demo page provides:
- **Color Demo** – ANSI color palette display
- **ASCII Art** – MogTerm logo
- **Cursor Movement** – box drawn with cursor positioning
- **Text Attributes** – bold, italic, underline, strikethrough, colors
- **Progress Bar** – animated progress indicator
- **Raw Input** – type escape sequences manually (use `\e` for ESC)

## Running Tests

```bash
node test/terminal.test.js
```

## Supported Escape Sequences

| Category | Sequences |
|----------|-----------|
| Cursor | CUU (A), CUD (B), CUF (C), CUB (D), CNL (E), CPL (F), CHA (G), CUP (H/f), VPA (d) |
| Erase | ED (J), EL (K) |
| Insert/Delete | IL (L), DL (M), ICH (@), DCH (P) |
| Scroll | SU (S), SD (T), DECSTBM (r) |
| SGR | Reset (0), bold (1), dim (2), italic (3), underline (4), blink (5), inverse (7), hidden (8), strikethrough (9), fg/bg colors (30-37, 40-47, 90-97, 100-107), 256-color (38;5;n), truecolor (38;2;r;g;b) |
| Modes | DECCKM (?1), DECAWM (?7), DECTCEM (?25), Alt screen (?1049) |
| ESC | DECSC (7), DECRC (8), IND (D), RI (M), RIS (c) |
| OSC | Set title (0, 2) |
