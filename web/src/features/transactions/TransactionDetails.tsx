import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../../api/client";
import type { Category, Kind, Transaction } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  Button,
  Card,
  Icon,
  NumericField,
  SegmentedControl,
  SelectField,
  TextField,
} from "../../components/ui";
import { dateTimeInputInTimezone, zonedLocalToISO } from "../../lib/date";
import styles from "../../styles/ui.module.css";
import { OpenStreetMapLocation } from "./OpenStreetMapLocation";
import { invalidateTransactionQueries } from "./TransactionEntry";

export function TransactionDetails({ timezone }: { timezone: string }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const transaction = useQuery({
    queryKey: ["transaction", id],
    queryFn: ({ signal }) => api.get<Transaction>(`/api/v1/transactions/${id}`, signal),
    enabled: /^\d+$/.test(id),
  });
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number>();
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const categories = useQuery({
    queryKey: ["categories", kind],
    queryFn: ({ signal }) =>
      api.get<Category[]>(`/api/v1/categories?kind=${kind}&includeArchived=false`, signal),
    enabled: editing,
  });
  useEffect(() => {
    if (!transaction.data) return;
    setKind(transaction.data.kind);
    setAmount(String(transaction.data.amountMinor));
    setCategoryId(transaction.data.category.id);
    setTitle(transaction.data.title);
    setOccurredAt(dateTimeInputInTimezone(new Date(transaction.data.occurredAt), timezone));
  }, [timezone, transaction.data]);
  const edit = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/transactions/${id}`, {
        kind,
        amountMinor: Number(amount),
        categoryId,
        title,
        occurredAt: zonedLocalToISO(occurredAt, timezone),
      }),
    onSuccess: async (item: unknown) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      setEditing(false);
      showToast({ message: "交易已更新。" });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete<Transaction>(`/api/v1/transactions/${id}`),
    onSuccess: async (item) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      showToast({
        message: "交易已刪除。",
        actionLabel: "復原",
        onAction: async () => {
          const restored = await api.post(`/api/v1/transactions/${id}/restore`, {});
          queryClient.setQueryData(["transaction", id], restored);
          await invalidateTransactionQueries(queryClient);
        },
      });
    },
  });
  const restore = useMutation({
    mutationFn: () =>
      api.post<Record<string, never>, Transaction>(`/api/v1/transactions/${id}/restore`, {}),
    onSuccess: async (item) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      showToast({ message: "交易已還原。" });
    },
  });
  const removeLocation = useMutation({
    mutationFn: () => api.delete<Transaction>(`/api/v1/transactions/${id}/location`),
    onSuccess: async (item) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      showToast({ message: "輸入位置已移除。" });
    },
  });
  const retryLocation = useMutation({
    mutationFn: async () => {
      if (!("geolocation" in navigator)) {
        return {
          item: await api.post<Record<string, string>, Transaction>(
            `/api/v1/transactions/${id}/location-failure`,
            { reason: "unsupported" },
          ),
          attached: false,
        };
      }
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 3000,
            maximumAge: 60_000,
          }),
        );
        const item = await api.put<Record<string, unknown>, Transaction>(
          `/api/v1/transactions/${id}/location`,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
            capturedAt: new Date(position.timestamp).toISOString(),
          },
        );
        return { item, attached: true };
      } catch (error) {
        const code = typeof error === "object" && error && "code" in error ? Number(error.code) : 0;
        const reason =
          code === 1
            ? "permission_denied"
            : code === 2
              ? "position_unavailable"
              : code === 3
                ? "timeout"
                : "unknown";
        return {
          item: await api.post<Record<string, string>, Transaction>(
            `/api/v1/transactions/${id}/location-failure`,
            { reason },
          ),
          attached: false,
        };
      }
    },
    onSuccess: async ({ item: updated, attached }) => {
      queryClient.setQueryData(["transaction", id], updated);
      await invalidateTransactionQueries(queryClient);
      showToast({
        message: attached ? "已附上輸入位置。" : "目前無法取得位置，交易內容未受影響。",
      });
    },
  });
  if (!/^\d+$/.test(id)) return <ErrorState error={new Error("交易識別碼無效。")} />;
  if (transaction.isPending) return <PageLoading />;
  if (transaction.isError)
    return <ErrorState error={transaction.error} onRetry={() => void transaction.refetch()} />;
  const item = transaction.data;
  const occurred = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(item.occurredAt));
  const locationRetryEligible =
    item.source === "manual" &&
    item.locationStatus === "failed" &&
    !item.deletedAt &&
    !item.location &&
    Date.now() - new Date(item.createdAt).getTime() <= 5 * 60_000;
  const categoryOptions = (categories.data ?? []).map((category) => ({
    value: String(category.id),
    label: category.name,
  }));
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>交易明細</p>
          <h1>{item.title || item.category.name}</h1>
          <p>
            {item.category.name} · {occurred}
          </p>
        </div>
        <Button variant="outlined" type="button" onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={20} />
          返回
        </Button>
      </header>
      {item.deletedAt ? (
        <p className={styles.formError}>這筆交易已刪除，不會計入儀表板。你仍可在這裡還原。</p>
      ) : null}
      {editing ? (
        <Card>
          <form
            className={styles.form}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              edit.mutate();
            }}
          >
            <SegmentedControl
              label="交易類型"
              value={kind}
              onValueChange={(value) => {
                setKind(value);
                setCategoryId(undefined);
              }}
              options={[
                { value: "expense", label: "支出" },
                { value: "income", label: "收入" },
              ]}
            />
            <NumericField
              label="金額"
              value={amount}
              onValueChange={setAmount}
              prefix="$"
              min={1}
              required
              amount
            />
            <SelectField
              label="分類"
              value={categoryId ? String(categoryId) : ""}
              onValueChange={(value) => setCategoryId(Number(value) || undefined)}
              options={categoryOptions}
              required
              disabled={categories.isPending}
            />
            <TextField
              label="標題（選填）"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
            />
            <TextField
              label="日期與時間"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
            {edit.error ? <p className={styles.formError}>{errorMessage(edit.error)}</p> : null}
            <div className={styles.actions}>
              <Button type="submit" loading={edit.isPending} disabled={!categoryId}>
                儲存變更
              </Button>
              <Button variant="text" type="button" onClick={() => setEditing(false)}>
                取消
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card padded={false}>
          <dl className={styles.detailsGrid}>
            <dt>金額</dt>
            <dd>
              <MoneyText amount={item.amountMinor} currency={item.currencyCode} kind={item.kind} />
            </dd>
            <dt>分類</dt>
            <dd>
              {item.category.name}
              {item.category.archivedAt ? "（已封存）" : ""}
            </dd>
            <dt>標題</dt>
            <dd>{item.title || "—"}</dd>
            <dt>發生時間</dt>
            <dd>{occurred}</dd>
            <dt>來源</dt>
            <dd>{item.source === "manual" ? "手動記錄" : "週期確認"}</dd>
            <dt>輸入位置</dt>
            <dd>
              {item.location ? (
                <>
                  {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}
                  {item.location.accuracyM ? (
                    <small className={styles.locationAccuracy}>
                      約 ±{Math.round(item.location.accuracyM)} 公尺
                    </small>
                  ) : null}
                </>
              ) : item.locationStatus === "pending" ? (
                "擷取中"
              ) : item.locationStatus === "failed" ? (
                "擷取失敗"
              ) : (
                "未附上"
              )}
            </dd>
          </dl>
          {item.location ? <OpenStreetMapLocation location={item.location} /> : null}
        </Card>
      )}
      {!editing ? (
        <section className={styles.section}>
          <div className={styles.actions}>
            {!item.deletedAt ? (
              <>
                <Button variant="outlined" type="button" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={19} />
                  編輯交易
                </Button>
                {item.location ? (
                  <Button
                    variant="text"
                    type="button"
                    loading={removeLocation.isPending}
                    onClick={() => removeLocation.mutate()}
                  >
                    移除輸入位置
                  </Button>
                ) : null}
                {locationRetryEligible ? (
                  <Button
                    variant="text"
                    type="button"
                    loading={retryLocation.isPending}
                    onClick={() => retryLocation.mutate()}
                  >
                    重試輸入位置
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  type="button"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  <Icon name="delete" size={19} />
                  刪除交易
                </Button>
              </>
            ) : (
              <Button type="button" loading={restore.isPending} onClick={() => restore.mutate()}>
                <Icon name="restore" size={19} />
                還原交易
              </Button>
            )}
          </div>
          {remove.error || restore.error || removeLocation.error || retryLocation.error ? (
            <p className={styles.formError}>
              {errorMessage(
                remove.error || restore.error || removeLocation.error || retryLocation.error,
              )}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
