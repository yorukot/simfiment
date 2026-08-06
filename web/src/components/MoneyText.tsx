import styles from "../styles/ui.module.css";
import { useI18n } from "../i18n";
import { formatMoneyMinor } from "../lib/money";

type Props = {
  amount: number;
  currency?: string;
  exponent?: number;
  kind?: "income" | "expense" | "net";
  showSign?: boolean;
  className?: string;
};

export function MoneyText({
  amount,
  currency = "TWD",
  exponent,
  kind = "net",
  showSign = true,
  className = "",
}: Props) {
  const { locale } = useI18n();
  const absolute = Math.abs(amount);
  const resolvedExponent =
    exponent ??
    (currency === "TWD"
      ? 0
      : (new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions()
          .maximumFractionDigits ?? 0));
  const formatted = formatMoneyMinor(absolute, currency, resolvedExponent, locale);
  const direction =
    kind === "income" || (kind === "net" && amount > 0)
      ? "income"
      : kind === "expense" || amount < 0
        ? "expense"
        : "neutral";
  const sign =
    showSign && direction === "income" ? "+" : showSign && direction === "expense" ? "−" : "";
  return (
    <span className={`${styles.money} ${styles[direction]} ${className}`}>
      {sign}
      {formatted}
    </span>
  );
}
