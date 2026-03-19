/**
 * Terminal state machine.
 *
 * Maintains a cell grid, cursor position, text attributes, and terminal modes.
 * Wired to a Parser instance to interpret incoming byte streams.
 */

import { Parser } from './parser.js';

/** Default text attributes */
function defaultAttr() {
  return {
    bold: false,
    dim: false,
    italic: false,
    underline: false,
    blink: false,
    inverse: false,
    hidden: false,
    strikethrough: false,
    fg: null, // null = default
    bg: null,
  };
}

/** Deep-copy a color value (may be null, number, or {type, ...} object) */
function copyColor(c) {
  return c !== null && typeof c === 'object' ? { ...c } : c;
}

/** Deep-copy a cell's attr, including nested fg/bg color objects */
function deepCopyAttr(attr) {
  return { ...attr, fg: copyColor(attr.fg), bg: copyColor(attr.bg) };
}

/** Create an empty cell */
function emptyCell() {
  return { char: ' ', attr: defaultAttr() };
}

/** Hard upper bound for scrollback buffer lines */
const MAX_SCROLLBACK = 10000;

export class Terminal {
  /**
   * @param {number} cols — number of columns (default 80)
   * @param {number} rows — number of rows (default 24)
   * @param {object} [options] — optional configuration
   * @param {number} [options.scrollbackLines=1000] — max scrollback buffer lines (capped at 10000)
   */
  constructor(cols = 80, rows = 24, options = {}) {
    this.cols = cols;
    this.rows = rows;

    // Scrollback buffer (bounded to prevent unbounded memory growth)
    this._scrollbackLines = Math.min(Math.max(0, options.scrollbackLines ?? 1000), MAX_SCROLLBACK);
    this.scrollback = [];

    // Screen buffer: array of rows, each row is array of cells
    this.cells = [];
    this._initBuffer();

    // Cursor
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.cursorVisible = true;

    // Current text attributes (applied to newly printed chars)
    this.attr = defaultAttr();

    // Saved cursor state (for ESC 7 / ESC 8)
    this._savedCursor = null;

    // Terminal modes
    this.modes = {
      autoWrap: true,
      originMode: false,
      applicationCursor: false,
    };

    // Alternate screen buffer tracking
    this._altScreenActive = false;

    // Scroll region (1-indexed internally stored as 0-indexed)
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;

    // Title (set via OSC)
    this.title = '';

    // Dirty flag for renderers
    this._dirty = true;

    // Parser
    this.parser = new Parser();
    this._bindParser();
  }

  get scrollbackLines() {
    return this._scrollbackLines;
  }

  set scrollbackLines(value) {
    this._scrollbackLines = Math.min(Math.max(0, value), MAX_SCROLLBACK);
    // Trim scrollback if new cap is smaller
    while (this.scrollback.length > this._scrollbackLines) {
      this.scrollback.shift();
    }
  }

  /**
   * Returns a copy of the scrollback buffer lines.
   * @returns {Array} deep-copied scrollback rows
   */
  getScrollbackLines() {
    const deepCopyRow = row => row.map(c => ({ char: c.char, attr: deepCopyAttr(c.attr) }));
    return this.scrollback.map(deepCopyRow);
  }

