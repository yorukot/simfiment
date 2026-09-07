import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../api/client";
import type { BudgetLimit, Category, MonthlyBudgets, Settings } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { ErrorState, PageLoading } from "../../components/States";
import { useToast } from "../../components/Toast/ToastProvider";
import {
  Button,
  Card,
  Disclosure,
  NumericField,
  SelectField,
  SwitchField,
  TextField,
} from "../../components/ui";
import { useI18n } from "../../i18n";
import { currencySymbol, majorToMinor, minorToMajorInput, moneyInputBounds } from "../../lib/money";
import { useLocalDate } from "../../lib/useLocalDate";
import { useBudgets } from "./BudgetBalance";
import styles from "../../styles/ui.module.css";

export function BudgetsPage({
  settings,
  embedded = false,
}: {
  settings: Settings;
  embedded?: boolean;
}) {
  const {
    messages: { budget: m },
  } = useI18n();
  const today = useLocalDate(settings.timezone);
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const month = selectedMonth ?? today.slice(0, 7);
  const budgets = useBudgets(month);
  const categories = useQuery({
    queryKey: ["categories", "expense", "all"],
    queryFn: ({ signal }) =>
      api.get<Category[]>("/api/v1/categories?kind=expense&includeArchived=true", signal),
  });
  const [editing, setEditing] = useState(embedded);
  return (
    <>
      {!embedded && (
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>SIMFIMENT</p>
            <h1>{m.title}</h1>
            <p>{m.description}</p>
          </div>
          <Button onClick={() => setEditing(true)}>{m.edit}</Button>
        </header>
      )}
      {embedded && !editing && (
        <Button type="button" variant="outlined" onClick={() => setEditing(true)}>
          {m.edit}
        </Button>
      )}
      <div className={styles.section}>
        <TextField
          type="month"
          label={m.month}
          value={month}
          required
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) setSelectedMonth(e.target.value);
          }}
        />
      </div>
      {budgets.isPending || categories.isPending ? (
        <PageLoading />
      ) : budgets.isError ? (
        <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : (
        <>
          {(editing || budgets.data.items.length === 0) && (
            <Card>
              <BudgetEditor
                key={`${month}-${settings.currencyCode}`}
                settings={settings}
                month={month}
                initial={budgets.data}
                categories={categories.data}
                onSaved={() => setEditing(false)}
              />
            </Card>
          )}
          {budgets.data.items.map((item) => {
            const name =
              item.categoryId === 0
                ? m.total
                : (categories.data.find((c) => c.id === item.categoryId)?.name ??
                  String(item.categoryId));
            const day = item.days.find((d) => d.date === today);
            return (
              <section className={styles.section} key={item.categoryId}>
                <Card>
                  <div className={styles.sectionTitle}>
                    <h2>{name}</h2>
                    <MoneyText
                      amount={item.amountMinor}
                      currency={settings.currencyCode}
                      exponent={settings.currencyExponent}
                      showSign={false}
                    />
                  </div>
                  <dl className={styles.budgetStats}>
                    {day && (
                      <div>
                        <dt>{m.available}</dt>
                        <dd>
                          <MoneyText
                            amount={day.availableMinor}
                            currency={settings.currencyCode}
                            exponent={settings.currencyExponent}
                          />
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>{m.spent}</dt>
                      <dd>
                        <MoneyText
                          amount={item.expenseMinor}
                          currency={settings.currencyCode}
                          exponent={settings.currencyExponent}
                          showSign={false}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>{m.remaining}</dt>
                      <dd>
                        <MoneyText
                          amount={item.remainingMinor}
                          currency={settings.currencyCode}
                          exponent={settings.currencyExponent}
                        />
                      </dd>
                    </div>
                  </dl>
                  <Disclosure label={m.daily}>
                    <div className={styles.tableScroll}>
                      <table className={styles.budgetTable}>
                        <caption className={styles.srOnly}>
                          {name} · {month} · {m.daily}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{m.date}</th>
                            <th scope="col">{m.allocation}</th>
                            <th scope="col">{m.dailySpent}</th>
                            <th scope="col">{m.dailyAvailable}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.days.map((d) => (
                            <tr key={d.date}>
                              <th scope="row">{d.date.slice(5)}</th>
                              <td>
                                <MoneyText
                                  amount={d.allocationMinor}
                                  currency={settings.currencyCode}
                                  exponent={settings.currencyExponent}
                                  showSign={false}
                                />
                              </td>
                              <td>
                                <MoneyText
                                  amount={d.expenseMinor}
                                  currency={settings.currencyCode}
                                  exponent={settings.currencyExponent}
                                  showSign={false}
                                />
                              </td>
                              <td>
                                <MoneyText
                                  amount={d.availableMinor}
                                  currency={settings.currencyCode}
                                  exponent={settings.currencyExponent}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Disclosure>
                </Card>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}

function BudgetEditor({
  settings,
  month,
  initial,
  categories,
  onSaved,
}: {
  settings: Settings;
  month: string;
  initial: MonthlyBudgets;
  categories: Category[];
  onSaved: () => void;
}) {
  const {
    locale,
    messages: { budget: m, common },
  } = useI18n();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const initialTotal = initial.items.find((i) => i.categoryId === 0);
  const [totalEnabled, setTotalEnabled] = useState(Boolean(initialTotal));
  const [total, setTotal] = useState(
    initialTotal ? minorToMajorInput(initialTotal.amountMinor, settings.currencyExponent) : "",
  );
  const [rows, setRows] = useState(() =>
    initial.items
      .filter((i) => i.categoryId !== 0)
      .map((i) => ({
        key: crypto.randomUUID(),
        categoryId: String(i.categoryId),
        amount: minorToMajorInput(i.amountMinor, settings.currencyExponent),
      })),
  );
  const bounds = moneyInputBounds(settings.currencyExponent);
  const items: BudgetLimit[] = [
    ...(totalEnabled
      ? [{ categoryId: 0, amountMinor: majorToMinor(total, settings.currencyExponent) ?? 0 }]
      : []),
    ...rows.map((r) => ({
      categoryId: Number(r.categoryId),
      amountMinor: majorToMinor(r.amount, settings.currencyExponent) ?? 0,
    })),
  ];
  const valid =
    items.every((i) => i.amountMinor > 0) &&
    rows.every((r) => Number(r.categoryId) > 0) &&
    new Set(items.map((i) => i.categoryId)).size === items.length;
  const save = useMutation({
    mutationFn: () =>
      api.put<{ items: BudgetLimit[] }, MonthlyBudgets>(`/api/v1/budgets/${month}`, { items }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budgets"] });
      showToast({ message: m.saved });
      onSaved();
    },
  });
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !save.isPending) save.mutate();
      }}
    >
      <h2>{m.edit}</h2>
      <p className={styles.hint}>{m.effectiveHint}</p>
      <SwitchField label={m.enableTotal} checked={totalEnabled} onCheckedChange={setTotalEnabled} />
      {totalEnabled && (
        <NumericField
          label={`${m.total} · ${m.monthlyLimit}`}
          value={total}
          onValueChange={setTotal}
          prefix={currencySymbol(locale, settings.currencyCode)}
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          fractionDigits={settings.currencyExponent}
          required
        />
      )}
      {rows.map((row, index) => (
        <fieldset key={row.key} className={styles.budgetEditorRow}>
          <legend>
            {m.title} {index + 1}
          </legend>
          <SelectField
            label={common.category}
            value={row.categoryId}
            onValueChange={(value) =>
              setRows(rows.map((r) => (r.key === row.key ? { ...r, categoryId: value } : r)))
            }
            options={categories
              .filter(
                (c) =>
                  (!c.archivedAt || initial.items.some((i) => i.categoryId === c.id)) &&
                  (String(c.id) === row.categoryId ||
                    !rows.some((r) => r.categoryId === String(c.id))),
              )
              .map((c) => ({ value: String(c.id), label: c.name }))}
            required
          />
          <NumericField
            label={m.monthlyLimit}
            value={row.amount}
            onValueChange={(amount) =>
              setRows(rows.map((r) => (r.key === row.key ? { ...r, amount } : r)))
            }
            prefix={currencySymbol(locale, settings.currencyCode)}
            min={bounds.min}
            max={bounds.max}
            step={bounds.step}
            fractionDigits={settings.currencyExponent}
            required
          />
          <Button variant="text" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
            {m.remove}
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outlined"
        disabled={
          !categories.some((c) => !c.archivedAt && !rows.some((r) => Number(r.categoryId) === c.id))
        }
        onClick={() => setRows([...rows, { key: crypto.randomUUID(), categoryId: "", amount: "" }])}
      >
        {m.add}
      </Button>
      <p className={styles.hint}>{m.scopeHint}</p>
      {!valid && <p className={styles.fieldError}>{m.invalid}</p>}
      {save.error && (
        <p className={styles.formError} role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <Button type="submit" loading={save.isPending} disabled={!valid}>
        {m.save}
      </Button>
    </form>
  );
}
