import type { CurrencyCode } from "@/types/domain";

export interface MoneyAmount {
  amountMinor: number;
  currencyCode: CurrencyCode;
}

const minorUnitDigits: Record<CurrencyCode, number> = {
  PHP: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
};

function assertMinorUnits(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Money amounts must be safe integer minor units.");
  }
}

function parseToMinor(input: string, currencyCode: CurrencyCode): number | null {
  const cleaned = input.trim().replace(/[₱$€¥\s]/g, "");
  const match = cleaned.match(/^([+-]?)(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d*))?$/);

  if (!match) return null;

  const [, sign, groupedWhole, fraction = ""] = match;
  const digits = minorUnitDigits[currencyCode];

  if (fraction.length > digits && /[^0]/.test(fraction.slice(digits))) {
    return null;
  }

  const whole = Number(groupedWhole.replaceAll(",", ""));
  const fractionalMinor = Number(fraction.slice(0, digits).padEnd(digits, "0") || "0");
  const amountMinor = whole * 10 ** digits + fractionalMinor;

  if (!Number.isSafeInteger(amountMinor)) return null;
  return sign === "-" ? -amountMinor : amountMinor;
}

export function majorToMinor(
  amountMajor: number | string,
  currencyCode: CurrencyCode = "PHP",
): number {
  const amountMinor = parseToMinor(String(amountMajor), currencyCode);
  if (amountMinor === null) {
    throw new RangeError(`Invalid ${currencyCode} amount: ${String(amountMajor)}`);
  }
  return amountMinor;
}

export function minorToMajor(
  amountMinor: number,
  currencyCode: CurrencyCode = "PHP",
): number {
  assertMinorUnits(amountMinor);
  return amountMinor / 10 ** minorUnitDigits[currencyCode];
}

export function parseMoneyInput(
  input: string,
  currencyCode: CurrencyCode = "PHP",
): number | null {
  return parseToMinor(input, currencyCode);
}

export function formatMoney(
  amountMinor: number,
  currencyCode: CurrencyCode = "PHP",
  locale = "en-PH",
): string {
  const digits = minorUnitDigits[currencyCode];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minorToMajor(amountMinor, currencyCode));
}

export function addMoney(left: MoneyAmount, right: MoneyAmount): MoneyAmount {
  if (left.currencyCode !== right.currencyCode) {
    throw new TypeError("Cannot add money with different currencies.");
  }

  const amountMinor = left.amountMinor + right.amountMinor;
  assertMinorUnits(amountMinor);
  return { amountMinor, currencyCode: left.currencyCode };
}

export function subtractMoney(left: MoneyAmount, right: MoneyAmount): MoneyAmount {
  if (left.currencyCode !== right.currencyCode) {
    throw new TypeError("Cannot subtract money with different currencies.");
  }

  const amountMinor = left.amountMinor - right.amountMinor;
  assertMinorUnits(amountMinor);
  return { amountMinor, currencyCode: left.currencyCode };
}

export function calculatePercentage(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total)) {
    throw new RangeError("Percentage values must be finite numbers.");
  }
  if (total === 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}