/*
  The three-state shell. Any surface running flow is in exactly one of these
  states at all times — no desktop, no windows, no z-index stacking.
*/
export type ShellState = 'idle' | 'home' | 'app';

export interface BloomOrigin {
  /** transform-origin as viewport percentages, set at press time */
  x: number;
  y: number;
}

const IDLE_TIMEOUT_MS = 90_000;

class Shell {
  state = $state<ShellState>('idle');
  activeApp = $state<string | null>(null);
  origin = $state<BloomOrigin>({ x: 50, y: 50 });

  #idleTimer: ReturnType<typeof setTimeout> | undefined;

  /** idle → home: any touch or motion input wakes it. No gesture to memorize. */
  wake() {
    if (this.state === 'idle') {
      this.state = 'home';
    }
    this.#armIdleTimer();
  }

  /** home → app: press orb, release, it blooms from its exact origin point. */
  open(appId: string, origin: BloomOrigin) {
    this.origin = origin;
    this.activeApp = appId;
    this.state = 'app';
    this.#armIdleTimer();
  }

  /** app → home: the one universal swipe gesture. Apps never own navigation. */
  goHome() {
    this.state = 'home';
    this.activeApp = null;
    this.#armIdleTimer();
  }

  /** home → idle: inactivity timeout. Never fires while inside an app. */
  #armIdleTimer() {
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => {
      if (this.state === 'home') {
        this.state = 'idle';
        this.activeApp = null;
      }
    }, IDLE_TIMEOUT_MS);
  }

  /** any interaction anywhere resets the idle countdown */
  touch() {
    if (this.state !== 'idle') this.#armIdleTimer();
  }
}

export const shell = new Shell();
