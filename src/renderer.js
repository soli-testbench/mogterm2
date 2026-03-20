/**
 * Browser DOM renderer for the Terminal engine.
 *
 * Renders the terminal cell grid into a container element using a
 * pre-formatted <div> per row approach for simplicity and correctness.
 * Supports scrollback buffer viewport navigation.
 */

// Standard 16 ANSI colors (0-15)
const ANSI_COLORS = [
  '#000000', '#aa0000', '#00aa00', '#aa5500',
  '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
  '#555555', '#ff5555', '#55ff55', '#ffff55',
  '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];

export class Renderer {
  /**
   * @param {HTMLElement} container — DOM element to render into
   * @param {import('./terminal.js').Terminal} terminal
   */
  constructor(container, terminal) {
    this.container = container;
    this.terminal = terminal;

    // Styling
    this.fontFamily = "'Courier New', Consolas, 'Liberation Mono', monospace";
    this.fontSize = 14;
    this.lineHeight = 1.2;
    this.bgColor = '#1e1e1e';
    this.fgColor = '#cccccc';
    this.cursorColor = '#ffffff';
    this.padding = 8;

    // Cell dimensions (measured from rendered font)
    this.charWidth = 0;
    this.charHeight = 0;

    // Resize callback — consumers MUST set this to propagate dimension changes
    // to the backend (e.g. PTY SIGWINCH).
    //
    // Contract:
    //   onResize: (cols: number, rows: number) => void
    //
    // Called after terminal.resize() succeeds, only when dimensions actually
    // change. If no callback is attached, resize is silently local-only —
    // the terminal still updates but the backend is NOT notified, which will
    // cause a desync. Consumers are responsible for wiring this to their
    // transport (WebSocket, IPC, etc.).
    this.onResize = null;

    // Debounce state
    this._resizeTimer = null;
    this._resizeDebounceMs = 100;
    this._resizeObserver = null;

    // Scroll state: number of rows scrolled UP from live position
    this._scrollOffset = 0;
    this._lastScrollbackLength = 0;
    this._hasNewContent = false;

    this._setup();
    this._measureCellSize();
    this._setupResizeObserver();
  }

  _setup() {
    this.container.style.backgroundColor = this.bgColor;
    this.container.style.color = this.fgColor;
    this.container.style.fontFamily = this.fontFamily;
    this.container.style.fontSize = this.fontSize + 'px';
    this.container.style.lineHeight = this.lineHeight;
    this.container.style.padding = this.padding + 'px';
    this.container.style.overflow = 'hidden';
    this.container.style.whiteSpace = 'pre';
    this.container.style.position = 'relative';
    this.container.setAttribute('tabindex', '0');
    this.container.style.outline = 'none';
    this.container.innerHTML = '';

    const style = document.createElement('style');
    style.textContent =
      '.mogterm-vt-cursor { animation: mogterm-vt-blink 1s ease-in-out infinite; }' +
      '@keyframes mogterm-vt-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }' +
      '@media (prefers-reduced-motion: reduce) { .mogterm-vt-cursor { animation: none; } }' +
      '.mogterm-new-content { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); ' +
        'background: #005f87; color: #fff; padding: 2px 12px; border-radius: 3px; font-size: 12px; ' +
        'cursor: pointer; z-index: 1; font-family: sans-serif; }';
    this.container.appendChild(style);

    this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.container.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onWheel(e) {
    const state = this.terminal.getState();
    const maxOffset = state.scrollbackLength;
    if (maxOffset === 0) return;

    e.preventDefault();
    const lineDelta = e.deltaY > 0 ? -3 : 3;
    this._scrollOffset = Math.max(0, Math.min(maxOffset, this._scrollOffset + lineDelta));

    if (this._scrollOffset === 0) {
      this._hasNewContent = false;
    }

    this.render();
  }

  _onKeyDown(e) {
    const state = this.terminal.getState();
    const maxOffset = state.scrollbackLength;

    if (e.key === 'PageUp') {
      e.preventDefault();
      this._scrollOffset = Math.min(maxOffset, this._scrollOffset + state.rows);
      this.render();
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      this._scrollOffset = Math.max(0, this._scrollOffset - state.rows);
      if (this._scrollOffset === 0) this._hasNewContent = false;
      this.render();
    } else if (e.key === 'End') {
      e.preventDefault();
      this._scrollOffset = 0;
      this._hasNewContent = false;
      this.render();
    }
  }

  get isLive() {
    return this._scrollOffset === 0;
  }

  scrollToBottom() {
    this._scrollOffset = 0;
    this._hasNewContent = false;
    this.render();
  }

  /**
   * Measure character cell dimensions from the rendered font.
   * Creates a hidden off-screen span with the terminal's font settings,
   * measures a single character, then removes the element.
   */
  _measureCellSize() {
    const probe = document.createElement('span');
    probe.style.fontFamily = this.fontFamily;
    probe.style.fontSize = this.fontSize + 'px';
    probe.style.lineHeight = String(this.lineHeight);
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.textContent = 'W';

    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    this.charWidth = rect.width;
    this.charHeight = this.fontSize * this.lineHeight;
    document.body.removeChild(probe);
  }

  /**
   * Attach a ResizeObserver to the container to detect size changes.
   * Debounces resize events and recalculates terminal dimensions.
   */
  _setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;

    this._resizeObserver = new ResizeObserver((entries) => {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._handleResize(entries);
      }, this._resizeDebounceMs);
    });

    this._resizeObserver.observe(this.container);
  }

  /**
   * Handle a container resize: compute new cols/rows from pixel dimensions,
   * update terminal state, notify backend, and re-render.
   */
  _handleResize(entries) {
    if (!this.charWidth || !this.charHeight) return;

    const entry = entries[0];
    const { width, height } = entry.contentRect;

    const cols = Math.max(1, Math.floor(width / this.charWidth));
    const rows = Math.max(1, Math.floor(height / this.charHeight));

    if (cols === this.terminal.cols && rows === this.terminal.rows) return;

    this.terminal.resize(cols, rows);
    this.render();

    if (typeof this.onResize === 'function') {
      this.onResize(cols, rows);
    }
  }

  /**
   * Disconnect the ResizeObserver and clean up timers.
   */
  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }
  }

  /**
   * Render the current terminal state into the container.
   */
  render() {
    const state = this.terminal.getState();
    const scrollback = state.scrollback;

    // Detect new content while scrolled up
    if (scrollback.length > this._lastScrollbackLength && this._scrollOffset > 0) {
      this._hasNewContent = true;
    }
    this._lastScrollbackLength = scrollback.length;

    const fragment = document.createDocumentFragment();

    // Build the virtual buffer: scrollback rows + live grid rows
    // Viewport shows `state.rows` rows ending at (total - _scrollOffset)
    const totalRows = scrollback.length + state.rows;
    const viewEnd = totalRows - this._scrollOffset;
    const viewStart = viewEnd - state.rows;

    for (let vi = 0; vi < state.rows; vi++) {
      const globalRow = viewStart + vi;
      const rowEl = document.createElement('div');
      rowEl.style.height = (this.fontSize * this.lineHeight) + 'px';

      let rowData;
      let isLiveRow = false;
      let liveRowIndex = -1;

      if (globalRow < scrollback.length) {
        rowData = scrollback[globalRow];
      } else {
        liveRowIndex = globalRow - scrollback.length;
        rowData = state.cells[liveRowIndex];
        isLiveRow = true;
      }

      if (!rowData) {
        fragment.appendChild(rowEl);
        continue;
      }

      for (let c = 0; c < state.cols; c++) {
        const cell = rowData[c];
        if (!cell) continue;
        const span = document.createElement('span');
        span.textContent = cell.char;

        const styles = this._cellStyle(cell.attr);

        // Cursor only shown on live rows when at live position
        if (isLiveRow && this._scrollOffset === 0 &&
            liveRowIndex === state.cursorRow && c === state.cursorCol && state.cursorVisible) {
          styles.backgroundColor = this.cursorColor;
          styles.color = this.bgColor;
          span.classList.add('mogterm-vt-cursor');
        }

        if (styles.color) span.style.color = styles.color;
        if (styles.backgroundColor) span.style.backgroundColor = styles.backgroundColor;
        if (styles.fontWeight) span.style.fontWeight = styles.fontWeight;
        if (styles.fontStyle) span.style.fontStyle = styles.fontStyle;
        if (styles.textDecoration) span.style.textDecoration = styles.textDecoration;
        if (styles.opacity) span.style.opacity = styles.opacity;

        rowEl.appendChild(span);
      }

      fragment.appendChild(rowEl);
    }

    this.container.innerHTML = '';
    this.container.appendChild(fragment);

    // Show "new content" indicator when scrolled up and new output arrived
    if (this._hasNewContent && this._scrollOffset > 0) {
      const indicator = document.createElement('div');
      indicator.className = 'mogterm-new-content';
      indicator.textContent = '\u2193 New output below';
      indicator.addEventListener('click', () => this.scrollToBottom());
      this.container.appendChild(indicator);
    }
  }

  _cellStyle(attr) {
    const s = {};

    // Foreground
    if (attr.fg !== null) {
      s.color = this._resolveColor(attr.fg);
    }
    // Background
    if (attr.bg !== null) {
      s.backgroundColor = this._resolveColor(attr.bg);
    }

    // Inverse
    if (attr.inverse) {
      const tmp = s.color || this.fgColor;
      s.color = s.backgroundColor || this.bgColor;
      s.backgroundColor = tmp;
    }

    if (attr.bold) s.fontWeight = 'bold';
    if (attr.dim) s.opacity = '0.5';
    if (attr.italic) s.fontStyle = 'italic';

    const decorations = [];
    if (attr.underline) decorations.push('underline');
    if (attr.strikethrough) decorations.push('line-through');
    if (decorations.length) s.textDecoration = decorations.join(' ');

    if (attr.hidden) {
      s.color = s.backgroundColor || this.bgColor;
    }

    return s;
  }

  _resolveColor(color) {
    if (typeof color === 'number') {
      // Standard / bright color (0-15)
      return ANSI_COLORS[color] || this.fgColor;
    }
    if (color && typeof color === 'object') {
      if (color.type === 'rgb') {
        return `rgb(${color.r},${color.g},${color.b})`;
      }
      if (color.type === '256') {
        return this._color256(color.value);
      }
    }
    return this.fgColor;
  }

  _color256(n) {
    if (n < 16) return ANSI_COLORS[n];
    if (n < 232) {
      // 6x6x6 color cube
      const idx = n - 16;
      const b = (idx % 6) * 51;
      const g = (Math.floor(idx / 6) % 6) * 51;
      const r = Math.floor(idx / 36) * 51;
      return `rgb(${r},${g},${b})`;
    }
    // Grayscale ramp (232-255)
    const v = (n - 232) * 10 + 8;
    return `rgb(${v},${v},${v})`;
  }
}
