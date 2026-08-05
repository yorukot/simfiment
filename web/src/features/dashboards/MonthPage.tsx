import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MonthlyDashboard, Settings, Transaction } from "../../api/types";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { addMonths, formatMonth, monthInTimezone } from "../../lib/date";
import { TransactionRow } from "../transactions/TransactionRow";
import { CategoryBars, Summary } from "./DashboardParts";
import styles from "../../styles/ui.module.css";

export function MonthPage({ settings }: { settings: Settings }) {
  const params = useParams();
  const navigate = useNavigate();
  const current = monthInTimezone(settings.timezone);
  const month = params.month ?? current;
  const nextMonth = addMonths(month, 1);
  const dashboard = useQuery({ queryKey: ["dashboard", "month", month], queryFn: ({ signal }) => api.get<MonthlyDashboard>(`/api/v1/dashboards/month?month=${month}`, signal) });
  const transactions = useQuery({ queryKey: ["transactions", { from: `${month}-01`, to: `${nextMonth}-01` }], queryFn: ({ signal }) => api.get<Transaction[]>(`/api/v1/transactions?from=${month}-01&to=${nextMonth}-01&limit=200`, signal) });
  const go = (value: string) => navigate(value === current ? "/month" : `/month/${value}`);
  if (dashboard.isPending || transactions.isPending) return <PageLoading />;
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  if (transactions.isError) return <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />;
  const max = Math.max(...dashboard.data.dailySeries.flatMap((point) => [point.expenseMinor, point.incomeMinor]), 1);
  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>每月回顧</p><h1>{formatMonth(month)}</h1><p><span className={styles.countPill}>{dashboard.data.totals.transactionCount} 筆交易</span></p></div></header>
    <div className={styles.dateNavigator}><button className={styles.iconButton} type="button" aria-label="上個月" onClick={() => go(addMonths(month, -1))}>‹</button>{month !== current ? <button className={styles.secondaryButton} type="button" onClick={() => go(current)}>本月</button> : <span className={styles.countPill}>本月</span>}<button className={styles.iconButton} type="button" aria-label="下個月" onClick={() => go(addMonths(month, 1))}>›</button></div>
    <section className={styles.section}><Summary totals={dashboard.data.totals} currency={dashboard.data.currencyCode} /></section>
    {dashboard.data.expenseCategories.length ? <section className={styles.section}><div className={styles.sectionTitle}><h2>支出分類</h2></div><CategoryBars items={dashboard.data.expenseCategories} currency={dashboard.data.currencyCode} kind="expense" /></section> : null}
    {dashboard.data.incomeCategories.length ? <section className={styles.section}><div className={styles.sectionTitle}><h2>收入分類</h2></div><CategoryBars items={dashboard.data.incomeCategories} currency={dashboard.data.currencyCode} kind="income" /></section> : null}
    <section className={styles.section}><div className={styles.sectionTitle}><h2>每日收支</h2></div><div className={styles.activityGrid} role="img" aria-label={`${formatMonth(month)}每日收入與支出長條圖`}>{dashboard.data.dailySeries.map((point) => <div key={point.date} className={styles.activityDay} title={`${point.date}: 收入 NT$ ${point.incomeMinor.toLocaleString("zh-TW")}，支出 NT$ ${point.expenseMinor.toLocaleString("zh-TW")}`}><span className={`${styles.activityBar} ${styles.activityIncome}`} style={{ height: `${point.incomeMinor === 0 ? 2 : Math.max(3, point.incomeMinor / max * 100)}%` }} /><span className={styles.activityBar} style={{ height: `${point.expenseMinor === 0 ? 2 : Math.max(3, point.expenseMinor / max * 100)}%` }} /></div>)}</div><div className={styles.activityLegend}><span>收入</span><span>支出</span><span>每組代表一天；完整數值另列供輔助技術讀取</span></div><ul className={styles.srOnly}>{dashboard.data.dailySeries.map((point) => <li key={point.date}>{point.date}：收入 NT$ {point.incomeMinor.toLocaleString("zh-TW")}，支出 NT$ {point.expenseMinor.toLocaleString("zh-TW")}</li>)}</ul></section>
    <section className={styles.section}><div className={styles.sectionTitle}><h2>本月交易</h2></div>{transactions.data.length ? <div className={styles.list}>{transactions.data.map((item) => <TransactionRow key={item.id} transaction={item} timezone={settings.timezone} />)}</div> : <EmptyState title="這個月還沒有交易">實際確認的收入與支出會顯示在這裡，待處理週期項目不會計入。</EmptyState>}</section>
  </>;
}