  _initBuffer() {
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      this.cells.push(this._emptyRow());
    }
  }

  _emptyRow() {
    const row = [];
    for (let c = 0; c < this.cols; c++) {
      row.push(emptyCell());
    }
    return row;
  }

  _bindParser() {
    this.parser.onPrint = (ch) => this._print(ch);
    this.parser.onExecute = (code) => this._execute(code);
    this.parser.onCsiDispatch = (params, intermediates, final) =>
      this._csiDispatch(params, intermediates, final);
    this.parser.onEscDispatch = (intermediates, final) =>
      this._escDispatch(intermediates, final);
    this.parser.onOscDispatch = (payload) =>
      this._oscDispatch(payload);
  }

  /**
   * Feed raw data (string) into the terminal.
   * @param {string} data
   */
  write(data) {
    this.parser.feed(data);
    this._dirty = true;
  }

  /** Alias for write() */
  feed(data) {
    this.write(data);
  }

  // ─── Character printing ─────────────────────────────────────

  _print(ch) {
    if (this.cursorCol >= this.cols) {
      if (this.modes.autoWrap) {
        this.cursorCol = 0;
        this._index(); // newline
      } else {
        this.cursorCol = this.cols - 1;
      }
    }
    this.cells[this.cursorRow][this.cursorCol] = {
      char: ch,
      attr: deepCopyAttr(this.attr),
    };
    this.cursorCol++;
  }

  // ─── C0 control codes ──────────────────────────────────────

  _execute(code) {
    switch (code) {
      case 0x07: // BEL
        break;
      case 0x08: // BS — backspace
        if (this.cursorCol > 0) this.cursorCol--;
        break;
      case 0x09: // HT — horizontal tab
        this.cursorCol = Math.min(this.cols - 1, (Math.floor(this.cursorCol / 8) + 1) * 8);
        break;
      case 0x0a: // LF
      case 0x0b: // VT
      case 0x0c: // FF
        this._index();
        break;
      case 0x0d: // CR
        this.cursorCol = 0;
        break;
    }
  }

  /** Move cursor down one line, scroll if needed */
  _index() {
    if (this.cursorRow === this.scrollBottom) {
      this._scrollUp(1);
    } else if (this.cursorRow < this.rows - 1) {
      this.cursorRow++;
    }
  }

  /** Move cursor up one line, scroll if needed */
  _reverseIndex() {
    if (this.cursorRow === this.scrollTop) {
      this._scrollDown(1);
    } else if (this.cursorRow > 0) {
      this.cursorRow--;
    }
  }

  _scrollUp(n) {
    for (let i = 0; i < n; i++) {
      const evicted = this.cells.splice(this.scrollTop, 1)[0];
      // Capture evicted row into scrollback (primary buffer only, full scroll region only)
      if (!this._altScreenActive && this.scrollTop === 0 && this.scrollBottom === this.rows - 1) {
        this.scrollback.push(evicted.map(c => ({ char: c.char, attr: deepCopyAttr(c.attr) })));
        if (this.scrollback.length > this.scrollbackLines) {
          this.scrollback.shift();
        }
      }
      this.cells.splice(this.scrollBottom, 0, this._emptyRow());
    }
  }

  _scrollDown(n) {
    for (let i = 0; i < n; i++) {
      this.cells.splice(this.scrollBottom, 1);
      this.cells.splice(this.scrollTop, 0, this._emptyRow());
    }
  }

  // ─── CSI sequences ─────────────────────────────────────────

  _csiDispatch(params, intermediates, final) {
    const p0 = params[0] ?? 0;
    const p1 = params[1] ?? 0;

    // Private modes (CSI ? ... h/l)
    if (intermediates === '?') {
      if (final === 'h') {
        this._setPrivateMode(params, true);
        return;
      }
      if (final === 'l') {
        this._setPrivateMode(params, false);
        return;
      }
      return;
    }

    switch (final) {
      // ── Cursor movement ────────────────────────────
      case 'A': // CUU — cursor up
        this.cursorRow = Math.max(this.scrollTop, this.cursorRow - (p0 || 1));
        break;
      case 'B': // CUD — cursor down
        this.cursorRow = Math.min(this.scrollBottom, this.cursorRow + (p0 || 1));
        break;
      case 'C': // CUF — cursor forward
        this.cursorCol = Math.min(this.cols - 1, this.cursorCol + (p0 || 1));
        break;
      case 'D': // CUB — cursor back
        this.cursorCol = Math.max(0, this.cursorCol - (p0 || 1));
        break;
      case 'E': // CNL — cursor next line
        this.cursorCol = 0;
        this.cursorRow = Math.min(this.scrollBottom, this.cursorRow + (p0 || 1));
        break;
      case 'F': // CPL — cursor previous line
        this.cursorCol = 0;
        this.cursorRow = Math.max(this.scrollTop, this.cursorRow - (p0 || 1));
        break;
      case 'G': // CHA — cursor horizontal absolute
        this.cursorCol = Math.min(this.cols - 1, Math.max(0, (p0 || 1) - 1));
        break;
      case 'H': // CUP — cursor position
      case 'f': // HVP
        this.cursorRow = Math.min(this.rows - 1, Math.max(0, (p0 || 1) - 1));
        this.cursorCol = Math.min(this.cols - 1, Math.max(0, (p1 || 1) - 1));
        break;

      // ── Erase ──────────────────────────────────────
      case 'J': // ED — erase in display
        this._eraseInDisplay(p0);
        break;
      case 'K': // EL — erase in line
        this._eraseInLine(p0);
        break;

      // ── Insert / Delete ────────────────────────────
      case 'L': // IL — insert lines
        this._insertLines(p0 || 1);
        break;
      case 'M': // DL — delete lines
        this._deleteLines(p0 || 1);
        break;
      case 'P': // DCH — delete characters
        this._deleteChars(p0 || 1);
        break;
      case '@': // ICH — insert characters
        this._insertChars(p0 || 1);
        break;

      // ── Scroll ─────────────────────────────────────
      case 'S': // SU — scroll up
        this._scrollUp(p0 || 1);
        break;
      case 'T': // SD — scroll down
        this._scrollDown(p0 || 1);
        break;

      // ── SGR — Select Graphic Rendition ─────────────
      case 'm':
        this._sgr(params);
        break;

      // ── Scroll region ──────────────────────────────
      case 'r': // DECSTBM
        this.scrollTop = (p0 || 1) - 1;
        this.scrollBottom = (p1 || this.rows) - 1;
        this.cursorRow = 0;
        this.cursorCol = 0;
        break;

      // ── Device status ──────────────────────────────
      case 'n': // DSR
        // We don't have an output channel, silently ignore
        break;

      // ── Cursor visibility (non-private) ────────────
      case 'd': // VPA — vertical position absolute
        this.cursorRow = Math.min(this.rows - 1, Math.max(0, (p0 || 1) - 1));
        break;

      default:
        // Unknown CSI — silently ignore
        break;
    }
  }

  _setPrivateMode(params, enabled) {
    for (const p of params) {
      switch (p) {
        case 1: // DECCKM — application cursor keys
          this.modes.applicationCursor = enabled;
          break;
        case 7: // DECAWM — auto-wrap
          this.modes.autoWrap = enabled;
          break;
        case 25: // DECTCEM — cursor visibility
          this.cursorVisible = enabled;
          break;
        case 1049: // Alternate screen buffer (simplified)
          if (enabled) {
            this._altScreenActive = true;
            this._savedBuffer = this.cells.map(row => row.map(c => ({ char: c.char, attr: deepCopyAttr(c.attr) })));
            this._savedCursorAlt = { row: this.cursorRow, col: this.cursorCol };
            this._initBuffer();
            this.cursorRow = 0;
            this.cursorCol = 0;
          } else if (this._savedBuffer) {
            this._altScreenActive = false;
            this.cells = this._savedBuffer;
            this._savedBuffer = null;
            if (this._savedCursorAlt) {
              this.cursorRow = this._savedCursorAlt.row;
              this.cursorCol = this._savedCursorAlt.col;
              this._savedCursorAlt = null;
            }
          }
          break;
      }
    }
  }

  // ─── SGR (text attributes) ─────────────────────────────────

  _sgr(params) {
    if (params.length === 0) params = [0];

    for (let i = 0; i < params.length; i++) {
      const p = params[i] ?? 0;
      switch (p) {
        case 0: // Reset
          this.attr = defaultAttr();
          break;
        case 1:
          this.attr.bold = true;
          break;
        case 2:
          this.attr.dim = true;
          break;
        case 3:
          this.attr.italic = true;
          break;
        case 4:
          this.attr.underline = true;
          break;
        case 5:
          this.attr.blink = true;
          break;
        case 7:
          this.attr.inverse = true;
          break;
        case 8:
          this.attr.hidden = true;
          break;
        case 9:
          this.attr.strikethrough = true;
          break;
        case 22:
          this.attr.bold = false;
          this.attr.dim = false;
          break;
        case 23:
          this.attr.italic = false;
          break;
        case 24:
          this.attr.underline = false;
          break;
        case 25:
          this.attr.blink = false;
          break;
        case 27:
          this.attr.inverse = false;
          break;
        case 28:
          this.attr.hidden = false;
          break;
        case 29:
          this.attr.strikethrough = false;
          break;

        // Standard foreground colors (30-37)
        case 30: case 31: case 32: case 33:
        case 34: case 35: case 36: case 37:
          this.attr.fg = p - 30;
          break;
        case 38: {
          // Extended foreground: 38;5;n or 38;2;r;g;b
          const result = this._parseExtendedColor(params, i);
          if (result) {
            this.attr.fg = result.color;
            i = result.index;
          }
          break;
        }
        case 39:
          this.attr.fg = null;
          break;

        // Standard background colors (40-47)
        case 40: case 41: case 42: case 43:
        case 44: case 45: case 46: case 47:
          this.attr.bg = p - 40;
          break;
        case 48: {
          const result = this._parseExtendedColor(params, i);
          if (result) {
            this.attr.bg = result.color;
            i = result.index;
          }
          break;
        }
        case 49:
          this.attr.bg = null;
          break;

        // Bright foreground (90-97)
        case 90: case 91: case 92: case 93:
        case 94: case 95: case 96: case 97:
          this.attr.fg = p - 90 + 8;
          break;

        // Bright background (100-107)
        case 100: case 101: case 102: case 103:
        case 104: case 105: case 106: case 107:
          this.attr.bg = p - 100 + 8;
          break;
      }
    }
  }

  _parseExtendedColor(params, i) {
    if (params[i + 1] === 5 && params.length > i + 2) {
      // 256-color: 38;5;n
      return { color: { type: '256', value: params[i + 2] }, index: i + 2 };
    }
    if (params[i + 1] === 2 && params.length > i + 4) {
      // True color: 38;2;r;g;b
      return {
        color: { type: 'rgb', r: params[i + 2], g: params[i + 3], b: params[i + 4] },
        index: i + 4,
      };
    }
    return null;
  }

  // ─── Erase operations ──────────────────────────────────────

  _eraseInDisplay(mode) {
    switch (mode) {
      case 0: // Erase below (including cursor)
        this._eraseInLine(0);
        for (let r = this.cursorRow + 1; r < this.rows; r++) {
          this.cells[r] = this._emptyRow();
        }
        break;
      case 1: // Erase above (including cursor)
        this._eraseInLine(1);
        for (let r = 0; r < this.cursorRow; r++) {
          this.cells[r] = this._emptyRow();
        }
        break;
      case 2: // Erase entire display
        for (let r = 0; r < this.rows; r++) {
          this.cells[r] = this._emptyRow();
        }
        break;
      case 3: // Erase display + scrollback
        for (let r = 0; r < this.rows; r++) {
          this.cells[r] = this._emptyRow();
        }
        this.clearScrollback();
        break;
    }
  }

  _eraseInLine(mode) {
    const row = this.cells[this.cursorRow];
    switch (mode) {
      case 0: // Erase to right (including cursor)
        for (let c = this.cursorCol; c < this.cols; c++) {
          row[c] = emptyCell();
        }
        break;
      case 1: // Erase to left (including cursor)
        for (let c = 0; c <= this.cursorCol; c++) {
          row[c] = emptyCell();
        }
        break;
      case 2: // Erase entire line
        for (let c = 0; c < this.cols; c++) {
          row[c] = emptyCell();
        }
        break;
    }
  }

  // ─── Line/char insert/delete ───────────────────────────────

  _insertLines(n) {
    for (let i = 0; i < n; i++) {
      if (this.cursorRow <= this.scrollBottom) {
        this.cells.splice(this.scrollBottom, 1);
        this.cells.splice(this.cursorRow, 0, this._emptyRow());
      }
    }
    this.cursorCol = 0;
  }

  _deleteLines(n) {
    for (let i = 0; i < n; i++) {
      if (this.cursorRow <= this.scrollBottom) {
        this.cells.splice(this.cursorRow, 1);
        this.cells.splice(this.scrollBottom, 0, this._emptyRow());
      }
    }
    this.cursorCol = 0;
  }

  _insertChars(n) {
    const row = this.cells[this.cursorRow];
    for (let i = 0; i < n; i++) {
      row.pop();
      row.splice(this.cursorCol, 0, emptyCell());
    }
  }

  _deleteChars(n) {
    const row = this.cells[this.cursorRow];
    row.splice(this.cursorCol, n);
    while (row.length < this.cols) {
      row.push(emptyCell());
    }
  }

  // ─── ESC sequences ─────────────────────────────────────────

  _escDispatch(intermediates, final) {
    switch (final) {
      case '7': // DECSC — save cursor
        this._savedCursor = {
          row: this.cursorRow,
          col: this.cursorCol,
          attr: deepCopyAttr(this.attr),
        };
        break;
      case '8': // DECRC — restore cursor
        if (this._savedCursor) {
          this.cursorRow = this._savedCursor.row;
          this.cursorCol = this._savedCursor.col;
          this.attr = deepCopyAttr(this._savedCursor.attr);
        }
        break;
      case 'D': // IND — index (move down / scroll)
        this._index();
        break;
      case 'M': // RI — reverse index (move up / scroll)
        this._reverseIndex();
        break;
      case 'c': // RIS — full reset
        this.reset();
        break;
    }
  }

  // ─── OSC sequences ─────────────────────────────────────────

  _oscDispatch(payload) {
    const semi = payload.indexOf(';');
    if (semi === -1) return;
    const cmd = payload.substring(0, semi);
    const arg = payload.substring(semi + 1);
    switch (cmd) {
      case '0': // Set icon name + title
      case '2': // Set title
        this.title = arg;
        break;
    }
  }

  // ─── State access ──────────────────────────────────────────

  /**
   * Returns the full screen state as a serializable object.
   */
  getState() {
    // Deep-copy cells to prevent external mutation of internal state
    const deepCopyRow = row => row.map(c => ({ char: c.char, attr: deepCopyAttr(c.attr) }));
    const cellsCopy = this.cells.map(deepCopyRow);
    const scrollbackCopy = this.scrollback.map(deepCopyRow);
    return {
      cols: this.cols,
      rows: this.rows,
      cells: cellsCopy,
      cursorRow: this.cursorRow,
      cursorCol: this.cursorCol,
      cursorVisible: this.cursorVisible,
      title: this.title,
      scrollback: scrollbackCopy,
      scrollbackLength: this.scrollback.length,
    };
  }

  clearScrollback() {
    this.scrollback = [];
  }

  /**
   * Returns a plain-text representation of the screen (for testing).
   */
  toString() {
    return this.cells
      .map(row => row.map(c => c.char).join(''))
      .join('\n');
  }

  /**
   * Full reset of terminal state.
   */
  reset() {
    this._initBuffer();
    this.scrollback = [];
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.cursorVisible = true;
    this.attr = defaultAttr();
    this.scrollTop = 0;
    this.scrollBottom = this.rows - 1;
    this.title = '';
    this.modes = {
      autoWrap: true,
      originMode: false,
      applicationCursor: false,
    };
    this._altScreenActive = false;
    this._savedCursor = null;
    this._savedBuffer = null;
    this._savedCursorAlt = null;
    this.parser.reset();
    this._dirty = true;
  }

  /**
   * Resize the terminal.
   */
  resize(cols, rows) {
    const oldCols = this.cols;
    const oldRows = this.rows;
    this.cols = cols;
    this.rows = rows;
    this.scrollBottom = rows - 1;

    // Adjust rows
    while (this.cells.length < rows) {
      this.cells.push(this._emptyRow());
    }
    while (this.cells.length > rows) {
      this.cells.pop();
    }

    // Adjust cols per row
    for (let r = 0; r < rows; r++) {
      while (this.cells[r].length < cols) {
        this.cells[r].push(emptyCell());
      }
      while (this.cells[r].length > cols) {
        this.cells[r].pop();
      }
    }

    this.cursorRow = Math.min(this.cursorRow, rows - 1);
    this.cursorCol = Math.min(this.cursorCol, cols - 1);

    // Enforce scrollback cap after resize
    while (this.scrollback.length > this._scrollbackLines) {
      this.scrollback.shift();
    }

    this._dirty = true;
  }
}
