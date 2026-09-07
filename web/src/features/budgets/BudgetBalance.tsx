import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { MonthlyBudgets, Settings } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { ErrorState } from "../../components/States";
import { Card } from "../../components/ui";
import { useI18n } from "../../i18n";
import { useLocalDate } from "../../lib/useLocalDate";
import styles from "../../styles/ui.module.css";

export function useBudgets(month: string, enabled = true) {
  return useQuery({
    queryKey: ["budgets", month],
    queryFn: ({ signal }) => api.get<MonthlyBudgets>(`/api/v1/budgets?month=${month}`, signal),
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function BudgetBalance({
  settings,
  categoryId,
  categoryName,
  enabled = true,
}: {
  settings: Settings;
  categoryId?: number;
  categoryName?: string;
  enabled?: boolean;
}) {
  const {
    messages: { budget: m },
  } = useI18n();
  const date = useLocalDate(settings.timezone);
  const budgets = useBudgets(date.slice(0, 7), enabled);
  if (!enabled || budgets.isPending) return null;
  if (budgets.isError)
    return <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} />;
  const items = budgets.data.items.filter(
    (item) => item.categoryId === 0 || item.categoryId === categoryId,
  );
  if (!budgets.data.items.length)
    return (
      <p className={styles.hint}>
        <Link to="/budgets">
          {m.empty} · {m.edit}
        </Link>
      </p>
    );
  return (
    <div className={styles.budgetBalances} aria-live="polite">
      {items.map((item) => {
        const day = item.days.find((day) => day.date === date);
        if (!day) return null;
        return (
          <Card key={item.categoryId}>
            <p className={styles.eyebrow}>
              {item.categoryId === 0 ? m.total : (categoryName ?? m.title)} · {m.available}
            </p>
            <MoneyText
              amount={day.availableMinor}
              currency={settings.currencyCode}
              exponent={settings.currencyExponent}
            />
            {day.availableMinor < 0 && <p className={styles.fieldError}>{m.exceeded}</p>}
          </Card>
        );
      })}
    </div>
  );
}
