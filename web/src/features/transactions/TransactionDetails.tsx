import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, errorMessage } from "../../api/client";
import type { Category, Kind, Settings, Transaction } from "../../api/types";
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
import { currencySymbol, majorToMinor, minorToMajorInput, moneyInputBounds } from "../../lib/money";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";
import { OpenStreetMapLocation } from "./OpenStreetMapLocation";
import { invalidateTransactionQueries } from "./TransactionEntry";

export function TransactionDetails({ settings }: { settings: Settings }) {
  const timezone = settings.timezone;
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { locale, messages } = useI18n();
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
    setAmount(minorToMajorInput(transaction.data.amountMinor, settings.currencyExponent));
    setCategoryId(transaction.data.category.id);
    setTitle(transaction.data.title);
    setOccurredAt(dateTimeInputInTimezone(new Date(transaction.data.occurredAt), timezone));
  }, [settings.currencyExponent, timezone, transaction.data]);
  const edit = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/transactions/${id}`, {
        kind,
        amountMinor: majorToMinor(amount, settings.currencyExponent) ?? 0,
        categoryId,
        title,
        occurredAt: zonedLocalToISO(occurredAt, timezone),
      }),
    onSuccess: async (item: unknown) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      setEditing(false);
      showToast({ message: messages.transactionDetails.updated });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete<Transaction>(`/api/v1/transactions/${id}`),
    onSuccess: async (item) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      showToast({
        message: messages.transactionDetails.deleted,
        actionLabel: messages.common.restore,
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
      showToast({ message: messages.transactionDetails.restored });
    },
  });
  const removeLocation = useMutation({
    mutationFn: () => api.delete<Transaction>(`/api/v1/transactions/${id}/location`),
    onSuccess: async (item) => {
      queryClient.setQueryData(["transaction", id], item);
      await invalidateTransactionQueries(queryClient);
      showToast({ message: messages.transactionDetails.locationRemoved });
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
        message: attached
          ? messages.transactionDetails.locationAttached
          : messages.transactionDetails.locationUnavailable,
      });
    },
  });
  if (!/^\d+$/.test(id))
    return <ErrorState error={new Error(messages.transactionDetails.invalidId)} />;
  if (transaction.isPending) return <PageLoading />;
  if (transaction.isError)
    return <ErrorState error={transaction.error} onRetry={() => void transaction.refetch()} />;
  const item = transaction.data;
  const amountMinor = majorToMinor(amount, settings.currencyExponent);
  const amountBounds = moneyInputBounds(settings.currencyExponent);
  const occurred = new Intl.DateTimeFormat(locale, {
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
          <p className={styles.eyebrow}>{messages.transactionDetails.eyebrow}</p>
          <h1>{item.title || item.category.name}</h1>
          <p>
            {item.category.name} · {occurred}
          </p>
        </div>
        <Button variant="outlined" type="button" onClick={() => navigate(-1)}>
          <Icon name="chevronLeft" size={20} />
          {messages.transactionDetails.back}
        </Button>
      </header>
      {item.deletedAt ? (
        <p className={styles.formError}>{messages.transactionDetails.deletedNotice}</p>
      ) : null}
      {editing ? (
        <Card>
          <form
            className={styles.form}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              if (amountMinor) edit.mutate();
            }}
          >
            <SegmentedControl
              label={messages.common.transactionType}
              value={kind}
              onValueChange={(value) => {
                setKind(value);
                setCategoryId(undefined);
              }}
              options={[
                { value: "expense", label: messages.common.expense },
                { value: "income", label: messages.common.income },
              ]}
            />
            <NumericField
              label={messages.common.amount}
              value={amount}
              onValueChange={setAmount}
              prefix={currencySymbol(locale, settings.currencyCode)}
              min={amountBounds.min}
              max={amountBounds.max}
              step={amountBounds.step}
              fractionDigits={settings.currencyExponent}
              required
              error={
                amount && amountMinor === undefined
                  ? messages.common.invalidAmountForCurrency(
                      settings.currencyCode,
                      settings.currencyExponent,
                    )
                  : undefined
              }
              amount
            />
            <SelectField
              label={messages.common.category}
              value={categoryId ? String(categoryId) : ""}
              onValueChange={(value) => setCategoryId(Number(value) || undefined)}
              options={categoryOptions}
              required
              disabled={categories.isPending}
            />
            <TextField
              label={messages.common.optionalTitle}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
            />
            <TextField
              label={messages.common.dateTime}
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
            {edit.error ? <p className={styles.formError}>{errorMessage(edit.error)}</p> : null}
            <div className={styles.actions}>
              <Button
                type="submit"
                loading={edit.isPending}
                disabled={!categoryId || amountMinor === undefined}
              >
                {messages.transactionDetails.saveChanges}
              </Button>
              <Button variant="text" type="button" onClick={() => setEditing(false)}>
                {messages.common.cancel}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card padded={false}>
          <dl className={styles.detailsGrid}>
            <dt>{messages.common.amount}</dt>
            <dd>
              <MoneyText
                amount={item.amountMinor}
                currency={item.currencyCode}
                exponent={settings.currencyExponent}
                kind={item.kind}
              />
            </dd>
            <dt>{messages.common.category}</dt>
            <dd>
              {item.category.name}
              {item.category.archivedAt ? ` (${messages.common.archived})` : ""}
            </dd>
            <dt>{messages.transactionDetails.title}</dt>
            <dd>{item.title || "—"}</dd>
            <dt>{messages.transactionDetails.occurredAt}</dt>
            <dd>{occurred}</dd>
            <dt>{messages.transactionDetails.source}</dt>
            <dd>
              {item.source === "manual"
                ? messages.transactionDetails.manualSource
                : messages.transactionDetails.recurringSource}
            </dd>
            <dt>{messages.transactionDetails.entryLocation}</dt>
            <dd>
              {item.location ? (
                <>
                  {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}
                  {item.location.accuracyM ? (
                    <small className={styles.locationAccuracy}>
                      {messages.transactionDetails.approximateMeters(
                        Math.round(item.location.accuracyM),
                      )}
                    </small>
                  ) : null}
                </>
              ) : item.locationStatus === "pending" ? (
                messages.transactionDetails.locationPending
              ) : item.locationStatus === "failed" ? (
                messages.transactionDetails.locationFailed
              ) : (
                messages.transactionDetails.locationNone
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
                  {messages.transactionDetails.edit}
                </Button>
                {item.location ? (
                  <Button
                    variant="text"
                    type="button"
                    loading={removeLocation.isPending}
                    onClick={() => removeLocation.mutate()}
                  >
                    {messages.transactionDetails.removeLocation}
                  </Button>
                ) : null}
                {locationRetryEligible ? (
                  <Button
                    variant="text"
                    type="button"
                    loading={retryLocation.isPending}
                    onClick={() => retryLocation.mutate()}
                  >
                    {messages.transactionDetails.retryLocation}
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  type="button"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  <Icon name="delete" size={19} />
                  {messages.transactionDetails.delete}
                </Button>
              </>
            ) : (
              <Button type="button" loading={restore.isPending} onClick={() => restore.mutate()}>
                <Icon name="restore" size={19} />
                {messages.transactionDetails.restoreTransaction}
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
