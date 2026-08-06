import type { SupportedLocale } from "../i18n";

export const MAX_AMOUNT_MINOR = 9_000_000_000_000;

function scaleFor(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

export function majorToMinor(value: string, exponent: number): number | undefined {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d*))?$/.exec(normalized);
  if (!match) return undefined;
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) return undefined;
  const whole = BigInt(match[1] ?? "0");
  const minor = whole * scaleFor(exponent) + BigInt(fraction.padEnd(exponent, "0") || "0");
  if (minor < 1n || minor > BigInt(MAX_AMOUNT_MINOR)) return undefined;
  return Number(minor);
}

export function minorToMajorInput(amountMinor: number, exponent: number): string {
  const sign = amountMinor < 0 ? "-" : "";
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, "0");
  if (exponent === 0) return `${sign}${digits}`;
  const split = digits.length - exponent;
  return `${sign}${digits.slice(0, split)}.${digits.slice(split)}`;
}

export function currencySymbol(locale: SupportedLocale, currency: string): string {
  if (currency === "TWD") return "NT$";
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
  }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currency;
}

export function currencyDisplayName(locale: SupportedLocale, currency: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: string,
  exponent: number,
  locale: SupportedLocale,
): string {
  const major = amountMinor / 10 ** exponent;
  if (currency === "TWD") {
    return `NT$ ${new Intl.NumberFormat(locale, {
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(major)}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(major);
}

export function moneyInputBounds(exponent: number) {
  const scale = 10 ** exponent;
  return {
    min: 1 / scale,
    max: MAX_AMOUNT_MINOR / scale,
    step: 1 / scale,
  };
}
