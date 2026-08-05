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

const frequencyOptions = [
  { value: "weekly", label: "週" },
  { value: "monthly", label: "月" },
  { value: "yearly", label: "年" },
] satisfies Array<{ value: Frequency; label: string }>;

export function RecurringPage({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
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
        amountMinor: Number(form.amount),
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
      showToast({ message: wasEditing ? "週期規則已更新。" : "週期規則已建立。" });
    },
  });
  const confirm = useMutation({
    mutationFn: ({ id, override }: { id: number; override: Record<string, unknown> }) =>
      api.post(`/api/v1/recurring-occurrences/${id}/confirm`, override),
    onSuccess: async () => {
      await refresh();
      setEditingOccurrence(undefined);
      showToast({ message: "週期項目已確認並記入交易。" });
    },
  });
  const skip = useMutation({
    mutationFn: (id: number) => api.post(`/api/v1/recurring-occurrences/${id}/skip`, {}),
    onSuccess: async () => {
      await refresh();
      showToast({ message: "已略過這次週期項目。" });
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
      amount: String(rule.amountMinor),
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
      amount: String(item.amountMinor),
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

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>週期收支</p>
          <h1>待處理項目</h1>
          <p>只有確認後才會計入實際收支。</p>
        </div>
        <Button type="button" onClick={beginNewRule}>
          <Icon name="add" size={20} />
          新規則
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
        title={editing ? "編輯週期規則" : "建立週期規則"}
        description="規則到期後仍需手動確認，才會計入收支。"
      >
        <form
          className={styles.form}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            saveRule.mutate();
          }}
        >
          <SegmentedControl
            label="交易類型"
            value={form.kind}
            onValueChange={(kind) =>
              setForm((value) => ({ ...value, kind, categoryId: undefined }))
            }
            options={[
              { value: "expense", label: "支出" },
              { value: "income", label: "收入" },
            ]}
          />
          <NumericField
            label="金額"
            value={form.amount}
            onValueChange={(amount) => setForm((value) => ({ ...value, amount }))}
            prefix="$"
            min={1}
            required
            amount
          />
          <SelectField
            label="分類"
            value={form.categoryId ? String(form.categoryId) : ""}
            onValueChange={(value) =>
              setForm((current) => ({ ...current, categoryId: Number(value) || undefined }))
            }
            options={categoryOptions}
            required
            disabled={categories.isPending}
          />
          <TextField
            label="標題（選填）"
            maxLength={80}
            value={form.title}
            onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
          />
          <div className={styles.twoColumnFields}>
            <NumericField
              label="每隔"
              value={form.interval}
              onValueChange={(interval) => setForm((value) => ({ ...value, interval }))}
              min={1}
              max={100}
              required
            />
            <SelectField
              label="頻率"
              value={form.frequency}
              onValueChange={(frequency) =>
                setForm((value) => ({ ...value, frequency: frequency as Frequency }))
              }
              options={frequencyOptions}
              required
            />
          </div>
          <TextField
            label="開始日期"
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
              disabled={!form.categoryId || Number(form.amount) <= 0}
            >
              儲存規則
            </Button>
          </div>
        </form>
      </AdaptiveModal>

      <AdaptiveModal
        open={Boolean(editingOccurrence)}
        onOpenChange={(open) => {
          if (!open) setEditingOccurrence(undefined);
        }}
        title="調整這一次"
        description="只會變更並確認這次項目，不影響原規則。"
      >
        {editingOccurrence ? (
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              confirm.mutate({
                id: editingOccurrence.id,
                override: {
                  clientRequestId: crypto.randomUUID(),
                  amountMinor: Number(occurrenceForm.amount),
                  categoryId: occurrenceForm.categoryId,
                  title: occurrenceForm.title,
                  occurredAt: zonedLocalToISO(occurrenceForm.occurredAt, settings.timezone),
                },
              });
            }}
          >
            <NumericField
              label="金額"
              value={occurrenceForm.amount}
              onValueChange={(amount) => setOccurrenceForm((value) => ({ ...value, amount }))}
              prefix="$"
              min={1}
              required
              amount
            />
            <SelectField
              label="分類"
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
              label="標題（選填）"
              value={occurrenceForm.title}
              maxLength={80}
              onChange={(event) =>
                setOccurrenceForm((value) => ({ ...value, title: event.target.value }))
              }
            />
            <TextField
              label="發生時間"
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
                disabled={!occurrenceForm.categoryId || Number(occurrenceForm.amount) <= 0}
              >
                調整並確認
              </Button>
            </div>
          </form>
        ) : null}
      </AdaptiveModal>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>需要確認</h2>
          <Chip>{pending.data.length} 項</Chip>
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
                  kind={item.kind}
                />
                <div className={styles.actions}>
                  <Button
                    size="small"
                    type="button"
                    loading={confirm.isPending}
                    onClick={() => confirm.mutate({ id: item.id, override: {} })}
                  >
                    確認
                  </Button>
                  <ActionMenu
                    items={[
                      {
                        label: "調整這一次",
                        icon: "edit",
                        disabled: confirm.isPending,
                        onSelect: () => beginOccurrenceEdit(item),
                      },
                      {
                        label: "略過這一次",
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
          <EmptyState title="沒有待處理項目">到期的週期收入與支出會在這裡等待你確認。</EmptyState>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>規則</h2>
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
                    每 {rule.intervalCount}{" "}
                    {rule.frequency === "weekly"
                      ? "週"
                      : rule.frequency === "monthly"
                        ? "月"
                        : "年"}{" "}
                    · 下次 {rule.nextDueOn} · {rule.enabled ? "啟用" : "停用"}
                  </small>
                </div>
                <MoneyText
                  amount={rule.amountMinor}
                  currency={rule.currencyCode}
                  kind={rule.kind}
                />
                <ActionMenu
                  items={[
                    { label: "編輯規則", icon: "edit", onSelect: () => beginEdit(rule) },
                    {
                      label: rule.enabled ? "停用規則" : "啟用規則",
                      icon: rule.enabled ? "close" : "check",
                      onSelect: () =>
                        stateRule.mutate({
                          id: rule.id,
                          action: rule.enabled ? "disable" : "enable",
                        }),
                    },
                    {
                      label: "封存規則",
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
            title="還沒有週期規則"
            action={
              <Button variant="outlined" onClick={beginNewRule}>
                <Icon name="add" size={20} />
                建立第一個規則
              </Button>
            }
          >
            房租、薪資或訂閱可建立為需要確認的週期項目。
          </EmptyState>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>未來 30 天</h2>
        </div>
        {preview.data.length ? (
          <div className={styles.list}>
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
                  <span className={styles.rowMeta}>{item.scheduledOn} · 預計，尚未記帳</span>
                </span>
                <MoneyText
                  className={styles.rowAmount}
                  amount={item.amountMinor}
                  currency={item.currencyCode}
                  kind={item.kind}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="未來 30 天沒有預計項目">
            啟用中的規則會在這裡顯示預覽，但不會計入儀表板。
          </EmptyState>
        )}
      </section>
    </>
  );
}
