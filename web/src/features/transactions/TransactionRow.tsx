import { Link } from "react-router-dom";
import type { Transaction } from "../../api/types";
import { MoneyText } from "../../components/MoneyText";
import { CategoryIcon, Icon } from "../../components/ui";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

export function TransactionRow({
  transaction,
  timezone = "Asia/Taipei",
  currencyExponent = 0,
}: {
  transaction: Transaction;
  timezone?: string;
  currencyExponent?: number;
}) {
  const { locale, messages } = useI18n();
  const time = new Intl.DateTimeFormat(locale, {
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
            {transaction.title ? transaction.category.name : messages.common.transaction} · {time}
          </span>
          {transaction.locationStatus === "attached" ? (
            <span
              className={styles.rowLocation}
              aria-label={messages.transactionRow.attachedLocation}
              title={messages.transactionRow.attachedLocation}
            >
              <Icon name="location" size={15} />
            </span>
          ) : null}
        </span>
      </span>
      <MoneyText
        className={styles.rowAmount}
        amount={transaction.amountMinor}
        currency={transaction.currencyCode}
        exponent={currencyExponent}
        kind={transaction.kind}
      />
    </Link>
  );
}
