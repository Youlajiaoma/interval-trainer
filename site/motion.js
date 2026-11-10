/* Presentation-only transitions. Navigation and audio cleanup remain immediate. */
(function (root) {
  'use strict';
  const running = new Map(), closing = new WeakMap(), opening = new WeakMap(), bound = new WeakSet();
  const preference = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const easing = 'cubic-bezier(.22,1,.36,1)';
  function enabled(element) { return Boolean(element?.animate) && !preference?.matches; }
  function cancel(element) {
    const animation = running.get(element);
    if (animation) { running.delete(element); animation.cancel(); }
  }
  function play(element, frames, duration = 200) {
    cancel(element);
    if (!enabled(element)) return null;
    try {
      const animation = element.animate(frames,{duration,easing});
      running.set(element,animation);
      const clear = () => { if (running.get(element) === animation) running.delete(element); };
      animation.finished.then(clear,clear);
      return animation;
    } catch { return null; }
  }
  function reveal(element, direction = 'up') {
    const horizontal = direction === 'forward' || direction === 'back';
    const offset = direction === 'back' ? -12 : horizontal ? 12 : 8;
    play(element,[{opacity:.3,transform:`translate${horizontal ? 'X' : 'Y'}(${offset}px)`},{opacity:1,transform:'none'}],180);
  }
  function navigate(update, direction = 'forward') {
    const shell = document.querySelector('.app-shell');
    cancel(shell);
    const result = update();
    const offset = direction === 'back' ? -24 : 24;
    const transform = root.CSS?.supports('overflow-x','clip') ? `translateX(${offset}px)` : 'none';
    play(shell,[{opacity:.25,transform},{opacity:1,transform:'none'}],220);
    return result;
  }
  function content(element, update, direction = 'up') {
    const result = update(); reveal(element,direction); return result;
  }
  function clearClose(dialog) {
    const state = closing.get(dialog);
    closing.delete(dialog);
    if (state) dialog.inert = state.inert;
    dialog.classList.remove('motion-dialog-closing');
    return state;
  }
  function bind(dialog) {
    if (bound.has(dialog)) return;
    bound.add(dialog);
    dialog.addEventListener('cancel',event => {
      if (!event.defaultPrevented) { event.preventDefault(); close(dialog); }
    });
    dialog.addEventListener('close',() => {
      if (dialog.open) return;
      clearClose(dialog); cancel(dialog); opening.delete(dialog); dialog.classList.remove('motion-dialog-opening');
    });
  }
  function position(dialog) {
    return dialog.classList.contains('stats-dialog') ? 'translateY(18px)' : 'translateX(40px)';
  }
  function frame(dialog) {
    const style = root.getComputedStyle(dialog);
    return {opacity:style.opacity,transform:style.transform};
  }
  function open(dialog) {
    bind(dialog);
    const wasClosing = closing.has(dialog);
    if (dialog.open && !wasClosing) return;
    const start = wasClosing && enabled(dialog) ? frame(dialog) : {opacity:0,transform:position(dialog)};
    const state = clearClose(dialog); cancel(dialog);
    if (!dialog.open) dialog.showModal();
    else if (state?.focus?.isConnected && dialog.contains(state.focus)) state.focus.focus({preventScroll:true});
    if (!enabled(dialog)) return;
    const token = {}; opening.set(dialog,token);
    dialog.classList.add('motion-dialog-opening');
    const animation = play(dialog,[start,{opacity:1,transform:'none'}],220);
    const clear = () => {
      if (opening.get(dialog) !== token) return;
      opening.delete(dialog); dialog.classList.remove('motion-dialog-opening');
    };
    if (animation) animation.finished.then(clear,clear); else clear();
  }
  function close(dialog, value) {
    if (!dialog.open) return Promise.resolve();
    if (closing.has(dialog)) return closing.get(dialog).done;
    if (!enabled(dialog)) { cancel(dialog); dialog.close(value); return Promise.resolve(); }
    const start = frame(dialog), state = {inert:dialog.inert,focus:document.activeElement};
    closing.set(dialog,state);
    dialog.inert = true;
    opening.delete(dialog); dialog.classList.remove('motion-dialog-opening'); dialog.classList.add('motion-dialog-closing');
    const animation = play(dialog,[start,{opacity:0,transform:position(dialog)}],170);
    const finish = () => {
      if (closing.get(dialog) !== state) return;
      clearClose(dialog);
      if (dialog.open) dialog.close(value);
    };
    state.done = animation ? animation.finished.then(finish,finish) : Promise.resolve(finish());
    return state.done;
  }
  preference?.addEventListener?.('change',() => {
    if (preference.matches) for (const animation of running.values()) animation.finish();
  });
  root.TonaloomMotion = Object.freeze({navigate,content,reveal,open,close});
})(window);
