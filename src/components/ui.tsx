import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
} from "lucide-react";
import { formatMoney } from "@/lib/money";
import type {
  AccountTransaction,
  AccountTransactionType,
  BudgetAllocation,
  BudgetCategory,
  CurrencyCode,
  FinancialAccount,
} from "@/types/domain";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {action ? <div className="page-header-actions">{action}</div> : null}
    </header>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className = "",
  as: Element = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "article";
}) {
  return <Element className={`panel ${className}`}>{children}</Element>;
}

export function MoneyValue({
  amountMinor,
  currencyCode = "PHP",
  size = "regular",
  signed = false,
}: {
  amountMinor: number;
  currencyCode?: CurrencyCode;
  size?: "small" | "regular" | "large";
  signed?: boolean;
}) {
  const value = formatMoney(Math.abs(amountMinor), currencyCode);
  const prefix = signed ? (amountMinor < 0 ? "−" : "+") : "";

  return <span className={`money-value money-${size}`}>{prefix}{value}</span>;
}

export function MetricCard({
  label,
  amountMinor,
  currencyCode,
  supporting,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  amountMinor: number;
  currencyCode: CurrencyCode;
  supporting: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  tone?: "green" | "blue" | "amber" | "rose";
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        <span aria-hidden="true" className="metric-icon"><Icon size={18} strokeWidth={1.8} /></span>
      </div>
      <MoneyValue amountMinor={amountMinor} currencyCode={currencyCode} size="large" />
      <p className="metric-supporting">{supporting}</p>
    </article>
  );
}

export function ProgressBar({
  label,
  value,
  max,
  displayValue,
  tone = "green",
}: {
  label: string;
  value: number;
  max: number;
  displayValue: string;
  tone?: "green" | "blue" | "amber";
}) {
  const percentage = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className={`progress-block progress-${tone}`}>
      <div className="progress-label-row">
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </div>
      <div
        aria-label={`${label}: ${displayValue}`}
        aria-valuemax={max}
        aria-valuemin={0}
        aria-valuenow={Math.max(0, Math.min(value, max))}
        className="progress-track"
        role="progressbar"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-state-mark">+</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function AccountRow({ account }: { account: FinancialAccount }) {
  const initials = account.institution.slice(0, 1).toUpperCase();

  return (
    <div className="account-row">
      <span aria-hidden="true" className="account-institution-mark">{initials}</span>
      <span className="account-row-copy">
        <strong>{account.name}</strong>
        <span>{account.institution}</span>
      </span>
      <MoneyValue amountMinor={account.balanceMinor} currencyCode={account.currencyCode} size="small" />
    </div>
  );
}

const transactionIcons: Record<AccountTransactionType, typeof ArrowDownLeft> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  savings: PiggyBank,
  "debt-payment": CreditCard,
  adjustment: ArrowLeftRight,
  transfer: ArrowLeftRight,
};

export function TransactionRow({ transaction }: { transaction: AccountTransaction }) {
  const Icon = transactionIcons[transaction.type];
  const isIncome = transaction.type === "income";
  const isNeutral = transaction.type === "transfer" || transaction.type === "adjustment";
  const sign = isIncome ? "+" : isNeutral ? "" : "−";

  return (
    <div className="transaction-row">
      <span className={`transaction-icon transaction-${transaction.type}`}>
        <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
      </span>
      <span className="transaction-copy">
        <strong>{transaction.description}</strong>
        <span>{new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(transaction.occurredAt))}</span>
      </span>
      <span className={`transaction-amount ${isIncome ? "amount-positive" : ""}`}>
        {sign}<MoneyValue amountMinor={transaction.amountMinor} currencyCode={transaction.currencyCode} size="small" />
      </span>
    </div>
  );
}

export function BudgetCategoryRow({
  category,
  allocation,
}: {
  category: BudgetCategory;
  allocation: BudgetAllocation;
}) {
  const remaining = allocation.plannedMinor - allocation.spentMinor;
  const percent = allocation.plannedMinor > 0
    ? Math.min(100, (allocation.spentMinor / allocation.plannedMinor) * 100)
    : 0;

  return (
    <div className="category-row" style={{ "--category-color": category.color } as CSSProperties}>
      <span aria-hidden="true" className="category-dot" />
      <div className="category-row-main">
        <div className="category-row-heading">
          <strong>{category.name}</strong>
          <span>
            <MoneyValue amountMinor={allocation.spentMinor} currencyCode={allocation.currencyCode} size="small" />
            <span className="category-total"> of </span>
            <MoneyValue amountMinor={allocation.plannedMinor} currencyCode={allocation.currencyCode} size="small" />
          </span>
        </div>
        <div aria-label={`${category.name}: ${Math.round(percent)}% used`} className="category-track" role="img">
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
      <MoneyValue amountMinor={remaining} currencyCode={allocation.currencyCode} size="small" />
    </div>
  );
}