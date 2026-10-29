import { useCallback, useEffect, useRef } from 'react';
import { Dimensions, Keyboard, ScrollView, TextInput } from 'react-native';

export function useKeyboardScroll(enabled: boolean) {
  const scrollRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealFocusedInput = useCallback(() => {
    if (!enabled || !Keyboard.isVisible()) return;
    const field = TextInput.State.currentlyFocusedInput();
    const scroll = scrollRef.current;
    if (!field || !scroll) return;
    field.measureInWindow((_x, fieldY, _width, fieldHeight) => {
      if (scrollRef.current !== scroll) return;
      scroll.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
        if (scrollRef.current !== scroll) return;
        const bottom = Math.min(scrollY + scrollHeight, Keyboard.metrics()?.screenY ?? Dimensions.get('window').height) - 24;
        if (fieldY + fieldHeight > bottom || fieldY < scrollY + 16) {
          scroll.scrollResponderScrollNativeHandleToKeyboard(field, scrollY + 24, true);
        }
      });
    });
  }, [enabled]);

  const scheduleReveal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(revealFocusedInput, 80);
  }, [revealFocusedInput]);

  useEffect(() => {
    if (!enabled) return;
    const shown = Keyboard.addListener('keyboardDidShow', scheduleReveal);
    const changed = Keyboard.addListener('keyboardWillChangeFrame', scheduleReveal);
    return () => {
      shown.remove();
      changed.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, scheduleReveal]);

  return { scrollRef, scheduleReveal };
}
