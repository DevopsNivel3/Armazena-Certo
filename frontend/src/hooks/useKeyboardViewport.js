import { useEffect, useRef, useState } from 'react';

// O viewport visual acompanha o teclado também no Safari/PWA, onde 100vh não encolhe.
export default function useKeyboardViewport(containerRef, enabled = true) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const baselineRef = useRef({ height: 0, width: 0 });

  useEffect(() => {
    if (!enabled) {
      setKeyboardOpen(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const viewport = window.visualViewport;
    let frame;
    let settleTimer;

    const focusedField = () => {
      const field = document.activeElement;
      return field instanceof HTMLElement && container.contains(field)
        && field.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]')
        ? field : null;
    };

    const update = () => {
      const height = viewport?.height || window.innerHeight;
      const top = viewport?.offsetTop || 0;
      const field = focusedField();
      const baseline = baselineRef.current;
      baseline.height = baseline.width === window.innerWidth ? Math.max(baseline.height, window.innerHeight) : window.innerHeight;
      baseline.width = window.innerWidth;
      const open = Boolean(field && (viewport?.scale || 1) <= 1.05
        && baseline.height - height > 120);
      setKeyboardOpen(open);
      container.style.setProperty('--keyboard-viewport-height', `${height}px`);
      container.style.setProperty('--keyboard-viewport-top', `${top}px`);
      container.style.setProperty('--keyboard-inset', `${open ? Math.max(0, window.innerHeight - height - top) : 0}px`);
      if (!field) return;

      const rect = field.getBoundingClientRect();
      let distance = rect.bottom > top + height - 24
        ? rect.bottom - (top + height - 24)
        : rect.top < top + 16 ? rect.top - (top + 16) : 0;
      if (!distance) return;
      // Rola primeiro o formulário/modal; só depois a página, se necessário.
      let parent = field.parentElement;
      while (parent && parent !== document.body && Math.abs(distance) > 1) {
        if (parent.scrollHeight > parent.clientHeight && /auto|scroll/.test(getComputedStyle(parent).overflowY)) {
          const previousTop = parent.scrollTop;
          parent.scrollTop += distance;
          distance -= parent.scrollTop - previousTop;
        }
        parent = parent.parentElement;
      }
      if (Math.abs(distance) > 1 && getComputedStyle(container).position !== 'fixed') {
        window.scrollBy({ top: distance, behavior: 'instant' });
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const onFocus = () => {
      schedule();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, 350);
    };
    container.addEventListener('focusin', onFocus);
    container.addEventListener('focusout', onFocus);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      container.removeEventListener('focusin', onFocus);
      container.removeEventListener('focusout', onFocus);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ['--keyboard-viewport-height', '--keyboard-viewport-top', '--keyboard-inset'].forEach((property) => container.style.removeProperty(property));
    };
  }, [containerRef, enabled]);

  return keyboardOpen;
}
