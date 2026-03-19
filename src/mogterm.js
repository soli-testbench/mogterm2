/**
 * Mogterm - A terminal emulator component with inline input and cursor.
 *
 * Usage:
 *   const term = new Mogterm(document.getElementById('terminal'));
 *   term.onCommand = (cmd) => { term.writeLine(`You typed: ${cmd}`); };
 */
class Mogterm {
  constructor(container, options = {}) {
    this.container = container;
    this.prompt = options.prompt || '$ ';
    this.onCommand = options.onCommand || null;

    // Scrollback configuration
    this.scrollbackLines = options.scrollbackLines ?? 1000;

    this.history = []; // completed output lines
    this.inputBuffer = '';
    this.cursorPos = 0;
    this.focused = false;
    this._isTyping = false;
    this._typingTimer = null;

    // Scrollback state
    this._scrollOffset = 0; // 0 = live (bottom), >0 = scrolled up by N lines
    this._hasNewContent = false;

    this._init();
  }

  _init() {
    this.container.classList.add('mogterm');
    this.container.setAttribute('tabindex', '0');

    this.container.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.container.addEventListener('focus', () => this._onFocus());
    this.container.addEventListener('blur', () => this._onBlur());
    this.container.addEventListener('click', () => this.container.focus());
    this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    this._render();
  }

  _onFocus() {
    this.focused = true;
    this._render();
  }

  _onBlur() {
    this.focused = false;
    this._render();
  }

  _onWheel(e) {
    const maxOffset = this._maxScrollOffset();
    if (maxOffset === 0) return;

    e.preventDefault();
    const linesDelta = e.deltaY > 0 ? -3 : 3; // scroll down = towards bottom, scroll up = towards top
    this._scrollOffset = Math.max(0, Math.min(maxOffset, this._scrollOffset + linesDelta));
    if (this._scrollOffset === 0) this._hasNewContent = false;
    this._render();
  }

  _maxScrollOffset() {
    // Total lines = history + 1 (prompt line). Visible = container fits.
    // For simplicity, max offset = max(0, history.length - visibleLines + 1)
    // Since we don't know container height in Node, use history length as max.
    return Math.max(0, this.history.length);
  }

  _onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Scrollback navigation keys
    if (e.key === 'PageUp') {
      e.preventDefault();
      const pageSize = 10;
      this._scrollOffset = Math.min(this._maxScrollOffset(), this._scrollOffset + pageSize);
      this._render();
      return;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      const pageSize = 10;
      this._scrollOffset = Math.max(0, this._scrollOffset - pageSize);
      if (this._scrollOffset === 0) this._hasNewContent = false;
      this._render();
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      this._scrollOffset = 0;
      this._hasNewContent = false;
      this._render();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      this._submit();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      if (this.cursorPos > 0) {
        this.inputBuffer =
          this.inputBuffer.slice(0, this.cursorPos - 1) +
          this.inputBuffer.slice(this.cursorPos);
        this.cursorPos--;
        this._render();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (this.cursorPos > 0) {
        this.cursorPos--;
        this._render();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (this.cursorPos < this.inputBuffer.length) {
        this.cursorPos++;
        this._render();
      }
    } else if (e.key.length === 1) {
      e.preventDefault();
      this.inputBuffer =
        this.inputBuffer.slice(0, this.cursorPos) +
        e.key +
        this.inputBuffer.slice(this.cursorPos);
      this.cursorPos++;
      this._render();
    } else {
      return;
    }

    this._isTyping = true;
    clearTimeout(this._typingTimer);
    this._typingTimer = setTimeout(() => {
      this._isTyping = false;
      this._render();
    }, 1000);
  }

  _submit() {
    const cmd = this.inputBuffer;
    this.history.push(this.prompt + cmd);

    // Trim scrollback buffer to configured limit
    while (this.history.length > this.scrollbackLines) {
      this.history.shift();
      // Adjust scroll offset since we removed from the top
      if (this._scrollOffset > 0) this._scrollOffset--;
    }

    this.inputBuffer = '';
    this.cursorPos = 0;

    if (this.onCommand) {
      this.onCommand(cmd);
    }

    // If user is scrolled up, mark new content available; don't snap to bottom
    if (this._scrollOffset > 0) {
      this._hasNewContent = true;
      this._render();
    } else {
      this._render();
      this._scrollToBottom();
    }
  }

  /**
   * Write a line of output to the terminal (above the active prompt).
   */
  writeLine(text) {
    this.history.push(text);

    // Trim scrollback buffer to configured limit
    while (this.history.length > this.scrollbackLines) {
      this.history.shift();
      if (this._scrollOffset > 0) this._scrollOffset--;
    }

    // If scrolled up, don't snap to bottom; show indicator
    if (this._scrollOffset > 0) {
      this._hasNewContent = true;
      this._render();
    } else {
      this._render();
      this._scrollToBottom();
    }
  }

  _render() {
    const frag = document.createDocumentFragment();

    // Render history lines
    for (const line of this.history) {
      const div = document.createElement('div');
      div.className = 'mogterm-line';
      div.textContent = line;
      frag.appendChild(div);
    }

    // Render active prompt line with inline cursor
    const promptLine = document.createElement('div');
    promptLine.className = 'mogterm-line';

    const promptSpan = document.createElement('span');
    promptSpan.className = 'mogterm-prompt';
    promptSpan.textContent = this.prompt;
    promptLine.appendChild(promptSpan);

    const beforeCursor = this.inputBuffer.slice(0, this.cursorPos);
    const cursorChar = this.inputBuffer[this.cursorPos] || ' ';
    const afterCursor = this.inputBuffer.slice(this.cursorPos + 1);

    if (beforeCursor) {
      promptLine.appendChild(document.createTextNode(beforeCursor));
    }

    const cursor = document.createElement('span');
    cursor.className = 'mogterm-cursor';
    if (this._isTyping) {
      cursor.classList.add('mogterm-cursor--typing');
    }
    const cursorText = document.createElement('span');
    cursorText.className = 'mogterm-cursor-char';
    cursorText.textContent = cursorChar;
    cursor.appendChild(cursorText);
    promptLine.appendChild(cursor);

    if (afterCursor) {
      promptLine.appendChild(document.createTextNode(afterCursor));
    }

    frag.appendChild(promptLine);

    // New content indicator when scrolled up
    if (this._scrollOffset > 0 && this._hasNewContent) {
      const indicator = document.createElement('div');
      indicator.className = 'mogterm-new-content';
      indicator.textContent = '\u2193 New output below';
      frag.appendChild(indicator);
    }

    this.container.innerHTML = '';
    this.container.appendChild(frag);
  }

  _scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Mogterm;
}
