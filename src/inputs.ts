export class Debouncer {
  debounceTime: number;
  lastChange: number;
  getTime: () => number;

  constructor(getTime: () => number, delayMs: number) {
    this.getTime = getTime;
    this.debounceTime = delayMs;
    this.lastChange = -delayMs;
  }

  reset() {
    this.lastChange = -this.debounceTime;
  }

  set() {
    this.lastChange = this.getTime();
  }

  ready() {
    return this.getTime() - this.lastChange >= this.debounceTime;
  }

  try(f: () => void) {
    let now = this.getTime();
    if (now - this.lastChange >= this.debounceTime) {
      f();
      this.lastChange = now;
    }
  }
}

export class Keyboard {
  public readonly pressed: Set<string>;

  constructor() {
    this.pressed = new Set();
  }

  register() {
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      this.pressed.add(e.code);
    });
    document.addEventListener("keyup", (e: KeyboardEvent) => {
      this.pressed.delete(e.code);
    });
  }
}
