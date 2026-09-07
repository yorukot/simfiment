import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../api/client";
import type { Kind, Settings, Transaction } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { Button, Card, SegmentedControl } from "../../components/ui";
import { useI18n } from "../../i18n";
import { invalidateTransactionQueries } from "../transactions/TransactionEntry";
import styles from "../../styles/ui.module.css";

export function SettlementsPage({ settings }: { settings: Settings }) {
  const {
    messages: { settlement: m },
  } = useI18n();
  const [kind, setKind] = useState<Kind>("income");
  const [status, setStatus] = useState<"pending" | "completed">("pending");
  const client = useQueryClient();
  const list = useInfiniteQuery({
    queryKey: ["transactions", "settlements", kind, status],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.getPage<Transaction[]>(
        `/api/v1/transactions?kind=${kind}&settlementStatus=${status}&limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (page) => page.meta?.nextCursor,
    refetchOnWindowFocus: true,
  });
  const update = useMutation({
    mutationFn: (item: Transaction) =>
      api.post(
        `/api/v1/transactions/${item.id}/${item.settlement?.status === "pending" ? "complete" : "reopen"}`,
        {},
      ),
    onSuccess: () => invalidateTransactionQueries(client),
  });
  const items = list.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>SIMFIMENT</p>
          <h1>{m.title}</h1>
          <p>{m.description}</p>
        </div>
      </header>
      <div className={styles.form}>
        <SegmentedControl
          label={m.title}
          value={kind}
          onValueChange={setKind}
          options={[
            { value: "income", label: m.receivable },
            { value: "expense", label: m.payable },
          ]}
        />
        <SegmentedControl
          label={m.status}
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "pending", label: m.pending },
            { value: "completed", label: m.completed },
          ]}
        />
      </div>
      {list.isPending ? (
        <PageLoading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <section className={styles.section}>
          {items.length === 0 ? (
            <EmptyState title={m.empty}>{m.emptyBody}</EmptyState>
          ) : (
            <Card padded={false}>
              {items.map((item) => (
                <div key={item.id} className={styles.settlementRow}>
                  <Link to={`/transactions/${item.id}`} className={styles.rowMain}>
                    <strong>{item.settlement?.counterparty}</strong>
                    <span>{item.title || item.category.name}</span>
                    <small>
                      {item.occurredLocalDate}
                      {item.settlement?.dueOn ? ` · ${m.dueOn}: ${item.settlement.dueOn}` : ""}
                    </small>
                  </Link>
                  <MoneyText
                    amount={item.amountMinor}
                    currency={settings.currencyCode}
                    exponent={settings.currencyExponent}
                    kind={item.kind}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={update.isPending}
                    onClick={() => update.mutate(item)}
                  >
                    {status === "pending" ? m.complete : m.reopen}
                  </Button>
                </div>
              ))}
            </Card>
          )}
          {list.hasNextPage && (
            <Button
              variant="outlined"
              loading={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {m.loadMore}
            </Button>
          )}
        </section>
      )}
      {update.error && (
        <p className={styles.formError} role="alert">
          {errorMessage(update.error)}
        </p>
      )}
    </>
  );
}
