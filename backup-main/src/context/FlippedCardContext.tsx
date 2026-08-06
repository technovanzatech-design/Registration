import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface FlippedCardContextValue {
  flippedId: string | null;
  toggle: (id: string) => void;
}

const FlippedCardContext = createContext<FlippedCardContextValue | null>(null);

export function FlippedCardProvider({ children }: { children: ReactNode }) {
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setFlippedId((current) => (current === id ? null : id));
  }, []);

  return (
    <FlippedCardContext.Provider value={{ flippedId, toggle }}>
      {children}
    </FlippedCardContext.Provider>
  );
}

export function useFlippedCard() {
  const ctx = useContext(FlippedCardContext);
  if (!ctx) {
    throw new Error("useFlippedCard must be used within a FlippedCardProvider");
  }
  return ctx;
}
