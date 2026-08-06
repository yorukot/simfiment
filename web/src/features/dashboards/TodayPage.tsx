import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { DailyDashboard, Settings, Transaction } from "../../api/types";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { addDays, formatDate, todayInTimezone } from "../../lib/date";
import { TransactionRow } from "../transactions/TransactionRow";
import { CategoryBars, Summary } from "./DashboardParts";
import { Button, Chip, Icon, IconButton } from "../../components/ui";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

export function TodayPage({ settings, onAdd }: { settings: Settings; onAdd: () => void }) {
  const { locale, messages } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const today = todayInTimezone(settings.timezone);
  const date = params.date ?? today;
  const fullDateLabel = formatDate(date, locale);
  const compactDateLabel = new Intl.DateTimeFormat(locale, {
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
          <p className={styles.eyebrow}>
            {date === today ? messages.nav.today : messages.dashboard.dailySummary}
          </p>
          <h1 aria-label={fullDateLabel}>
            <span className={styles.wideDate} aria-hidden="true">
              {fullDateLabel}
            </span>
            <span className={styles.compactDate} aria-hidden="true">
              {compactDateLabel}
            </span>
          </h1>
          <p>
            <Chip>{messages.common.transactionCount(dashboard.data.totals.transactionCount)}</Chip>
          </p>
        </div>
        <Button type="button" onClick={onAdd}>
          <Icon name="add" size={20} />
          {messages.dashboard.recordCompact}
        </Button>
      </header>
      <div className={styles.dateNavigator} aria-label={messages.dashboard.dateNavigation}>
        <IconButton
          variant="outlined"
          icon="chevronLeft"
          label={messages.dashboard.previousDay}
          onClick={() => go(addDays(date, -1))}
        />
        {date !== today ? (
          <Button variant="outlined" type="button" onClick={() => go(today)}>
            {messages.dashboard.backToToday}
          </Button>
        ) : (
          <Chip>{messages.nav.today}</Chip>
        )}
        <IconButton
          variant="outlined"
          icon="chevronRight"
          label={messages.dashboard.nextDay}
          onClick={() => go(addDays(date, 1))}
        />
      </div>
      <section className={styles.section}>
        <Summary
          totals={dashboard.data.totals}
          currency={dashboard.data.currencyCode}
          exponent={settings.currencyExponent}
        />
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.dashboard.transactions}</h2>
        </div>
        {transactions.data.length ? (
          <div className={styles.list}>
            {transactions.data.map((item) => (
              <TransactionRow
                key={item.id}
                transaction={item}
                timezone={settings.timezone}
                currencyExponent={settings.currencyExponent}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={messages.dashboard.emptyDayTitle}
            action={
              <Button type="button" onClick={onAdd}>
                <Icon name="add" size={20} />
                {messages.nav.recordTransaction}
              </Button>
            }
          >
            {messages.dashboard.emptyDayBody}
          </EmptyState>
        )}
      </section>
      {dashboard.data.expenseCategories.length ? (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>{messages.dashboard.expenseDistributionToday}</h2>
          </div>
          <CategoryBars
            items={dashboard.data.expenseCategories}
            currency={dashboard.data.currencyCode}
            exponent={settings.currencyExponent}
            kind="expense"
          />
        </section>
      ) : null}
      {date !== today ? (
        <p className={styles.hint} style={{ marginTop: 20 }}>
          <Link to="/today">{messages.dashboard.backToToday}</Link>
        </p>
      ) : null}
    </>
  );
}
