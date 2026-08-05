import type { CategoryTotal, Totals } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import styles from "../../styles/ui.module.css";

export function Summary({ totals, currency }: { totals: Totals; currency: string }) {
  return <div className={styles.summaryGrid}>
    <div className={styles.summaryCard}><span className={styles.summaryLabel}>收入</span><MoneyText className={styles.summaryValue} amount={totals.incomeMinor} currency={currency} kind="income" /></div>
    <div className={styles.summaryCard}><span className={styles.summaryLabel}>支出</span><MoneyText className={styles.summaryValue} amount={totals.expenseMinor} currency={currency} kind="expense" /></div>
    <div className={styles.summaryCard}><span className={styles.summaryLabel}>淨額</span><MoneyText className={styles.summaryValue} amount={totals.netMinor} currency={currency} kind="net" /></div>
  </div>;
}

export function CategoryBars({ items, currency, kind }: { items: CategoryTotal[]; currency: string; kind: "income" | "expense" }) {
  const max = Math.max(...items.map((item) => item.amountMinor), 1);
  return <div className={`${styles.card} ${styles.bars}`}>
    {items.map((item) => <div key={item.categoryId}>
      <div className={styles.barHeader}><span>{item.name} <small>· {item.transactionCount} 筆</small></span><MoneyText amount={item.amountMinor} currency={currency} kind={kind} showSign={false} /></div>
      <div className={styles.barTrack}><div className={`${styles.barFill} ${kind === "income" ? styles.barFillIncome : ""}`} style={{ width: `${Math.max(3, item.amountMinor / max * 100)}%` }} /></div>
    </div>)}
  </div>;
}

