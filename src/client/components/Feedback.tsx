import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type FeedbackApi = { toast: (message: string) => void };
const FeedbackContext = createContext<FeedbackApi>({ toast: () => {} });

/** 「保存しました」などの短いお知らせ */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <FeedbackContext.Provider value={{ toast }}>
      {children}
      {message && (
        <div className="toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => useContext(FeedbackContext);

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="notice error error-banner" role="alert">
      <span className="icon" aria-hidden>
        ✕
      </span>
      <span>{message}</span>
    </div>
  );
}

export function WarningNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice" role="note">
      <span className="icon" aria-hidden>
        !
      </span>
      <span>{children}</span>
    </div>
  );
}
