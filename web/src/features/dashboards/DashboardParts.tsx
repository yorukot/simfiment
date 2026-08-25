import type { CategoryTotal, Totals } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { Card, CategoryIcon } from "../../components/ui";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

export function Summary({
  totals,
  currency,
  exponent = 0,
}: {
  totals: Totals;
  currency: string;
  exponent?: number;
}) {
  const { messages } = useI18n();
  return (
    <div className={styles.summaryGrid}>
      <Card className={`${styles.summaryCard} ${styles.summaryIncome}`}>
        <span className={styles.summaryLabel}>{messages.common.income}</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.incomeMinor}
          currency={currency}
          exponent={exponent}
          kind="income"
        />
      </Card>
      <Card className={`${styles.summaryCard} ${styles.summaryExpense}`}>
        <span className={styles.summaryLabel}>{messages.common.expense}</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.expenseMinor}
          currency={currency}
          exponent={exponent}
          kind="expense"
        />
      </Card>
      <Card className={`${styles.summaryCard} ${styles.summaryNet}`}>
        <span className={styles.summaryLabel}>{messages.common.net}</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.netMinor}
          currency={currency}
          exponent={exponent}
          kind="net"
        />
      </Card>
    </div>
  );
}

export function CategoryBars({
  items,
  currency,
  exponent = 0,
  kind,
}: {
  items: CategoryTotal[];
  currency: string;
  exponent?: number;
  kind: "income" | "expense";
}) {
  const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
  return (
    <Card className={styles.bars}>
      {items.map((item) => {
        const share = categoryShare(item.amountMinor, total);
        return (
          <div className={styles.barRow} key={item.categoryId}>
            <div className={styles.barHeader}>
              <span className={styles.categoryLabel}>
                <CategoryIcon iconKey={item.iconKey} width={20} height={20} />
                {item.name}
              </span>
              <span className={styles.barValue}>
                <MoneyText
                  amount={item.amountMinor}
                  currency={currency}
                  exponent={exponent}
                  kind={kind}
                  showSign={false}
                />
                <span className={styles.barPercent}>{share.label}</span>
              </span>
            </div>
            <div className={styles.barPlot} aria-hidden="true">
              <div
                className={`${styles.barFill} ${kind === "income" ? styles.barFillIncome : ""}`}
                style={{
                  width: `${share.percentage}%`,
                  minWidth: share.percentage > 0 ? 3 : 0,
                }}
              />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

export function categoryShare(amount: number, total: number) {
  if (amount <= 0 || total <= 0) return { percentage: 0, label: "0%" };
  const rawPercentage = Math.min(100, (amount / total) * 100);
  return {
    percentage: Math.round(rawPercentage * 100) / 100,
    label: rawPercentage < 1 ? "<1%" : `${Math.round(rawPercentage)}%`,
  };
}
