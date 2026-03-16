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
    this.container.innerHTML = '';
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
