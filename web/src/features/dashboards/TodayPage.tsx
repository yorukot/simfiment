import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { DailyDashboard, Settings, Transaction } from "../../api/types";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { addDays, formatDate, todayInTimezone } from "../../lib/date";
import { TransactionRow } from "../transactions/TransactionRow";
import { CategoryBars, Summary } from "./DashboardParts";
import { Button, Chip, Icon, IconButton } from "../../components/ui";
import styles from "../../styles/ui.module.css";

export function TodayPage({ settings, onAdd }: { settings: Settings; onAdd: () => void }) {
  const params = useParams();
  const navigate = useNavigate();
  const today = todayInTimezone(settings.timezone);
  const date = params.date ?? today;
  const fullDateLabel = formatDate(date);
  const compactDateLabel = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const dashboard = useQuery({
    queryKey: ["dashboard", "day", date],
    queryFn: ({ signal }) => api.get<DailyDashboard>(`/api/v1/dashboards/day?date=${date}`, signal),
  });
  const transactions = useQuery({
    queryKey: ["transactions", { from: date, to: addDays(date, 1) }],
    queryFn: ({ signal }) =>
      api.get<Transaction[]>(
        `/api/v1/transactions?from=${date}&to=${addDays(date, 1)}&limit=200`,
        signal,
      ),
  });
  const go = (value: string) => navigate(value === today ? "/today" : `/day/${value}`);
  if (dashboard.isPending || transactions.isPending) return <PageLoading />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  if (transactions.isError)
    return <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />;
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{date === today ? "今天" : "每日摘要"}</p>
          <h1 aria-label={fullDateLabel}>
            <span className={styles.wideDate} aria-hidden="true">
              {fullDateLabel}
            </span>
            <span className={styles.compactDate} aria-hidden="true">
              {compactDateLabel}
            </span>
          </h1>
          <p>
            <Chip>{dashboard.data.totals.transactionCount} 筆交易</Chip>
          </p>
        </div>
        <Button type="button" onClick={onAdd}>
          <Icon name="add" size={20} />
          記一筆
        </Button>
      </header>
      <div className={styles.dateNavigator} aria-label="日期導覽">
        <IconButton
          variant="outlined"
          icon="chevronLeft"
          label="前一天"
          onClick={() => go(addDays(date, -1))}
        />
        {date !== today ? (
          <Button variant="outlined" type="button" onClick={() => go(today)}>
            回到今天
          </Button>
        ) : (
          <Chip>今天</Chip>
        )}
        <IconButton
          variant="outlined"
          icon="chevronRight"
          label="後一天"
          onClick={() => go(addDays(date, 1))}
        />
      </div>
      <section className={styles.section}>
        <Summary totals={dashboard.data.totals} currency={dashboard.data.currencyCode} />
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>交易</h2>
        </div>
        {transactions.data.length ? (
          <div className={styles.list}>
            {transactions.data.map((item) => (
              <TransactionRow key={item.id} transaction={item} timezone={settings.timezone} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="這一天還沒有交易"
            action={
              <Button type="button" onClick={onAdd}>
                <Icon name="add" size={20} />
                記錄交易
              </Button>
            }
          >
            記錄一筆收入或支出，便會在這裡看到摘要。
          </EmptyState>
        )}
      </section>
      {dashboard.data.expenseCategories.length ? (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>今日支出分布</h2>
          </div>
          <CategoryBars
            items={dashboard.data.expenseCategories}
            currency={dashboard.data.currencyCode}
            kind="expense"
          />
        </section>
      ) : null}
      {date !== today ? (
        <p className={styles.hint} style={{ marginTop: 20 }}>
          <Link to="/today">回到今天</Link>
        </p>
      ) : null}
    </>
  );
}
