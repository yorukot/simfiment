import { Link } from "react-router-dom";
import type { Transaction } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { CategoryIcon, Icon } from "../../components/ui";
import styles from "../../styles/ui.module.css";

export function TransactionRow({
  transaction,
  timezone = "Asia/Taipei",
}: {
  transaction: Transaction;
  timezone?: string;
}) {
  const time = new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(transaction.occurredAt));
  return (
    <Link className={styles.transactionRow} to={`/transactions/${transaction.id}`}>
      <span className={styles.rowCategoryIcon}>
        <CategoryIcon iconKey={transaction.category.iconKey} width={22} height={22} />
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{transaction.title || transaction.category.name}</span>
        <span className={styles.rowMeta}>
          <span>
            {transaction.title ? transaction.category.name : "交易"} · {time}
          </span>
          {transaction.locationStatus === "attached" ? (
            <span className={styles.rowLocation} aria-label="已附上輸入位置" title="已附上輸入位置">
              <Icon name="location" size={15} />
            </span>
          ) : null}
        </span>
      </span>
      <MoneyText
        className={styles.rowAmount}
        amount={transaction.amountMinor}
        currency={transaction.currencyCode}
        kind={transaction.kind}
      />
    </Link>
  );
}
