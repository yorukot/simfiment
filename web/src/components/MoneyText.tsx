import styles from "../styles/ui.module.css";

type Props = {
  amount: number;
  currency?: string;
  kind?: "income" | "expense" | "net";
  showSign?: boolean;
  className?: string;
};

export function MoneyText({ amount, currency = "TWD", kind = "net", showSign = true, className = "" }: Props) {
  const absolute = Math.abs(amount);
  const formatted = currency === "TWD"
    ? `NT$ ${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(absolute)}`
    : new Intl.NumberFormat("zh-TW", { style: "currency", currency, maximumFractionDigits: 0 }).format(absolute);
  const direction = kind === "income" || (kind === "net" && amount > 0) ? "income" : kind === "expense" || amount < 0 ? "expense" : "neutral";
  const sign = showSign && direction === "income" ? "+" : showSign && direction === "expense" ? "−" : "";
  return <span className={`${styles.money} ${styles[direction]} ${className}`}>{sign}{formatted}</span>;
}
