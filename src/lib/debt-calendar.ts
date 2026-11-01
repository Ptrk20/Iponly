import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export function getDebtCalendarDays(month: string, firstDayOfWeek: "monday" | "sunday") {
  const date = parseISO(`${month}-01`);
  if (!/^\d{4}-\d{2}$/.test(month) || !isValid(date)) {
    throw new RangeError("Enter a valid calendar month.");
  }
  const weekStartsOn = firstDayOfWeek === "monday" ? 1 : 0;
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(date), { weekStartsOn }),
    end: endOfWeek(endOfMonth(date), { weekStartsOn }),
  }).map((day) => ({
    date: format(day, "yyyy-MM-dd"),
    day: day.getDate(),
    inMonth: format(day, "yyyy-MM") === month,
  }));
}
