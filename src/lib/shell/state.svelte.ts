/*
  The three-state shell. Any surface running flow is in exactly one of these
  states at all times — no desktop, no windows, no z-index stacking.
*/
import { settings } from '../settings.svelte';
import { play } from '../sound/engine';

export type ShellState = 'idle' | 'home' | 'app';

export interface BloomOrigin {
  /** transform-origin as viewport percentages, set at press time */
  x: number;
  y: number;
}

class Shell {
  state = $state<ShellState>('idle');
  activeApp = $state<string | null>(null);
  origin = $state<BloomOrigin>({ x: 50, y: 50 });

  #idleTimer: ReturnType<typeof setTimeout> | undefined;

  /** idle → home: any touch or motion input wakes it. No gesture to memorize. */
  wake() {
    if (this.state === 'idle') {
      this.state = 'home';
      play('wake');
    }
    this.#armIdleTimer();
  }

  /** home → app: press orb, release, it blooms from its exact origin point. */
  open(appId: string, origin: BloomOrigin) {
    this.origin = origin;
    this.activeApp = appId;
    this.state = 'app';
    play('open');
    this.#armIdleTimer();
  }

  /** app → home: the one universal swipe gesture. Apps never own navigation. */
  goHome() {
    this.state = 'home';
    this.activeApp = null;
    play('home');
    this.#armIdleTimer();
  }

  /** home → idle: inactivity timeout, set in settings. Never fires inside an app. */
  #armIdleTimer() {
    clearTimeout(this.#idleTimer);
    const sec = settings.current.idleTimeoutSec;
    if (sec <= 0) return;
    this.#idleTimer = setTimeout(() => {
      if (this.state === 'home') {
        this.state = 'idle';
        this.activeApp = null;
      }
    }, sec * 1000);
  }

  /** any interaction anywhere resets the idle countdown */
  touch() {
    if (this.state !== 'idle') this.#armIdleTimer();
  }
}

export const shell = new Shell();
