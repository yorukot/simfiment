export type Kind = "expense" | "income";

export type Settings = {
  initializedAt?: string;
  currencyCode: string;
  currencyExponent: number;
  timezone: string;
  locale: string;
  theme: "system" | "light" | "dark";
  automaticLocationEnabled: boolean;
};

export type CurrencyDefinition = {
  code: string;
  exponent: number;
};

export type Meta = {
  name: string;
  version: string;
  initialized: boolean;
  defaultLocale: string;
  currencies: CurrencyDefinition[];
};

export type Session = {
  authenticated: true;
  expiresAt: string;
  csrfToken: string;
  settings: Settings;
};

export type OperationsStatus = {
  databaseHealthy: boolean;
};

export type Category = {
  id: number;
  kind: Kind;
  name: string;
  iconKey: string;
  sortOrder: number;
  archivedAt?: string;
};

export type EntryLocation = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  capturedAt: string;
};

export type LocationStatus = "none" | "pending" | "attached" | "failed" | "skipped";

export type Transaction = {
  settlement?: Settlement;
  id: number;
  clientRequestId?: string;
  kind: Kind;
  amountMinor: number;
  currencyCode: string;
  category: Category;
  title: string;
  occurredAt: string;
  occurredLocalDate: string;
  source: "manual" | "recurring";
  recurringOccurrenceId?: number;
  locationStatus: LocationStatus;
  location?: EntryLocation;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Totals = {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  transactionCount: number;
};

export type CategoryTotal = {
  categoryId: number;
  name: string;
  iconKey: string;
  amountMinor: number;
  transactionCount: number;
};

export type DailyDashboard = {
  date: string;
  currencyCode: string;
  totals: Totals;
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
};

export type MonthlyDashboard = {
  month: string;
  currencyCode: string;
  totals: Totals;
  expenseCategories: CategoryTotal[];
  incomeCategories: CategoryTotal[];
  dailySeries: Array<{
    date: string;
    incomeMinor: number;
    expenseMinor: number;
    netMinor: number;
  }>;
};

export type RecurringRule = {
  id: number;
  kind: Kind;
  amountMinor: number;
  currencyCode: string;
  category: Category;
  title: string;
  frequency: "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startOn: string;
  nextDueOn: string;
  enabled: boolean;
  archivedAt?: string;
};

export type RecurringOccurrence = {
  id: number;
  ruleId: number;
  scheduledOn: string;
  status: "pending" | "confirmed" | "skipped";
  kind: Kind;
  amountMinor: number;
  currencyCode: string;
  category: Category;
  title: string;
};

export type RecurringPreview = {
  ruleId: number;
  scheduledOn: string;
  kind: Kind;
  amountMinor: number;
  currencyCode: string;
  category: Category;
  title: string;
};

export type FieldErrors = Record<string, string>;

export type SettlementInput = { counterparty: string; dueOn?: string };
export type Settlement = SettlementInput & {
  status: "pending" | "completed";
  completedAt?: string;
};
export type BudgetLimit = { categoryId: number; amountMinor: number };
export type BudgetDay = {
  date: string;
  allocationMinor: number;
  expenseMinor: number;
  availableMinor: number;
};
export type BudgetSummary = BudgetLimit & {
  expenseMinor: number;
  remainingMinor: number;
  days: BudgetDay[];
};
export type MonthlyBudgets = {
  month: string;
  effectiveMonth?: string;
  currencyCode: string;
  items: BudgetSummary[];
};
