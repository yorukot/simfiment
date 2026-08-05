import type { CategoryTotal, Totals } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { CategoryIcon } from "../../components/ui";
import styles from "../../styles/ui.module.css";

export function Summary({ totals, currency }: { totals: Totals; currency: string }) {
  return (
    <div className={styles.summaryGrid}>
      <div className={`${styles.summaryCard} ${styles.summaryIncome}`}>
        <span className={styles.summaryLabel}>收入</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.incomeMinor}
          currency={currency}
          kind="income"
        />
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryExpense}`}>
        <span className={styles.summaryLabel}>支出</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.expenseMinor}
          currency={currency}
          kind="expense"
        />
      </div>
      <div className={`${styles.summaryCard} ${styles.summaryNet}`}>
        <span className={styles.summaryLabel}>淨額</span>
        <MoneyText
          className={styles.summaryValue}
          amount={totals.netMinor}
          currency={currency}
          kind="net"
        />
      </div>
    </div>
  );
}

export function CategoryBars({
  items,
  currency,
  kind,
}: {
  items: CategoryTotal[];
  currency: string;
  kind: "income" | "expense";
}) {
  const total = items.reduce((sum, item) => sum + item.amountMinor, 0);
  return (
    <div className={`${styles.card} ${styles.bars}`}>
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
    </div>
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
