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
    this.padding = 8;

    // Cell dimensions (measured from rendered font)
    this.charWidth = 0;
    this.charHeight = 0;

    // Resize callback — consumers set this to be notified of dimension changes.
    // Design: the renderer owns pixel→cell translation; the consumer (e.g. a PTY
    // host) wires this callback to propagate SIGWINCH / pty.resize(cols, rows).
    // This decouples the renderer from any specific backend transport.
    this.onResize = null;

    // Debounce state
    this._resizeTimer = null;
    this._resizeDebounceMs = 100;
    this._resizeObserver = null;

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
    this.container.innerHTML = '';
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
    const fragment = document.createDocumentFragment();

    for (let r = 0; r < state.rows; r++) {
      const rowEl = document.createElement('div');
      rowEl.style.height = (this.fontSize * this.lineHeight) + 'px';

      for (let c = 0; c < state.cols; c++) {
        const cell = state.cells[r][c];
        const span = document.createElement('span');
        span.textContent = cell.char;

        // Apply attributes
        const styles = this._cellStyle(cell.attr);

        // Cursor
        if (r === state.cursorRow && c === state.cursorCol && state.cursorVisible) {
          styles.backgroundColor = this.cursorColor;
          styles.color = this.bgColor;
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
