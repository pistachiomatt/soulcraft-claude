import { useCallback, useEffect, useState } from "react";
import { useStdin } from "ink";

export function useMouse(onScroll: (direction: "up" | "down") => void) {
  const { stdin, setRawMode } = useStdin();
  const [enabled, setEnabled] = useState(true);

  const toggle = useCallback(() => setEnabled((current) => !current), []);

  useEffect(() => {
    if (!enabled) {
      process.stdout.write("\x1b[?1006l\x1b[?1000l");
      return;
    }

    process.stdout.write("\x1b[?1000h\x1b[?1006h");
    setRawMode(true);

    const handler = (data: Buffer) => {
      const match = data.toString().match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
      if (!match) return;
      const button = Number(match[1]);
      if (button === 64) onScroll("up");
      if (button === 65) onScroll("down");
    };

    stdin.on("data", handler);

    return () => {
      stdin.off("data", handler);
      process.stdout.write("\x1b[?1006l\x1b[?1000l");
    };
  }, [enabled, onScroll, setRawMode, stdin]);

  return { mouseEnabled: enabled, toggleMouse: toggle };
}
