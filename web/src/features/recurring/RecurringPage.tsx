import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../api/client";
import type {
  Category,
  Kind,
  RecurringOccurrence,
  RecurringPreview,
  RecurringRule,
  Settings,
} from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  ActionMenu,
  AdaptiveModal,
  Button,
  Card,
  CategoryIcon,
  Chip,
  Icon,
  NumericField,
  SegmentedControl,
  SelectField,
  TextField,
} from "../../components/ui";
import { addDays, todayInTimezone, zonedLocalToISO } from "../../lib/date";
import { currencySymbol, majorToMinor, minorToMajorInput, moneyInputBounds } from "../../lib/money";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

type Frequency = "weekly" | "monthly" | "yearly";
type RuleForm = {
  kind: Kind;
  amount: string;
  categoryId?: number;
  title: string;
  frequency: Frequency;
  interval: string;
  startOn: string;
};
type OccurrenceForm = { amount: string; categoryId?: number; title: string; occurredAt: string };

export function RecurringPage({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { locale, messages } = useI18n();
  const frequencyOptions = [
    { value: "weekly", label: messages.common.week },
    { value: "monthly", label: messages.common.month },
    { value: "yearly", label: messages.common.year },
  ] satisfies Array<{ value: Frequency; label: string }>;
  const today = todayInTimezone(settings.timezone);
  const emptyRule = (): RuleForm => ({
    kind: "expense",
    amount: "",
    title: "",
    frequency: "monthly",
    interval: "1",
    startOn: today,
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringRule>();
  const [editingOccurrence, setEditingOccurrence] = useState<RecurringOccurrence>();
  const [occurrenceForm, setOccurrenceForm] = useState<OccurrenceForm>({
    amount: "",
    title: "",
    occurredAt: "",
  });
  const [form, setForm] = useState<RuleForm>(emptyRule);
  const rules = useQuery({
    queryKey: ["recurring-rules"],
    queryFn: ({ signal }) =>
      api.get<RecurringRule[]>("/api/v1/recurring-rules?includeArchived=false", signal),
  });
  const pending = useQuery({
    queryKey: ["recurring-occurrences", "pending"],
    queryFn: ({ signal }) =>
      api.get<RecurringOccurrence[]>("/api/v1/recurring-occurrences?status=pending", signal),
  });
  const preview = useQuery({
    queryKey: ["recurring-preview", today, addDays(today, 31)],
    queryFn: ({ signal }) =>
      api.get<RecurringPreview[]>(
        `/api/v1/recurring-preview?from=${today}&to=${addDays(today, 31)}`,
        signal,
      ),
  });
  const categories = useQuery({
    queryKey: ["categories", form.kind],
    queryFn: ({ signal }) =>
      api.get<Category[]>(`/api/v1/categories?kind=${form.kind}&includeArchived=false`, signal),
    enabled: showForm,
  });
  const occurrenceCategories = useQuery({
    queryKey: ["categories", editingOccurrence?.kind],
    queryFn: ({ signal }) =>
      api.get<Category[]>(
        `/api/v1/categories?kind=${editingOccurrence?.kind}&includeArchived=false`,
        signal,
      ),
    enabled: Boolean(editingOccurrence),
  });
  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recurring-rules"] }),
      queryClient.invalidateQueries({ queryKey: ["recurring-occurrences"] }),
      queryClient.invalidateQueries({ queryKey: ["recurring-preview"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
  const saveRule = useMutation({
    mutationFn: () => {
      const body = {
        clientRequestId: crypto.randomUUID(),
        kind: form.kind,
        amountMinor: majorToMinor(form.amount, settings.currencyExponent) ?? 0,
        categoryId: form.categoryId,
        title: form.title,
        frequency: form.frequency,
        intervalCount: Number(form.interval),
        startOn: form.startOn,
      };
      return editing
        ? api.patch(`/api/v1/recurring-rules/${editing.id}`, body)
        : api.post("/api/v1/recurring-rules", body);
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editing);
      await refresh();
      setShowForm(false);
      setEditing(undefined);
      showToast({
        message: wasEditing ? messages.recurring.ruleUpdated : messages.recurring.ruleCreated,
      });
    },
  });
  const confirm = useMutation({
    mutationFn: ({ id, override }: { id: number; override: Record<string, unknown> }) =>
      api.post(`/api/v1/recurring-occurrences/${id}/confirm`, override),
    onSuccess: async () => {
      await refresh();
      setEditingOccurrence(undefined);
      showToast({ message: messages.recurring.occurrenceConfirmed });
    },
  });
  const skip = useMutation({
    mutationFn: (id: number) => api.post(`/api/v1/recurring-occurrences/${id}/skip`, {}),
    onSuccess: async () => {
      await refresh();
      showToast({ message: messages.recurring.occurrenceSkipped });
    },
  });
  const stateRule = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "enable" | "disable" | "archive" }) =>
      api.post(`/api/v1/recurring-rules/${id}/${action}`, {}),
    onSuccess: refresh,
  });

  function beginNewRule() {
    setEditing(undefined);
    setForm(emptyRule());
    setShowForm(true);
  }

  function beginEdit(rule: RecurringRule) {
    setEditing(rule);
    setForm({
      kind: rule.kind,
      amount: minorToMajorInput(rule.amountMinor, settings.currencyExponent),
      categoryId: rule.category.id,
      title: rule.title,
      frequency: rule.frequency,
      interval: String(rule.intervalCount),
      startOn: rule.startOn,
    });
    setShowForm(true);
  }

  function beginOccurrenceEdit(item: RecurringOccurrence) {
    setEditingOccurrence(item);
    setOccurrenceForm({
      amount: minorToMajorInput(item.amountMinor, settings.currencyExponent),
      categoryId: item.category.id,
      title: item.title,
      occurredAt: `${item.scheduledOn}T12:00`,
    });
  }

  if (rules.isPending || pending.isPending || preview.isPending) return <PageLoading />;
  if (rules.isError) return <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />;
  if (pending.isError)
    return <ErrorState error={pending.error} onRetry={() => void pending.refetch()} />;
  if (preview.isError)
    return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;

  const categoryOptions = (categories.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
  const occurrenceCategoryOptions = (occurrenceCategories.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.name,
  }));
  const amountBounds = moneyInputBounds(settings.currencyExponent);
  const ruleAmountMinor = majorToMinor(form.amount, settings.currencyExponent);
  const occurrenceAmountMinor = majorToMinor(occurrenceForm.amount, settings.currencyExponent);
  const amountError = (value: string, minor: number | undefined) =>
    value && minor === undefined
      ? messages.common.invalidAmountForCurrency(settings.currencyCode, settings.currencyExponent)
      : undefined;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{messages.recurring.eyebrow}</p>
          <h1>{messages.recurring.title}</h1>
          <p>{messages.recurring.intro}</p>
        </div>
        <Button type="button" onClick={beginNewRule}>
          <Icon name="add" size={20} />
          {messages.recurring.newRule}
        </Button>
      </header>
      {skip.error || stateRule.error ? (
        <p className={styles.formError}>{errorMessage(skip.error || stateRule.error)}</p>
      ) : null}

      <AdaptiveModal
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditing(undefined);
        }}
        title={editing ? messages.recurring.editRule : messages.recurring.createRule}
        description={messages.recurring.ruleDescription}
      >
        <form
          className={styles.form}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (ruleAmountMinor) saveRule.mutate();
          }}
        >
          <SegmentedControl
            label={messages.common.transactionType}
            value={form.kind}
            onValueChange={(kind) =>
              setForm((value) => ({ ...value, kind, categoryId: undefined }))
            }
            options={[
              { value: "expense", label: messages.common.expense },
              { value: "income", label: messages.common.income },
            ]}
          />
          <NumericField
            label={messages.common.amount}
            value={form.amount}
            onValueChange={(amount) => setForm((value) => ({ ...value, amount }))}
            prefix={currencySymbol(locale, settings.currencyCode)}
            min={amountBounds.min}
            max={amountBounds.max}
            step={amountBounds.step}
            fractionDigits={settings.currencyExponent}
            required
            error={amountError(form.amount, ruleAmountMinor)}
            amount
          />
          <SelectField
            label={messages.common.category}
            value={form.categoryId ? String(form.categoryId) : ""}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, categoryId: Number(value) || undefined }))
            }
            options={categoryOptions}
            required
            disabled={categories.isPending}
          />
          <TextField
            label={messages.common.optionalTitle}
            maxLength={80}
            value={form.title}
            onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
          />
          <div className={styles.twoColumnFields}>
            <NumericField
              label={messages.recurring.every}
              value={form.interval}
              onValueChange={(interval) => setForm((value) => ({ ...value, interval }))}
              min={1}
              max={100}
              required
            />
            <SelectField
              label={messages.recurring.frequency}
              value={form.frequency}
              onValueChange={(frequency) =>
                setForm((value) => ({ ...value, frequency: frequency as Frequency }))
              }
              options={frequencyOptions}
              required
            />
          </div>
          <TextField
            label={messages.recurring.startDate}
            type="date"
            value={form.startOn}
            onChange={(event) => setForm((value) => ({ ...value, startOn: event.target.value }))}
            required
          />
          {saveRule.error ? (
            <p className={styles.formError}>{errorMessage(saveRule.error)}</p>
          ) : null}
          <div className={styles.stickyAction}>
            <Button
              fullWidth
              type="submit"
              loading={saveRule.isPending}
              disabled={!form.categoryId || ruleAmountMinor === undefined}
            >
              {messages.recurring.saveRule}
            </Button>
          </div>
        </form>
      </AdaptiveModal>

      <AdaptiveModal
        open={Boolean(editingOccurrence)}
        onOpenChange={(open) => {
          if (!open) setEditingOccurrence(undefined);
        }}
        title={messages.recurring.adjustOccurrence}
        description={messages.recurring.adjustDescription}
      >
        {editingOccurrence ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (!occurrenceAmountMinor) return;
              confirm.mutate({
                id: editingOccurrence.id,
                override: {
                  clientRequestId: crypto.randomUUID(),
                  amountMinor: occurrenceAmountMinor,
                  categoryId: occurrenceForm.categoryId,
                  title: occurrenceForm.title,
                  occurredAt: zonedLocalToISO(occurrenceForm.occurredAt, settings.timezone),
                },
              });
            }}
          >
            <NumericField
              label={messages.common.amount}
              value={occurrenceForm.amount}
              onValueChange={(amount) => setOccurrenceForm((value) => ({ ...value, amount }))}
              prefix={currencySymbol(locale, settings.currencyCode)}
              min={amountBounds.min}
              max={amountBounds.max}
              step={amountBounds.step}
              fractionDigits={settings.currencyExponent}
              required
              error={amountError(occurrenceForm.amount, occurrenceAmountMinor)}
              amount
            />
            <SelectField
              label={messages.common.category}
              value={occurrenceForm.categoryId ? String(occurrenceForm.categoryId) : ""}
              onValueChange={(value) =>
                setOccurrenceForm((current) => ({
                  ...current,
                  categoryId: Number(value) || undefined,
                }))
              }
              options={occurrenceCategoryOptions}
              required
              disabled={occurrenceCategories.isPending}
            />
            <TextField
              label={messages.common.optionalTitle}
              value={occurrenceForm.title}
              maxLength={80}
              onChange={(event) =>
                setOccurrenceForm((value) => ({ ...value, title: event.target.value }))
              }
            />
            <TextField
              label={messages.recurring.occurredAt}
              type="datetime-local"
              value={occurrenceForm.occurredAt}
              onChange={(event) =>
                setOccurrenceForm((value) => ({ ...value, occurredAt: event.target.value }))
              }
              required
            />
            {confirm.error ? (
              <p className={styles.formError}>{errorMessage(confirm.error)}</p>
            ) : null}
            <div className={styles.stickyAction}>
              <Button
                fullWidth
                type="submit"
                loading={confirm.isPending}
                disabled={!occurrenceForm.categoryId || occurrenceAmountMinor === undefined}
              >
                {messages.recurring.adjustAndConfirm}
              </Button>
            </div>
          </form>
        ) : null}
      </AdaptiveModal>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.recurring.needsConfirmation}</h2>
          <Chip>{messages.recurring.itemCount(pending.data.length)}</Chip>
        </div>
        {pending.data.length ? (
          <Card padded={false}>
            {pending.data.map((item) => (
              <div key={item.id} className={styles.occurrenceRow}>
                <span className={styles.rowCategoryIcon}>
                  <CategoryIcon iconKey={item.category.iconKey} width={22} height={22} />
                </span>
                <div className={styles.rowGrow}>
                  <strong>{item.title || item.category.name}</strong>
                  <small>
                    {item.scheduledOn} · {item.category.name}
                  </small>
                </div>
                <MoneyText
                  amount={item.amountMinor}
                  currency={item.currencyCode}
                  exponent={settings.currencyExponent}
                  kind={item.kind}
                />
                <div className={styles.actions}>
                  <Button
                    size="small"
                    type="button"
                    loading={confirm.isPending}
                    onClick={() => confirm.mutate({ id: item.id, override: {} })}
                  >
                    {messages.recurring.confirm}
                  </Button>
                  <ActionMenu
                    items={[
                      {
                        label: messages.recurring.adjustOccurrence,
                        icon: "edit",
                        disabled: confirm.isPending,
                        onSelect: () => beginOccurrenceEdit(item),
                      },
                      {
                        label: messages.recurring.skipOccurrence,
                        icon: "close",
                        danger: true,
                        disabled: skip.isPending,
                        onSelect: () => skip.mutate(item.id),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState title={messages.recurring.emptyPendingTitle}>
            {messages.recurring.emptyPendingBody}
          </EmptyState>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.recurring.rules}</h2>
        </div>
        {rules.data.length ? (
          <Card padded={false}>
            {rules.data.map((rule) => (
              <div key={rule.id} className={styles.ruleRow}>
                <span className={styles.rowCategoryIcon}>
                  <CategoryIcon iconKey={rule.category.iconKey} width={22} height={22} />
                </span>
                <div className={styles.rowGrow}>
                  <strong>{rule.title || rule.category.name}</strong>
                  <small>
                    {messages.recurring.ruleSummary(
                      rule.intervalCount,
                      rule.frequency === "weekly"
                        ? messages.common.week
                        : rule.frequency === "monthly"
                          ? messages.common.month
                          : messages.common.year,
                      rule.nextDueOn,
                      rule.enabled,
                    )}
                  </small>
                </div>
                <MoneyText
                  amount={rule.amountMinor}
                  currency={rule.currencyCode}
                  exponent={settings.currencyExponent}
                  kind={rule.kind}
                />
                <ActionMenu
                  items={[
                    {
                      label: messages.recurring.editRuleAction,
                      icon: "edit",
                      onSelect: () => beginEdit(rule),
                    },
                    {
                      label: rule.enabled
                        ? messages.recurring.disableRule
                        : messages.recurring.enableRule,
                      icon: rule.enabled ? "close" : "check",
                      onSelect: () =>
                        stateRule.mutate({
                          id: rule.id,
                          action: rule.enabled ? "disable" : "enable",
                        }),
                    },
                    {
                      label: messages.recurring.archiveRule,
                      icon: "archive",
                      danger: true,
                      separatorBefore: true,
                      onSelect: () => stateRule.mutate({ id: rule.id, action: "archive" }),
                    },
                  ]}
                />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            title={messages.recurring.emptyRulesTitle}
            action={
              <Button variant="outlined" onClick={beginNewRule}>
                <Icon name="add" size={20} />
                {messages.recurring.createFirstRule}
              </Button>
            }
          >
            {messages.recurring.emptyRulesBody}
          </EmptyState>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.recurring.nextThirtyDays}</h2>
        </div>
        {preview.data.length ? (
          <Card className={styles.list} padded={false}>
            {preview.data.map((item, index) => (
              <div
                className={styles.transactionRow}
                key={`${item.ruleId}-${item.scheduledOn}-${index}`}
              >
                <span className={styles.rowCategoryIcon}>
                  <CategoryIcon iconKey={item.category.iconKey} width={22} height={22} />
                </span>
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{item.title || item.category.name}</span>
                  <span className={styles.rowMeta}>
                    {messages.recurring.previewMeta(item.scheduledOn)}
                  </span>
                </span>
                <MoneyText
                  className={styles.rowAmount}
                  amount={item.amountMinor}
                  currency={item.currencyCode}
                  exponent={settings.currencyExponent}
                  kind={item.kind}
                />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState title={messages.recurring.emptyPreviewTitle}>
            {messages.recurring.emptyPreviewBody}
          </EmptyState>
        )}
      </section>
    </>
  );
}
