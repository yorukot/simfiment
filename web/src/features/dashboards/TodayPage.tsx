import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { DailyDashboard, Settings, Transaction } from "../../api/types";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { addDays, formatDate, todayInTimezone } from "../../lib/date";
import { TransactionRow } from "../transactions/TransactionRow";
import { CategoryBars, Summary } from "./DashboardParts";
import styles from "../../styles/ui.module.css";

export function TodayPage({ settings, onAdd }: { settings: Settings; onAdd: () => void }) {
  const params = useParams();
  const navigate = useNavigate();
  const today = todayInTimezone(settings.timezone);
  const date = params.date ?? today;
  const dashboard = useQuery({ queryKey: ["dashboard", "day", date], queryFn: ({ signal }) => api.get<DailyDashboard>(`/api/v1/dashboards/day?date=${date}`, signal) });
  const transactions = useQuery({ queryKey: ["transactions", { from: date, to: addDays(date, 1) }], queryFn: ({ signal }) => api.get<Transaction[]>(`/api/v1/transactions?from=${date}&to=${addDays(date, 1)}&limit=200`, signal) });
  const go = (value: string) => navigate(value === today ? "/today" : `/day/${value}`);
  if (dashboard.isPending || transactions.isPending) return <PageLoading />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  if (transactions.isError) return <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />;
  return <>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>{date === today ? "今天" : "每日摘要"}</p><h1>{formatDate(date)}</h1><p><span className={styles.countPill}>{dashboard.data.totals.transactionCount} 筆交易</span></p></div>
      <button className={styles.primaryButton} type="button" onClick={onAdd}>＋ 記一筆</button>
    </header>
    <div className={styles.dateNavigator} aria-label="日期導覽"><button className={styles.iconButton} type="button" aria-label="前一天" onClick={() => go(addDays(date, -1))}>‹</button>{date !== today ? <button className={styles.secondaryButton} type="button" onClick={() => go(today)}>回到今天</button> : <span className={styles.countPill}>今天</span>}<button className={styles.iconButton} type="button" aria-label="後一天" onClick={() => go(addDays(date, 1))}>›</button></div>
    <section className={styles.section}><Summary totals={dashboard.data.totals} currency={dashboard.data.currencyCode} /></section>
    {dashboard.data.expenseCategories.length ? <section className={styles.section}><div className={styles.sectionTitle}><h2>支出分類</h2></div><CategoryBars items={dashboard.data.expenseCategories} currency={dashboard.data.currencyCode} kind="expense" /></section> : null}
    <section className={styles.section}>
      <div className={styles.sectionTitle}><h2>交易</h2></div>
      {transactions.data.length ? <div className={styles.list}>{transactions.data.map((item) => <TransactionRow key={item.id} transaction={item} timezone={settings.timezone} />)}</div> : <EmptyState title="這一天還沒有交易">記錄一筆收入或支出，便會在這裡看到摘要。<br /><button className={styles.primaryButton} type="button" onClick={onAdd}>記錄交易</button></EmptyState>}
    </section>
    {date !== today ? <p className={styles.hint} style={{ marginTop: 20 }}><Link to="/today">回到今天</Link></p> : null}
  </>;
}
