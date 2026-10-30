import { format, parseISO } from "date-fns";

export function formatDate(value: string, pattern = "MMM d, yyyy"): string {
  return format(parseISO(value), pattern);
}

export function formatMonth(value: string, pattern = "MMMM yyyy"): string {
  return format(parseISO(`${value}-01`), pattern);
}