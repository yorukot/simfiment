import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../api/client";
import type { Category, EntryLocation, Kind, Settings, Transaction } from "../../api/types";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  AdaptiveModal,
  Button,
  CategoryIcon,
  ChoiceChipGroup,
  Disclosure,
  NumericField,
  SegmentedControl,
  SwitchField,
  TextField,
} from "../../components/ui";
import { dateTimeInputInTimezone, zonedLocalToISO } from "../../lib/date";
import { currencySymbol, majorToMinor, moneyInputBounds } from "../../lib/money";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";
import { BudgetBalance } from "../budgets/BudgetBalance";
import { SettlementFields } from "../settlements/SettlementFields";
import { useEntryLocation } from "./useEntryLocation";

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  inline?: boolean;
  selectedKind?: Kind;
};

function newRequestID() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TransactionEntry({ open, settings, onClose, inline = false, selectedKind }: Props) {
  const amountRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const submittedAtRef = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { locale, messages } = useI18n();
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number>();
  const [settlementEnabled, setSettlementEnabled] = useState(false);
  const [counterparty, setCounterparty] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [title, setTitle] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    dateTimeInputInTimezone(new Date(), settings.timezone),
  );
  const [dateEdited, setDateEdited] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(settings.automaticLocationEnabled);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [requestId, setRequestId] = useState(newRequestID);
  // Capture only for an active, verified entry, and refresh for each new transaction.
  const locationCapture = useEntryLocation(open && locationEnabled, requestId);
  const categoriesQuery = useQuery({
    queryKey: ["categories", kind],
    queryFn: ({ signal }) =>
      api.get<Category[]>(`/api/v1/categories?kind=${kind}&includeArchived=false`, signal),
    enabled: open,
  });
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => amountRef.current?.focus(), 80);
    return () => window.clearTimeout(timeout);
  }, [open, requestId]);
  useEffect(() => {
    if (selectedKind) {
      setKind(selectedKind);
      setCategoryId(undefined);
    }
  }, [selectedKind]);

  const createCategory = useMutation({
    mutationFn: () =>
      api.post<{ kind: Kind; name: string; iconKey: string }, Category>("/api/v1/categories", {
        kind,
        name: categoryName,
        iconKey: "",
      }),
    onSuccess: async (category) => {
      await queryClient.invalidateQueries({ queryKey: ["categories", kind] });
      setCategoryId(category.id);
      setCategoryName("");
      setAddingCategory(false);
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const immediateLocation: EntryLocation | undefined = locationCapture.location;
      submittedAtRef.current ??= zonedLocalToISO(
        dateEdited ? occurredAt : dateTimeInputInTimezone(new Date(), settings.timezone),
        settings.timezone,
      );
      return api.post<Record<string, unknown>, Transaction>("/api/v1/transactions", {
        clientRequestId: requestId,
        kind,
        amountMinor: majorToMinor(amount, settings.currencyExponent) ?? 0,
        categoryId,
        title,
        occurredAt: submittedAtRef.current,
        ...(settlementEnabled ? { settlement: { counterparty, dueOn } } : {}),
        locationIntent: !locationEnabled
          ? settings.automaticLocationEnabled
            ? "skip"
            : "none"
          : "capture",
        ...(immediateLocation ? { location: immediateLocation } : {}),
      });
    },
    onSuccess: async (transaction) => {
      await invalidateTransactionQueries(queryClient);
      if (transaction.locationStatus === "pending") {
        void locationCapture.capturePromise.current.then(async (result) => {
          try {
            if (result.ok)
              await api.put(`/api/v1/transactions/${transaction.id}/location`, result.location);
            else
              await api.post(`/api/v1/transactions/${transaction.id}/location-failure`, {
                reason: result.reason,
              });
            await invalidateTransactionQueries(queryClient);
          } catch {
            /* Location never changes the successful save outcome. */
          }
        });
      }
      closeDialog(true);
      resetAfterSuccess();
      showToast({
        message: messages.transactionEntry.recorded,
        actionLabel: messages.common.restore,
        onAction: async () => {
          await api.delete(`/api/v1/transactions/${transaction.id}`);
          await invalidateTransactionQueries(queryClient);
        },
      });
    },
    onError: (error) => {
      submittingRef.current = false;
      // A validation rejection has not created a transaction; allow correcting its date.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 409
      )
        submittedAtRef.current = undefined;
    },
  });
  function closeDialog(force = false) {
    if (create.isPending && !force) return;
    if (!inline) onClose();
  }
  function resetAfterSuccess() {
    submittedAtRef.current = undefined;
    submittingRef.current = false;
    setKind(selectedKind ?? "expense");
    setAmount("");
    setCategoryId(undefined);
    setTitle("");
    setSettlementEnabled(false);
    setCounterparty("");
    setDueOn("");
    setDateEdited(false);
    setOccurredAt(dateTimeInputInTimezone(new Date(), settings.timezone));
    setLocationEnabled(settings.automaticLocationEnabled);
    setAddingCategory(false);
    setCategoryName("");
    setDetailsOpen(false);
    setRequestId(newRequestID());
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!open || submittingRef.current) return;
    if (!create.isPending && majorToMinor(amount, settings.currencyExponent) && categoryId) {
      submittingRef.current = true;
      create.mutate();
    }
  }
  const fields = create.error instanceof ApiError ? create.error.fields : {};
  const amountMinor = majorToMinor(amount, settings.currencyExponent);
  const amountBounds = moneyInputBounds(settings.currencyExponent);
  const localAmountError =
    amount && amountMinor === undefined
      ? messages.common.invalidAmountForCurrency(settings.currencyCode, settings.currencyExponent)
      : undefined;
  const statusText = !locationEnabled
    ? messages.transactionEntry.locationOff
    : locationCapture.status === "finding"
      ? messages.transactionEntry.locationFinding
      : locationCapture.status === "ready"
        ? messages.transactionEntry.locationReady
        : locationCapture.status === "permission_denied"
          ? messages.transactionEntry.locationDenied
          : messages.transactionEntry.locationUnavailable;
  const statusClass =
    locationCapture.status === "ready"
      ? styles.statusReady
      : locationCapture.status === "finding"
        ? styles.statusFinding
        : "";
  const form = (
    <form className={styles.form} onSubmit={submit}>
      {inline && (
        <BudgetBalance
          settings={settings}
          categoryId={kind === "expense" ? categoryId : undefined}
          categoryName={categoriesQuery.data?.find((category) => category.id === categoryId)?.name}
          enabled={open}
        />
      )}
      {!selectedKind && (
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
      )}
      <NumericField
        key={requestId}
        label={messages.common.amount}
        prefix={currencySymbol(locale, settings.currencyCode)}
        value={amount}
        onValueChange={setAmount}
        min={amountBounds.min}
        max={amountBounds.max}
        step={amountBounds.step}
        fractionDigits={settings.currencyExponent}
        required
        error={fields.amountMinor || localAmountError}
        amount
        inputRef={amountRef}
      />
      <fieldset className={styles.choiceFieldset}>
        <legend className={styles.label}>{messages.common.category}</legend>
        <ChoiceChipGroup
          label={messages.common.category}
          value={categoryId ? String(categoryId) : undefined}
          onValueChange={(value) => setCategoryId(Number(value))}
          options={(categoriesQuery.data ?? []).map((category) => ({
            value: String(category.id),
            label: category.name,
            icon: <CategoryIcon iconKey={category.iconKey} width={20} height={20} />,
          }))}
        />
        <Button
          variant="outlined"
          size="small"
          type="button"
          onClick={() => setAddingCategory((value) => !value)}
        >
          {messages.transactionEntry.newCategory}
        </Button>
        {fields.categoryId ? <span className={styles.fieldError}>{fields.categoryId}</span> : null}
        {addingCategory ? (
          <div className={styles.inlineForm}>
            <TextField
              label={messages.transactionEntry.newCategoryName}
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              maxLength={30}
            />
            <Button
              variant="tonal"
              type="button"
              loading={createCategory.isPending}
              disabled={!categoryName.trim()}
              onClick={() => createCategory.mutate()}
            >
              {messages.transactionEntry.create}
            </Button>
          </div>
        ) : null}
        {createCategory.error ? (
          <span className={styles.fieldError}>{errorMessage(createCategory.error)}</span>
        ) : null}
      </fieldset>
      <TextField
        label={messages.common.optionalTitle}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={80}
        placeholder={messages.transactionEntry.titlePlaceholder}
        error={fields.title}
      />
      <SettlementFields
        enabled={settlementEnabled}
        onEnabled={setSettlementEnabled}
        counterparty={counterparty}
        onCounterparty={setCounterparty}
        dueOn={dueOn}
        onDueOn={setDueOn}
        kind={kind}
        errors={fields}
      />
      <Disclosure
        label={messages.transactionEntry.otherOptions}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      >
        <div className={styles.form}>
          <TextField
            label={messages.common.dateTime}
            type="datetime-local"
            value={occurredAt}
            max={dateTimeInputInTimezone(new Date(Date.now() + 5 * 60_000), settings.timezone)}
            onChange={(event) => {
              setDateEdited(true);
              setOccurredAt(event.target.value);
            }}
          />
          <SwitchField
            checked={locationEnabled}
            onCheckedChange={setLocationEnabled}
            label={messages.transactionEntry.attachLocation}
            description={messages.transactionEntry.attachLocationDescription}
          />
          <div className={styles.locationStatus} aria-live="polite">
            <span className={`${styles.statusDot} ${statusClass}`} />
            {messages.transactionEntry.locationStatus(statusText)}
          </div>
        </div>
      </Disclosure>
      {create.error ? <p className={styles.formError}>{errorMessage(create.error)}</p> : null}
      <div className={styles.stickyAction}>
        <Button
          fullWidth
          size="large"
          type="submit"
          loading={create.isPending}
          disabled={
            !open ||
            !categoryId ||
            amountMinor === undefined ||
            (settlementEnabled && !counterparty.trim())
          }
        >
          {kind === "expense"
            ? messages.transactionEntry.saveExpense
            : messages.transactionEntry.saveIncome}
        </Button>
      </div>
    </form>
  );
  if (inline) return form;
  return (
    <AdaptiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) closeDialog();
      }}
      title={messages.transactionEntry.title}
      description={messages.transactionEntry.description}
    >
      {form}
    </AdaptiveModal>
  );
}

export async function invalidateTransactionQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["budgets"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["transaction"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring-occurrences"] }),
  ]);
}
