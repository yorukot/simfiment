import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import { Button, Icon } from "./ui";
import styles from "../styles/ui.module.css";

export function PageLoading() {
  return (
    <div className={styles.loadingStack} role="status" aria-label="載入中">
      <span />
      <span />
      <span />
      <span className={styles.srOnly}>載入中</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const requestId =
    typeof error === "object" && error && "requestId" in error ? String(error.requestId) : "";
  return (
    <section className={styles.stateCard} role="alert">
      <h2>目前無法載入</h2>
      <p>{errorMessage(error)}</p>
      {requestId ? <small>請求編號：{requestId}</small> : null}
      {onRetry ? (
        <Button variant="outlined" type="button" onClick={onRetry}>
          <Icon name="sync" size={18} />
          再試一次
        </Button>
      ) : null}
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className={styles.emptyState}>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </section>
  );
}
