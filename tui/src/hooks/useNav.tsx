import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import type { View } from "../data/types.js";

interface NavContext {
  currentView: View;
  navigate: (view: View) => void;
  replace: (view: View) => void;
  goBack: () => void;
  savedIndex: number;
  saveIndex: (index: number) => void;
}

const Ctx = createContext<NavContext | null>(null);

export function useNav(): NavContext {
  const context = useContext(Ctx);
  if (!context) throw new Error("useNav must be inside NavProvider");
  return context;
}

interface NavProviderProps {
  initial: View[];
  children: React.ReactNode;
}

export function NavProvider({ initial, children }: NavProviderProps) {
  const [stack, setStack] = useState<View[]>(initial);
  const indexCache = useRef<Map<string, number>>(new Map());
  const currentView = stack[stack.length - 1]!;

  const viewKey = (view: View): string => {
    if (view.screen === "dashboard") return "dashboard";
    if (view.screen === "behavior") return `behavior:${view.behavior}:${view.runId ?? "latest"}`;
    return `scenario:${view.behavior}:${view.runId}:${view.variationNumber}:${view.repNumber}`;
  };

  const navigate = useCallback((view: View) => {
    setStack((current) => [...current, view]);
  }, []);

  const replace = useCallback((view: View) => {
    setStack((current) => [...current.slice(0, -1), view]);
  }, []);

  const goBack = useCallback(() => {
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  const savedIndex = indexCache.current.get(viewKey(currentView)) ?? 0;

  const saveIndex = useCallback((index: number) => {
    indexCache.current.set(viewKey(currentView), index);
  }, [currentView]);

  return (
    <Ctx.Provider value={{ currentView, navigate, replace, goBack, savedIndex, saveIndex }}>
      {children}
    </Ctx.Provider>
  );
}
