"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, minorToMajor } from "@/lib/money";
import type { CurrencyCode } from "@/types/domain";

export interface ChartDatum {
  name: string;
  value: number;
  color: string;
}

export interface TrendDatum {
  month: string;
  [key: string]: string | number;
}

export function SpendingDonutChart({
  data,
  currencyCode = "PHP",
  label = "Spending by category",
  totalLabel = "Spent",
  emptyMessage = "No spending to show yet.",
}: {
  data: ChartDatum[];
  currencyCode?: CurrencyCode;
  label?: string;
  totalLabel?: string;
  emptyMessage?: string;
}) {
  const visibleData = data.filter((item) => item.value > 0);

  if (visibleData.length === 0) {
    return <div className="chart-empty">{emptyMessage}</div>;
  }

  const totalMinor = visibleData.reduce((total, item) => total + item.value, 0);
  const accessibleSummary = visibleData
    .map((item) => `${item.name}: ${formatMoney(item.value, currencyCode)}`)
    .join(". ");
  return (
    <div className="donut-chart-layout">
      <div
        aria-label={`${label}. ${accessibleSummary}. Total: ${formatMoney(totalMinor, currencyCode)}.`}
        className="donut-chart-visual"
        role="img"
      >
        <ResponsiveContainer height={220} width="100%">
          <PieChart>
            <Pie
              data={visibleData}
              dataKey="value"
              innerRadius="66%"
              outerRadius="88%"
              paddingAngle={3}
              stroke="none"
            >
              {visibleData.map((entry) => <Cell fill={entry.color} key={entry.name} />)}
            </Pie>
            <Tooltip formatter={(value) => formatMoney(Number(value), currencyCode)} />
          </PieChart>
        </ResponsiveContainer>
        <div aria-hidden="true" className="donut-center">
          <span>{totalLabel}</span>
          <strong>{formatMoney(totalMinor, currencyCode)}</strong>
        </div>
      </div>
      <ul className="chart-legend">
        {visibleData.map((item) => (
          <li key={item.name}>
            <span aria-hidden="true" className="legend-dot" style={{ backgroundColor: item.color }} />
            <span>{item.name}</span>
            <strong>{formatMoney(item.value, currencyCode)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendLineChart({
  data,
  series,
  currencyCode = "PHP",
}: {
  data: TrendDatum[];
  series: { key: string; label: string; color: string }[];
  currencyCode?: CurrencyCode;
}) {
  if (data.length === 0) return <div className="chart-empty">Not enough history to show a trend.</div>;

  const accessibleSummary = data
    .map((point) => `${point.month}: ${series.map((item) => `${item.label} ${formatMoney(Number(point[item.key] ?? 0), currencyCode)}`).join(", ")}`)
    .join(". ");
  return (
    <div aria-label={`Trend chart. ${accessibleSummary}`} className="trend-chart" role="img">
      <ResponsiveContainer height={250} width="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
          <XAxis axisLine={false} dataKey="month" tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value: number) => formatAxisValue(value, currencyCode)} />
          {series.map((item) => (
            <Line
              activeDot={{ r: 4, strokeWidth: 0 }}
              dataKey={item.key}
              dot={false}
              key={item.key}
              name={item.label}
              stroke={item.color}
              strokeWidth={2.5}
              type="monotone"
            />
          ))}
          <Tooltip formatter={(value) => formatMoney(Number(value), currencyCode)} />
        </LineChart>
      </ResponsiveContainer>
      <div className="chart-series-key">
        {series.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
    </div>
  );
}

export function ComparisonBarChart({
  data,
  series,
  currencyCode = "PHP",
}: {
  data: TrendDatum[];
  series: { key: string; label: string; color: string }[];
  currencyCode?: CurrencyCode;
}) {
  if (data.length === 0) return <div className="chart-empty">No monthly comparison to show.</div>;

  const accessibleSummary = data
    .map((point) => `${point.month}: ${series.map((item) => `${item.label} ${formatMoney(Number(point[item.key] ?? 0), currencyCode)}`).join(", ")}`)
    .join(". ");
  return (
    <div aria-label={`Comparison chart. ${accessibleSummary}`} className="trend-chart" role="img">
      <ResponsiveContainer height={250} width="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 5" vertical={false} />
          <XAxis axisLine={false} dataKey="month" tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(value: number) => formatAxisValue(value, currencyCode)} />
          <Tooltip formatter={(value) => formatMoney(Number(value), currencyCode)} />
          {series.map((item) => (
            <Bar dataKey={item.key} fill={item.color} key={item.key} name={item.label} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="chart-series-key">
        {series.map((item) => <span key={item.key}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}
      </div>
    </div>
  );
}

function formatAxisValue(value: number, currencyCode: CurrencyCode = "PHP"): string {
  const major = minorToMajor(value, currencyCode);
  return Math.abs(major) >= 1000 ? `${Math.round(major / 1000)}k` : String(Math.round(major));
}