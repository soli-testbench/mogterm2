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

    this.history = []; // completed output lines
    this.inputBuffer = '';
    this.cursorPos = 0;
    this.focused = false;

    this._init();
  }

  _init() {
    this.container.classList.add('mogterm');
    this.container.setAttribute('tabindex', '0');

    this.container.addEventListener('keydown', (e) => this._onKeyDown(e));
    this.container.addEventListener('focus', () => this._onFocus());
    this.container.addEventListener('blur', () => this._onBlur());
    this.container.addEventListener('click', () => this.container.focus());

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

  _onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

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
    }
  }

  _submit() {
    const cmd = this.inputBuffer;
    this.history.push(this.prompt + cmd);
    this.inputBuffer = '';
    this.cursorPos = 0;

    if (this.onCommand) {
      this.onCommand(cmd);
    }

    this._render();
    this._scrollToBottom();
  }

  /**
   * Write a line of output to the terminal (above the active prompt).
   */
  writeLine(text) {
    this.history.push(text);
    this._render();
    this._scrollToBottom();
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
    const cursorText = document.createElement('span');
    cursorText.className = 'mogterm-cursor-char';
    cursorText.textContent = cursorChar;
    cursor.appendChild(cursorText);
    promptLine.appendChild(cursor);

    if (afterCursor) {
      promptLine.appendChild(document.createTextNode(afterCursor));
    }

    frag.appendChild(promptLine);

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
