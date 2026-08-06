import type { ReactNode } from "react";
import { errorMessage } from "../api/client";
import { Button, Icon } from "./ui";
import { useI18n } from "../i18n";
import styles from "../styles/ui.module.css";

export function PageLoading() {
  const { messages } = useI18n();
  return (
    <div className={styles.loadingStack} role="status" aria-label={messages.states.loading}>
      <span />
      <span />
      <span />
      <span className={styles.srOnly}>{messages.states.loading}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { messages } = useI18n();
  const requestId =
    typeof error === "object" && error && "requestId" in error ? String(error.requestId) : "";
  return (
    <section className={styles.stateCard} role="alert">
      <h2>{messages.states.loadFailed}</h2>
      <p>{errorMessage(error)}</p>
      {requestId ? <small>{messages.states.requestId(requestId)}</small> : null}
      {onRetry ? (
        <Button variant="outlined" type="button" onClick={onRetry}>
          <Icon name="sync" size={18} />
          {messages.states.retry}
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
