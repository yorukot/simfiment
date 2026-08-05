import { Link } from "react-router-dom";
import type { Transaction } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import styles from "../../styles/ui.module.css";

export function TransactionRow({ transaction, timezone = "Asia/Taipei" }: { transaction: Transaction; timezone?: string }) {
  const time = new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(transaction.occurredAt));
  return (
    <Link className={styles.transactionRow} to={`/transactions/${transaction.id}`}>
      <span className={styles.rowTime}>{time}</span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{transaction.title || transaction.category.name}</span>
        <span className={styles.rowMeta}>
          {transaction.title ? transaction.category.name : "交易"}
          {transaction.locationStatus === "attached" ? <span aria-label="已附上輸入位置" title="已附上輸入位置"> · ◉</span> : null}
        </span>
      </span>
      <MoneyText className={styles.rowAmount} amount={transaction.amountMinor} currency={transaction.currencyCode} kind={transaction.kind} />
    </Link>
  );
}
