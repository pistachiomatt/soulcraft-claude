import { useCallback, useRef, useState } from "react";
import { useMouse } from "./useMouse.js";

interface UseTextScrollOptions {
  lineCount: number;
  viewportHeight: number;
}

export function useTextScroll({ lineCount, viewportHeight }: UseTextScrollOptions) {
  const [offset, setOffset] = useState(0);

  const maxOffset = Math.max(0, lineCount - viewportHeight);
  const maxRef = useRef(maxOffset);
  maxRef.current = maxOffset;

  const clampedOffset = Math.min(offset, maxOffset);
  if (clampedOffset !== offset) {
    setOffset(clampedOffset);
  }

  const scrollBy = useCallback((delta: number) => {
    setOffset((current) => Math.max(0, Math.min(maxRef.current, current + delta)));
  }, []);

  const scrollUp = useCallback(() => scrollBy(-1), [scrollBy]);
  const scrollDown = useCallback(() => scrollBy(1), [scrollBy]);
  const scrollPageUp = useCallback(
    () => scrollBy(-Math.floor(viewportHeight / 2)),
    [scrollBy, viewportHeight],
  );
  const scrollPageDown = useCallback(
    () => scrollBy(Math.floor(viewportHeight / 2)),
    [scrollBy, viewportHeight],
  );
  const reset = useCallback(() => setOffset(0), []);
  const setOffsetDirect = useCallback((value: number) => {
    setOffset(Math.max(0, Math.min(maxRef.current, value)));
  }, []);

  const { mouseEnabled, toggleMouse } = useMouse(
    useCallback(
      (direction: "up" | "down") => scrollBy(direction === "up" ? -2 : 2),
      [scrollBy],
    ),
  );

  return {
    offset: clampedOffset,
    setOffset: setOffsetDirect,
    maxOffset,
    scrollUp,
    scrollDown,
    scrollPageUp,
    scrollPageDown,
    reset,
    mouseEnabled,
    toggleMouse,
  };
}
