/*
  A boolean that follows its source, but a short beat late in both directions.

  Every `paused` prop in the shell drives `animation-play-state` on a whole
  group of elements at once (Home's field of orbs, Glance's idle motion, the
  atmosphere's bokeh/aurora). Toggling that for several elements is real,
  synchronous work, and it used to happen in the exact same tick as whatever
  other heavy DOM change caused it — an app mounting a screen full of
  `.fl-glass` panels as it opens, its close animation tearing down that same
  layer, a page swipe committing its new page. Two expensive layer
  operations landing in one frame is what showed up as a visible flash, in
  both directions: pausing collided with a new app's mount, resuming
  collided with its teardown. Deferring the flip by a beat, either way,
  keeps the two off the same frame instead of trying to win the race
  between them.
*/
export function deferredPause(get: () => boolean, delayMs = 100) {
  let value = $state(get());

  $effect(() => {
    const v = get();
    const t = setTimeout(() => (value = v), delayMs);
    return () => clearTimeout(t);
  });

  return {
    get current() {
      return value;
    }
  };
}
