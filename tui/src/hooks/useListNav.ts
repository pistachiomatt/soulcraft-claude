import { useCallback, useMemo, useState } from "react";
import { useMouse } from "./useMouse.js";

interface UseListNavOptions {
  itemCount: number;
  viewportHeight: number;
  initialIndex?: number;
}

export function useListNav({
  itemCount,
  viewportHeight,
  initialIndex = 0,
}: UseListNavOptions) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const handleUp = useCallback(() => {
    setSelectedIndex((index) => Math.max(0, index - 1));
  }, []);

  const handleDown = useCallback(() => {
    setSelectedIndex((index) => Math.min(itemCount - 1, index + 1));
  }, [itemCount]);

  const { windowStart, windowEnd } = useMemo(() => {
    const half = Math.floor(viewportHeight / 2);
    let start = Math.max(0, selectedIndex - half);
    let end = Math.min(itemCount, start + viewportHeight);
    if (end - start < viewportHeight) {
      start = Math.max(0, end - viewportHeight);
    }
    return { windowStart: start, windowEnd: end };
  }, [itemCount, selectedIndex, viewportHeight]);

  const { mouseEnabled, toggleMouse } = useMouse(
    useCallback(
      (direction: "up" | "down") => {
        if (direction === "up") handleUp();
        else handleDown();
      },
      [handleDown, handleUp],
    ),
  );

  return {
    selectedIndex,
    setSelectedIndex,
    windowStart,
    windowEnd,
    handleUp,
    handleDown,
    mouseEnabled,
    toggleMouse,
  };
}
