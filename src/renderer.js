/**
 * Browser DOM renderer for the Terminal engine.
 *
 * Renders the terminal cell grid into a container element using a
 * pre-formatted <div> per row approach for simplicity and correctness.
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

    // Scrollback viewport state
    this._scrollOffset = 0; // 0 = live (pinned to bottom), >0 = scrolled up
    this._lastScrollbackLength = 0;
    this._hasNewContent = false;

    this._setup();
  }

  _setup() {
    this.container.style.backgroundColor = this.bgColor;
    this.container.style.color = this.fgColor;
    this.container.style.fontFamily = this.fontFamily;
    this.container.style.fontSize = this.fontSize + 'px';
    this.container.style.lineHeight = this.lineHeight;
    this.container.style.padding = '8px';
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
      '.mogterm-new-content { position: absolute; bottom: 0; left: 0; right: 0; ' +
      'background: rgba(50,130,240,0.85); color: #fff; text-align: center; ' +
      'padding: 2px 0; font-size: 12px; cursor: pointer; z-index: 1; }';
    this.container.appendChild(style);

    this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    this.container.addEventListener('keydown', (e) => this._onKeyDown(e));
  }

  _onWheel(e) {
    const state = this.terminal.getState();
    const maxOffset = state.scrollbackLength;
    if (maxOffset === 0) return;

    e.preventDefault();
    const linesDelta = Math.round(e.deltaY / (this.fontSize * this.lineHeight)) || (e.deltaY > 0 ? 1 : -1);
    // deltaY > 0 = scroll down (towards live) = decrease offset
    this._scrollOffset = Math.max(0, Math.min(maxOffset, this._scrollOffset - linesDelta));
    if (this._scrollOffset === 0) this._hasNewContent = false;
    this.render();
  }

  _onKeyDown(e) {
    const state = this.terminal.getState();
    if (e.key === 'PageUp') {
      e.preventDefault();
      this._scrollOffset = Math.min(state.scrollbackLength, this._scrollOffset + state.rows);
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

  /**
   * Render the current terminal state into the container.
   */
  render() {
    const state = this.terminal.getState();
    const scrollback = state.scrollback;
    const fragment = document.createDocumentFragment();

    // Detect new content while scrolled up
    if (this._scrollOffset > 0 && scrollback.length > this._lastScrollbackLength) {
      this._hasNewContent = true;
    }
    this._lastScrollbackLength = scrollback.length;

    // Clamp scroll offset
    if (this._scrollOffset > scrollback.length) {
      this._scrollOffset = scrollback.length;
    }

    // Build the virtual buffer: scrollback rows + live cells
    // Viewport shows `state.rows` rows from the combined buffer, offset from bottom
    const totalRows = scrollback.length + state.rows;
    const viewStart = totalRows - state.rows - this._scrollOffset;

    for (let r = 0; r < state.rows; r++) {
      const virtualRow = viewStart + r;
      const rowEl = document.createElement('div');
      rowEl.style.height = (this.fontSize * this.lineHeight) + 'px';

      let rowData;
      let isLiveRow = false;
      let liveRowIndex = -1;

      if (virtualRow < scrollback.length) {
        rowData = scrollback[virtualRow];
      } else {
        liveRowIndex = virtualRow - scrollback.length;
        rowData = state.cells[liveRowIndex];
        isLiveRow = true;
      }

      if (!rowData) continue;

      for (let c = 0; c < state.cols; c++) {
        const cell = rowData[c];
        if (!cell) continue;
        const span = document.createElement('span');
        span.textContent = cell.char;

        const styles = this._cellStyle(cell.attr);

        // Cursor (only on live rows and when at live position)
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

    // New content indicator
    if (this._scrollOffset > 0 && this._hasNewContent) {
      const indicator = document.createElement('div');
      indicator.className = 'mogterm-new-content';
      indicator.textContent = '\u2193 New output below';
      indicator.addEventListener('click', () => {
        this._scrollOffset = 0;
        this._hasNewContent = false;
        this.render();
      });
      fragment.appendChild(indicator);
    }

    this.container.innerHTML = '';
    this.container.appendChild(fragment);
  }

  /** Scroll offset accessor for external use */
  get scrollOffset() {
    return this._scrollOffset;
  }

  set scrollOffset(val) {
    this._scrollOffset = Math.max(0, val);
    if (this._scrollOffset === 0) this._hasNewContent = false;
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
