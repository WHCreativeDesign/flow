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
  /* Which home page you were on. Held by the shell rather than by Home so it
     survives both an app opening over it and a drift out to idle: coming back
     puts you where you left, never on a page you did not choose. */
  homePage = $state(0);

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

  /* app → home: the one universal swipe gesture. Apps never own navigation.

     The close cue is played by AppView at the moment the collapse starts, not
     here — goHome runs when the animation has already finished unmounting, so
     firing it here put the sound up to a third of a second behind the motion
     that caused it. */
  goHome() {
    this.state = 'home';
    this.activeApp = null;
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

  /** sign-out / user switch: back to a clean shell, nothing of theirs left open */
  reset() {
    this.state = 'home';
    this.activeApp = null;
    this.homePage = 0;
    clearTimeout(this.#idleTimer);
  }

  setHomePage(page: number) {
    this.homePage = page;
    this.#armIdleTimer();
  }

  /** any interaction anywhere resets the idle countdown */
  touch() {
    if (this.state !== 'idle') this.#armIdleTimer();
  }
}

export const shell = new Shell();
