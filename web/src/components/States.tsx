import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import styles from "../styles/ui.module.css";

export function PageLoading() {
  return <div className={styles.loadingStack} aria-label="載入中"><span /><span /><span /></div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const requestId = typeof error === "object" && error && "requestId" in error ? String(error.requestId) : "";
  return (
    <section className={styles.stateCard} role="alert">
      <h2>目前無法載入</h2>
      <p>{errorMessage(error)}</p>
      {requestId ? <small>請求編號：{requestId}</small> : null}
      {onRetry ? <button className={styles.secondaryButton} type="button" onClick={onRetry}>再試一次</button> : null}
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className={styles.emptyState}><h3>{title}</h3><p>{children}</p>{action}</section>;
}

