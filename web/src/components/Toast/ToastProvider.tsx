import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { Toast } from "@base-ui/react/toast";
import { Icon } from "../ui";
import { useI18n } from "../../i18n";
import styles from "./ToastProvider.module.css";

type ToastInput = {
  message: string;
  tone?: "neutral" | "success" | "error";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

type ToastData = Pick<ToastInput, "actionLabel" | "onAction">;
type ToastContextValue = { showToast: (toast: ToastInput) => void };
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={6500} limit={3}>
      <ToastBridge>{children}</ToastBridge>
      <Toast.Portal>
        <Toast.Viewport className={styles.viewport}>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastBridge({ children }: { children: ReactNode }) {
  const manager = Toast.useToastManager();
  const showToast = useCallback(
    (input: ToastInput) => {
      manager.add({
        description: input.message,
        type: input.tone ?? "neutral",
        data: { actionLabel: input.actionLabel, onAction: input.onAction } satisfies ToastData,
      });
    },
    [manager],
  );
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

function ToastList() {
  const { messages } = useI18n();
  const manager = Toast.useToastManager<ToastData>();
  return manager.toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={styles.toast}
      swipeDirection={["down", "right"]}
      aria-label={messages.toast.notification}
    >
      <Toast.Content className={styles.content}>
        <span className={styles.toneIcon} aria-hidden="true">
          <Icon
            name={toast.type === "error" ? "error" : toast.type === "success" ? "check" : "info"}
            size={20}
          />
        </span>
        <Toast.Description className={styles.description} />
        {toast.data?.actionLabel ? (
          <button
            className={styles.action}
            type="button"
            data-base-ui-swipe-ignore
            onClick={() => {
              void toast.data?.onAction?.();
              manager.close(toast.id);
            }}
          >
            {toast.data.actionLabel}
          </button>
        ) : null}
        <Toast.Close className={styles.close} aria-label={messages.toast.closeNotification}>
          <Icon name="close" size={20} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
