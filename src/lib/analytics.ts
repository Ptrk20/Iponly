import type { AnalyticsDateRange, AnalyticsPeriod } from "@/types/analytics";

const MAX_RANGE_DAYS = 366;

export class AnalyticsRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsRangeError";
  }
}

export function validTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "Asia/Manila";
  }
}

export function dateKeyInTimezone(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: validTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function resolveAnalyticsRange(
  period: AnalyticsPeriod,
  timezone: string,
  now = new Date(),
  customStart?: string,
  customEnd?: string,
): AnalyticsDateRange {
  const safeTimezone = validTimezone(timezone);
  const todayKey = dateKeyInTimezone(now, safeTimezone);
  const today = parseDateKey(todayKey);
  let start: Date;
  let end: Date;

  switch (period) {
    case "this-month":
      start = utcMonthStart(today);
      end = today;
      break;
    case "last-month":
      end = addUtcDays(utcMonthStart(today), -1);
      start = utcMonthStart(end);
      break;
    case "last-3-months":
      start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
      end = today;
      break;
    case "last-6-months":
      start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
      end = today;
      break;
    case "year-to-date":
    case "this-year":
      start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      end = today;
      break;
    case "custom":
      if (!customStart || !customEnd) throw new AnalyticsRangeError("Choose both a start and end date.");
      start = parseDateKey(customStart);
      end = parseDateKey(customEnd);
      break;
    default:
      throw new AnalyticsRangeError("Choose a supported analytics period.");
  }

  if (end < start) throw new AnalyticsRangeError("The start date must be on or before the end date.");
  if (calendarDaysBetween(end, start) + 1 > MAX_RANGE_DAYS) {
    throw new AnalyticsRangeError("Custom analytics ranges are limited to 366 days.");
  }

  const startDate = toDateKey(start);
  const endDate = toDateKey(end);
  return {
    startDate,
    endDate,
    startInclusive: localMidnight(startDate, safeTimezone),
    endExclusive: localMidnight(toDateKey(addUtcDays(end, 1)), safeTimezone),
    timezone: safeTimezone,
  };
}

export function getComparisonRange(range: AnalyticsDateRange): AnalyticsDateRange {
  const start = parseDateKey(range.startDate);
  const end = parseDateKey(range.endDate);
  const days = calendarDaysBetween(end, start) + 1;
  const previousEnd = addUtcDays(start, -1);
  const previousStart = addUtcDays(previousEnd, -(days - 1));
  const startDate = toDateKey(previousStart);
  const endDate = toDateKey(previousEnd);
  return {
    startDate,
    endDate,
    startInclusive: localMidnight(startDate, range.timezone),
    endExclusive: localMidnight(toDateKey(addUtcDays(previousEnd, 1)), range.timezone),
    timezone: range.timezone,
  };
}

export function percentageChange(current: number, previous: number): number | null {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous)) {
    throw new RangeError("Analytics amounts must be safe integer minor units.");
  }
  if (previous === 0) return null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

export function sumSafeMinor(values: number[]): number {
  return values.reduce((total, value) => {
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value)) {
      throw new RangeError("Analytics totals exceed the supported money range.");
    }
    return total + value;
  }, 0);
}

function parseDateKey(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new AnalyticsRangeError("Enter valid calendar dates in YYYY-MM-DD format.");
  }
  const [, yearText, monthText, dayText] = match;
  const parsed = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  if (toDateKey(parsed) !== value) throw new AnalyticsRangeError("Enter valid calendar dates in YYYY-MM-DD format.");
  return parsed;
}

function localMidnight(dateKey: string, timezone: string): Date {
  const target = parseDateKey(dateKey);
  const utcGuess = target.getTime();
  let result = utcGuess;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: validTimezone(timezone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(result));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    result += utcGuess - represented;
  }
  return new Date(result);
}

function utcMonthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcDays(value: Date, amount: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() + amount));
}

function calendarDaysBetween(later: Date, earlier: Date) {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}
