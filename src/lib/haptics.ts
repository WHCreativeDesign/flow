/*
  Haptic feedback, alongside sound.

  navigator.vibrate() is the only public web API for this, and it works —
  Android Chrome and WebView have supported it for years. Safari has never
  implemented it, on iOS or macOS: Apple's stated position is that unwanted
  vibration is worse than none. iOS 17.4 added something adjacent but not
  equivalent — certain native form controls (a checkbox or radio actually
  toggled) trigger the system's own Taptic Engine as a side effect of
  WebKit's own handling of that control, with no JS hook to fire it as a
  standalone effect. This module keeps one such checkbox offscreen and
  toggles it as a proxy: the closest thing to an on-demand haptic iOS Safari
  allows from a web page.

  That proxy is unverified from this repo's own tooling — there is no way to
  feel a Taptic Engine pulse from a headless browser or a CI runner. Android
  vibration is the one path here with a real guarantee behind it; treat the
  iOS path as best-effort and confirm it on an actual iPhone.
*/

type Weight = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const ANDROID_PATTERN: Record<Weight, number | number[]> = {
  light: 8,
  medium: 16,
  heavy: 26,
  success: [10, 40, 10],
  warning: 20,
  error: [14, 55, 14, 55, 14]
};

let iosProxy: HTMLInputElement | null = null;

function ensureIosProxy(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null;
  if (iosProxy && document.body.contains(iosProxy)) return iosProxy;
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.style.cssText = 'position:fixed;inset:auto 0 0 -9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(el);
  iosProxy = el;
  return el;
}

/*
  Call this synchronously from inside the same user-gesture handler that
  triggers the feedback — a pointerdown/click callback, never after an
  `await` or inside a `setTimeout`. Both navigator.vibrate and the iOS
  checkbox proxy need a live, trusted-event call stack; either loses that
  the moment a microtask or timer breaks the chain, and silently does
  nothing rather than throwing.
*/
export function haptic(weight: Weight = 'light') {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ANDROID_PATTERN[weight]);
      return;
    }
    ensureIosProxy()?.click();
  } catch {
    /* best-effort only — feedback failing silently beats a broken interaction */
  }
}
