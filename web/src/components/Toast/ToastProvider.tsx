import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import styles from "../../styles/ui.module.css";

type ToastInput = {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type ToastContextValue = { showToast: (toast: ToastInput) => void };
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastInput & { id: number }) | null>(null);
  const showToast = useCallback((input: ToastInput) => {
    const next = { ...input, id: Date.now() };
    setToast(next);
    window.setTimeout(() => setToast((current) => (current?.id === next.id ? null : current)), 6500);
  }, []);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastRegion} aria-live="polite" aria-atomic="true">
        {toast ? (
          <div className={styles.toast} role="status">
            <span>{toast.message}</span>
            {toast.actionLabel ? (
              <button
                className={styles.toastAction}
                type="button"
                onClick={() => {
                  void toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            ) : null}
            <button className={styles.toastClose} type="button" aria-label="關閉通知" onClick={() => setToast(null)}>×</button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

