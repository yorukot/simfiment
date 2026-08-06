import { useMemo, type ReactNode } from "react";
import type { CurrencyDefinition } from "../api/types";
import { currencyDisplayName } from "../lib/money";
import { useI18n } from "../i18n";
import { SearchSelectField } from "./ui";

export function CurrencyField({
  currencies,
  value,
  onValueChange,
  error,
  disabled,
}: {
  currencies: CurrencyDefinition[];
  value: string;
  onValueChange: (value: string) => void;
  error?: ReactNode;
  disabled?: boolean;
}) {
  const { locale, messages } = useI18n();
  const options = useMemo(
    () =>
      currencies.map((currency) => {
        const localizedName = currencyDisplayName(locale, currency.code);
        const englishName = currencyDisplayName("en", currency.code);
        return {
          value: currency.code,
          label: `${localizedName} (${currency.code})`,
          keywords: `${currency.code} ${localizedName} ${englishName}`,
        };
      }),
    [currencies, locale],
  );
  return (
    <SearchSelectField
      label={messages.currency.label}
      value={value}
      onValueChange={onValueChange}
      options={options}
      searchLabel={messages.currency.searchLabel}
      searchPlaceholder={messages.currency.searchPlaceholder}
      emptyText={messages.currency.noResults}
      supportingText={messages.currency.supportingText}
      error={error}
      disabled={disabled}
      required
    />
  );
}
