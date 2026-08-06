import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MonthlyDashboard, Settings, Transaction } from "../../api/types";
import { EmptyState, ErrorState, PageLoading } from "../../components/States";
import { addMonths, formatMonth, monthInTimezone } from "../../lib/date";
import { formatMoneyMinor } from "../../lib/money";
import { TransactionRow } from "../transactions/TransactionRow";
import { CategoryBars, Summary } from "./DashboardParts";
import { Button, Chip, IconButton } from "../../components/ui";
import { useI18n } from "../../i18n";
import styles from "../../styles/ui.module.css";

type DailySeriesPoint = MonthlyDashboard["dailySeries"][number];

export type ActivityScale = {
  ceiling: number;
  isTruncated: boolean;
};

const TRUNCATION_THRESHOLD = 4;
const REFERENCE_HEIGHT = 0.7;

export function activityScale(points: DailySeriesPoint[]): ActivityScale {
  const values = points
    .flatMap((point) => [point.expenseMinor, point.incomeMinor])
    .filter((value) => value > 0)
    .sort((left, right) => right - left);
  const maximum = values[0] ?? 1;
  const nextLowerValue = values.find((value) => value < maximum);

  if (nextLowerValue && maximum >= nextLowerValue * TRUNCATION_THRESHOLD) {
    return {
      ceiling: nextLowerValue / REFERENCE_HEIGHT,
      isTruncated: true,
    };
  }

  return { ceiling: maximum, isTruncated: false };
}

export function activityBarHeight(value: number, scale: ActivityScale): number {
  if (value === 0) return 2;
  return Math.min(100, Math.max(3, (value / scale.ceiling) * 100));
}

export function MonthPage({ settings }: { settings: Settings }) {
  const { locale, messages } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const current = monthInTimezone(settings.timezone);
  const month = params.month ?? current;
  const nextMonth = addMonths(month, 1);
  const dashboard = useQuery({
    queryKey: ["dashboard", "month", month],
    queryFn: ({ signal }) =>
      api.get<MonthlyDashboard>(`/api/v1/dashboards/month?month=${month}`, signal),
  });
  const transactions = useQuery({
    queryKey: ["transactions", { from: `${month}-01`, to: `${nextMonth}-01` }],
    queryFn: ({ signal }) =>
      api.get<Transaction[]>(
        `/api/v1/transactions?from=${month}-01&to=${nextMonth}-01&limit=200`,
        signal,
      ),
  });
  const go = (value: string) => navigate(value === current ? "/month" : `/month/${value}`);
  if (dashboard.isPending || transactions.isPending) return <PageLoading />;
  if (dashboard.isError)
    return <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />;
  if (transactions.isError)
    return <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />;
  const scale = activityScale(dashboard.data.dailySeries);
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>{messages.dashboard.monthlyReview}</p>
          <h1>{formatMonth(month, locale)}</h1>
          <p>
            <Chip>{messages.common.transactionCount(dashboard.data.totals.transactionCount)}</Chip>
          </p>
        </div>
      </header>
      <div className={styles.dateNavigator} aria-label={messages.dashboard.monthNavigation}>
        <IconButton
          variant="outlined"
          icon="chevronLeft"
          label={messages.dashboard.previousMonth}
          onClick={() => go(addMonths(month, -1))}
        />
        {month !== current ? (
          <Button variant="outlined" type="button" onClick={() => go(current)}>
            {messages.dashboard.currentMonth}
          </Button>
        ) : (
          <Chip>{messages.dashboard.currentMonth}</Chip>
        )}
        <IconButton
          variant="outlined"
          icon="chevronRight"
          label={messages.dashboard.nextMonth}
          onClick={() => go(addMonths(month, 1))}
        />
      </div>
      <section className={styles.section}>
        <Summary
          totals={dashboard.data.totals}
          currency={dashboard.data.currencyCode}
          exponent={settings.currencyExponent}
        />
      </section>
      {dashboard.data.expenseCategories.length ? (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>{messages.dashboard.expenseDistribution}</h2>
          </div>
          <CategoryBars
            items={dashboard.data.expenseCategories}
            currency={dashboard.data.currencyCode}
            exponent={settings.currencyExponent}
            kind="expense"
          />
        </section>
      ) : null}
      {dashboard.data.incomeCategories.length ? (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>
            <h2>{messages.dashboard.incomeDistribution}</h2>
          </div>
          <CategoryBars
            items={dashboard.data.incomeCategories}
            currency={dashboard.data.currencyCode}
            exponent={settings.currencyExponent}
            kind="income"
          />
        </section>
      ) : null}
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.dashboard.dailyActivity}</h2>
        </div>
        <div
          className={styles.activityGrid}
          role="img"
          aria-label={messages.dashboard.dailyChartLabel(formatMonth(month, locale))}
        >
          {dashboard.data.dailySeries.map((point) => (
            <div
              key={point.date}
              className={styles.activityDay}
              title={messages.dashboard.dailyChartPoint(
                point.date,
                formatMoneyMinor(
                  point.incomeMinor,
                  dashboard.data.currencyCode,
                  settings.currencyExponent,
                  locale,
                ),
                formatMoneyMinor(
                  point.expenseMinor,
                  dashboard.data.currencyCode,
                  settings.currencyExponent,
                  locale,
                ),
              )}
            >
              <span className={styles.activityBars} aria-hidden="true">
                <span
                  className={`${styles.activityBar} ${styles.activityIncome} ${
                    point.incomeMinor > scale.ceiling ? styles.activityBarTruncated : ""
                  }`}
                  style={{ height: `${activityBarHeight(point.incomeMinor, scale)}%` }}
                />
                <span
                  className={`${styles.activityBar} ${
                    point.expenseMinor > scale.ceiling ? styles.activityBarTruncated : ""
                  }`}
                  style={{ height: `${activityBarHeight(point.expenseMinor, scale)}%` }}
                />
              </span>
              <span className={styles.activityDate} aria-hidden="true">
                {point.date.slice(-2)}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.activityLegend}>
          <span>{messages.common.income}</span>
          <span>{messages.common.expense}</span>
          <span>
            {scale.isTruncated
              ? messages.dashboard.dailyChartTruncatedDescription
              : messages.dashboard.dailyChartDescription}
          </span>
        </div>
        <ul className={styles.srOnly}>
          {dashboard.data.dailySeries.map((point) => (
            <li key={point.date}>
              {messages.dashboard.dailyChartPoint(
                point.date,
                formatMoneyMinor(
                  point.incomeMinor,
                  dashboard.data.currencyCode,
                  settings.currencyExponent,
                  locale,
                ),
                formatMoneyMinor(
                  point.expenseMinor,
                  dashboard.data.currencyCode,
                  settings.currencyExponent,
                  locale,
                ),
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>{messages.dashboard.monthlyTransactions}</h2>
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
          <EmptyState title={messages.dashboard.emptyMonthTitle}>
            {messages.dashboard.emptyMonthBody}
          </EmptyState>
        )}
      </section>
    </>
  );
}
