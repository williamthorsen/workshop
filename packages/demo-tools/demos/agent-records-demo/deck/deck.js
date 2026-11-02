/* global document, Element */
// Advances a deck page one beat at a time: a click or a key press on a `[data-beat]` element adds the class that the
// attribute names, which shows a transcript line or lights a pipeline stage.
document.addEventListener('click', (event) => advanceBeat(event.target));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    advanceBeat(event.target);
  }
});

/** Adds the beat class to the nearest beat element enclosing the event's target, if any. */
function advanceBeat(target) {
  const beat = target instanceof Element ? target.closest('[data-beat]') : null;
  if (beat !== null) {
    beat.classList.add(beat.dataset.beat);
  }
}
