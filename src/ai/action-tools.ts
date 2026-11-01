import { tool } from "ai";
import { z } from "zod";
import { getBalanceForAccount, findAccountsForUser } from "@/repositories/account-repository";
import {
  findAllocationsForBudgetAndUser,
  findBudgetForMonthForUser,
  findCategoriesForUser,
  findExpensesForBudgetAndUser,
} from "@/repositories/budget-repository";
import { findDebtsForUser } from "@/repositories/debt-repository";
import { findTripsForUser } from "@/repositories/travel-repository";
import { getDebtDetails } from "@/services/debt-service";
import { createAIActionProposal, AIActionError, type AIActionProposalDTO } from "@/services/ai-action-service";
import { getDatabase, type IponlyDatabase } from "@/db";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import type { CurrencyCode } from "@/types/domain";

const currencySchema = z.enum(["PHP", "USD", "EUR", "JPY"]);
const nameSchema = z.string().trim().min(1).max(100);
const amountSchema = z.string().trim().min(1).max(30);
const optionalDateSchema = z.iso.date().optional();
const notesSchema = z.string().trim().max(1000).optional();
const expenseCategories = ["flights", "accommodation", "local_transportation", "food", "activities", "shopping", "insurance", "visa", "connectivity", "emergency", "other"] as const;
const itineraryCategories = ["flight", "accommodation", "transport", "food", "activity", "sightseeing", "shopping", "free_time", "other"] as const;

export interface AIActionPreparationContext {
  userId: string;
  timezone: string;
  defaultCurrencyCode: CurrencyCode;
  originalMessage: string;
  database?: IponlyDatabase;
  onPrepared: (proposal: AIActionProposalDTO) => void;
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function resolveUnique<T>(items: T[], query: string, label: string, getName: (item: T) => string) {
  const normalizedQuery = normalizedName(query);
  const exact = items.filter((item) => normalizedName(getName(item)) === normalizedQuery);
  const matches = exact.length ? exact : items.filter((item) => normalizedName(getName(item)).includes(normalizedQuery));
  if (matches.length === 0) return { ok: false as const, message: `I couldn’t find an active ${label} matching “${query}”.` };
  if (matches.length > 1) {
    return { ok: false as const, message: `I found multiple ${label} matches: ${matches.slice(0, 5).map(getName).join(", ")}. Please specify one.` };
  }
  return { ok: true as const, value: matches[0]! };
}

function dateInTimezone(timezone: string, relativeDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((value) => value.type === type)?.value;
  const [year, month, day] = [part("year"), part("month"), part("day")];
  if (!year || !month || !day) throw new Error("The current date could not be resolved in the user's timezone.");
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + relativeDays));
  return date.toISOString().slice(0, 10);
}

function resolveDate(requested: string | undefined, prompt: string, timezone: string) {
  const promptDate = prompt.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (promptDate) return promptDate;
  const normalizedPrompt = prompt.toLocaleLowerCase();
  if (/\btoday\b/.test(normalizedPrompt)) return dateInTimezone(timezone);
  if (/\byesterday\b/.test(normalizedPrompt)) return dateInTimezone(timezone, -1);
  if (/\b(?:tomorrow|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2})\b/.test(normalizedPrompt)) {
    return { error: "Please provide the date as YYYY-MM-DD so I can confirm the exact date." } as const;
  }
  return dateInTimezone(timezone);
}

function currencyMentioned(prompt: string): CurrencyCode | null {
  if (/\bPHP\b|₱/i.test(prompt)) return "PHP";
  if (/\bUSD\b|\$/i.test(prompt)) return "USD";
  if (/\bEUR\b|€/i.test(prompt)) return "EUR";
  if (/\bJPY\b|¥/i.test(prompt)) return "JPY";
  return null;
}

function resolveCurrency(targetCurrency: CurrencyCode, requested?: CurrencyCode, prompt = "") {
  const fromPrompt = currencyMentioned(prompt);
  if ((requested && requested !== targetCurrency) || (fromPrompt && fromPrompt !== targetCurrency)) {
    return { error: `This record uses ${targetCurrency}. I can’t convert currencies or reinterpret the amount.` } as const;
  }
  return { currencyCode: targetCurrency } as const;
}

function amountInMinor(amount: string, currencyCode: CurrencyCode) {
  const amountMinor = parseMoneyInput(amount, currencyCode);
  if (amountMinor === null || amountMinor <= 0) {
    return { error: `Enter a positive amount in ${currencyCode} with valid precision.` } as const;
  }
  return { amountMinor } as const;
}

function displayAmount(amountMinor: number, currencyCode: CurrencyCode) {
  return `${formatMoney(amountMinor, currencyCode)} ${currencyCode}`;
}

function dayInBudgetTimezone(date: string) {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

function incomeTypeFor(message: string): "salary" | "bonus" | "freelance" | "allowance" | "reimbursement" | "business" | "interest" | "gift" | "other" {
  const normalized = message.toLocaleLowerCase();
  if (/\bsalary\b|\bpaycheck\b/.test(normalized)) return "salary";
  if (/\bbonus\b/.test(normalized)) return "bonus";
  if (/\bfreelance\b/.test(normalized)) return "freelance";
  if (/\ballowance\b/.test(normalized)) return "allowance";
  if (/\breimbursement\b/.test(normalized)) return "reimbursement";
  if (/\binterest\b/.test(normalized)) return "interest";
  if (/\bgift\b/.test(normalized)) return "gift";
  if (/\bbusiness\b/.test(normalized)) return "business";
  return "other";
}

function incomeReceiptIntent(message: string) {
  const normalized = message.toLocaleLowerCase();
  const received = /\b(?:received|got paid|deposited|already paid|was paid)\b/.test(normalized);
  const planned = /\b(?:planned|expect(?:ed)?|will receive|will get|upcoming)\b/.test(normalized);
  if (received === planned) return null;
  return received ? "received" : "planned";
}

export function createActionPreparationTools(context: AIActionPreparationContext) {
  const database = context.database ?? getDatabase();
  let proposalCreated = false;
  let proposalInProgress = false;
  async function saveProposal(
    actionType: Parameters<typeof createAIActionProposal>[1],
    payload: Parameters<typeof createAIActionProposal>[2],
    display: Parameters<typeof createAIActionProposal>[3],
  ) {
    if (proposalCreated || proposalInProgress) {
      return { status: "clarification", message: "Prepare one action at a time so each confirmation is clear." };
    }
    proposalInProgress = true;
    try {
      const proposal = await createAIActionProposal(context.userId, actionType, payload, display, database);
      proposalCreated = true;
      context.onPrepared(proposal);
      return { status: "proposal-ready", action: display.summary };
    } catch (error) {
      if (error instanceof AIActionError) return { status: "clarification", message: error.message };
      throw error;
    } finally {
      proposalInProgress = false;
    }
  }

  async function prepareSavingsTransaction(
    actionType: "savings_deposit" | "savings_withdrawal",
    accountName: string,
    amount: string,
    requestedCurrency: CurrencyCode | undefined,
    requestedDate: string | undefined,
    description: string | undefined,
    notes: string | undefined,
  ) {
    const accounts = await findAccountsForUser(context.userId, { database });
    const resolved = resolveUnique(accounts, accountName, "active Savings account", (account) => account.name);
    if (!resolved.ok) return { status: "clarification", message: resolved.message };
    const account = resolved.value;
    const currency = resolveCurrency(account.currencyCode, requestedCurrency, context.originalMessage);
    if ("error" in currency) return { status: "clarification", message: currency.error };
    const parsedAmount = amountInMinor(amount, currency.currencyCode);
    if ("error" in parsedAmount) return { status: "clarification", message: parsedAmount.error };
    const resolvedDate = resolveDate(requestedDate, context.originalMessage, context.timezone);
    if (typeof resolvedDate !== "string") return { status: "clarification", message: resolvedDate.error };
    const currentBalance = await getBalanceForAccount(account.id, context.userId, database);
    if (actionType === "savings_withdrawal" && parsedAmount.amountMinor > currentBalance) {
      return { status: "clarification", message: "The requested withdrawal is greater than the current available balance." };
    }
    const title = actionType === "savings_deposit" ? "Savings deposit" : "Savings withdrawal";
    const descriptionValue = description?.trim() || (actionType === "savings_deposit" ? "AI-prepared deposit" : "AI-prepared withdrawal");
    const expectedBalance = actionType === "savings_deposit"
      ? currentBalance + parsedAmount.amountMinor
      : currentBalance - parsedAmount.amountMinor;
    const display = {
      title,
      summary: `${displayAmount(parsedAmount.amountMinor, currency.currencyCode)} ${actionType === "savings_deposit" ? "to" : "from"} ${account.name}`,
      details: [
        { label: "Account", value: account.name },
        { label: "Action", value: actionType === "savings_deposit" ? "Deposit" : "Withdrawal" },
        { label: "Amount", value: displayAmount(parsedAmount.amountMinor, currency.currencyCode) },
        { label: "Date", value: resolvedDate },
        { label: "Balance before", value: displayAmount(currentBalance, currency.currencyCode) },
        { label: "Expected balance after", value: displayAmount(expectedBalance, currency.currencyCode) },
        { label: "Description", value: descriptionValue },
      ],
      href: "/savings" as const,
      confirmLabel: actionType === "savings_deposit" ? "Confirm deposit" : "Confirm withdrawal",
    };
    const payload = {
      accountId: account.id,
      amountMinor: parsedAmount.amountMinor,
      currencyCode: currency.currencyCode,
      transactionDate: resolvedDate,
      description: descriptionValue,
      ...(notes ? { notes } : {}),
    };
    return saveProposal(actionType, payload, display);
  }

  return {
    prepareSavingsDeposit: tool({
      description: "Prepare, but never execute, a savings deposit. This only creates a confirmation proposal. Resolve the user's owned active account by name and ask for clarification if ambiguous.",
      inputSchema: z.object({
        accountName: nameSchema,
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        transactionDate: optionalDateSchema,
        description: z.string().trim().max(120).optional(),
        notes: notesSchema,
      }).strict(),
      execute: (input) => prepareSavingsTransaction("savings_deposit", input.accountName, input.amount, input.currencyCode, input.transactionDate, input.description, input.notes),
    }),

    prepareSavingsWithdrawal: tool({
      description: "Prepare, but never execute, a savings withdrawal. The withdrawal will be checked against the current balance again after explicit confirmation.",
      inputSchema: z.object({
        accountName: nameSchema,
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        transactionDate: optionalDateSchema,
        description: z.string().trim().max(120).optional(),
        notes: notesSchema,
      }).strict(),
      execute: (input) => prepareSavingsTransaction("savings_withdrawal", input.accountName, input.amount, input.currencyCode, input.transactionDate, input.description, input.notes),
    }),

    prepareAccountTransfer: tool({
      description: "Prepare, but never execute, a transfer between two of the user's own active Savings accounts. Both must have the same currency.",
      inputSchema: z.object({
        sourceAccountName: nameSchema,
        destinationAccountName: nameSchema,
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        transactionDate: optionalDateSchema,
        description: z.string().trim().max(120).optional(),
      }).strict(),
      execute: async (input) => {
        const accounts = await findAccountsForUser(context.userId, { database });
        const source = resolveUnique(accounts, input.sourceAccountName, "source account", (account) => account.name);
        const destination = resolveUnique(accounts, input.destinationAccountName, "destination account", (account) => account.name);
        if (!source.ok) return { status: "clarification", message: source.message };
        if (!destination.ok) return { status: "clarification", message: destination.message };
        if (source.value.id === destination.value.id) return { status: "clarification", message: "Choose two different Savings accounts." };
        if (source.value.currencyCode !== destination.value.currencyCode) return { status: "clarification", message: "Transfers between different currencies are not supported." };
        const currency = resolveCurrency(source.value.currencyCode, input.currencyCode, context.originalMessage);
        if ("error" in currency) return { status: "clarification", message: currency.error };
        const parsedAmount = amountInMinor(input.amount, currency.currencyCode);
        if ("error" in parsedAmount) return { status: "clarification", message: parsedAmount.error };
        const date = resolveDate(input.transactionDate, context.originalMessage, context.timezone);
        if (typeof date !== "string") return { status: "clarification", message: date.error };
        const sourceBalance = await getBalanceForAccount(source.value.id, context.userId, database);
        const destinationBalance = await getBalanceForAccount(destination.value.id, context.userId, database);
        if (parsedAmount.amountMinor > sourceBalance) return { status: "clarification", message: "The requested transfer is greater than the source account's current balance." };
        const description = input.description?.trim() || `Transfer to ${destination.value.name}`;
        const display = {
          title: "Savings transfer",
          summary: `${displayAmount(parsedAmount.amountMinor, currency.currencyCode)} from ${source.value.name} to ${destination.value.name}`,
          details: [
            { label: "From", value: source.value.name },
            { label: "To", value: destination.value.name },
            { label: "Amount", value: displayAmount(parsedAmount.amountMinor, currency.currencyCode) },
            { label: "Date", value: date },
            { label: "Source balance after", value: displayAmount(sourceBalance - parsedAmount.amountMinor, currency.currencyCode) },
            { label: "Destination balance after", value: displayAmount(destinationBalance + parsedAmount.amountMinor, currency.currencyCode) },
          ],
          href: "/savings" as const,
          confirmLabel: "Confirm transfer",
        };
        return saveProposal("account_transfer", {
          sourceAccountId: source.value.id,
          destinationAccountId: destination.value.id,
          amountMinor: parsedAmount.amountMinor,
          currencyCode: currency.currencyCode,
          transactionDate: date,
          description,
        }, display);
      },
    }),

    prepareBudgetExpense: tool({
      description: "Prepare an expense in the current or explicitly dated monthly Budget. Never create a Budget or execute an expense. Resolve a category, and optionally a matching-currency account.",
      inputSchema: z.object({
        categoryName: nameSchema,
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        transactionDate: optionalDateSchema,
        description: z.string().trim().max(120).optional(),
        paymentAccountName: nameSchema.optional(),
      }).strict(),
      execute: async (input) => {
        const date = resolveDate(input.transactionDate, context.originalMessage, context.timezone);
        if (typeof date !== "string") return { status: "clarification", message: date.error };
        const { year, month } = dayInBudgetTimezone(date);
        const mentionedCurrency = currencyMentioned(context.originalMessage) ?? context.defaultCurrencyCode;
        const currencyCode = input.currencyCode ?? mentionedCurrency;
        if (input.currencyCode && currencyMentioned(context.originalMessage) && input.currencyCode !== currencyMentioned(context.originalMessage)) {
          return { status: "clarification", message: "The currency in your request does not match the proposed currency. Please clarify the amount currency." };
        }
        const budget = await findBudgetForMonthForUser(context.userId, year, month, currencyCode, database);
        if (!budget || budget.status !== "active") return { status: "clarification", message: "There is no active Monthly Budget for that month and currency. Create or reopen one on the Budget page first." };
        const categories = await findCategoriesForUser(context.userId, true, database);
        const categoryResult = resolveUnique(
          categories.filter((category) => category.categoryType === "expense" || category.categoryType === "other"),
          input.categoryName,
          "active Budget category",
          (category) => category.name,
        );
        if (!categoryResult.ok) return { status: "clarification", message: categoryResult.message };
        const amount = amountInMinor(input.amount, currencyCode);
        if ("error" in amount) return { status: "clarification", message: amount.error };
        let paymentAccountId: string | undefined;
        let accountDetail: { label: string; value: string } | undefined;
        if (input.paymentAccountName) {
          const accounts = await findAccountsForUser(context.userId, { database });
          const account = resolveUnique(accounts, input.paymentAccountName, "active Savings account", (item) => item.name);
          if (!account.ok) return { status: "clarification", message: account.message };
          if (account.value.currencyCode !== currencyCode) return { status: "clarification", message: "The payment account currency must match the Budget currency." };
          const balance = await getBalanceForAccount(account.value.id, context.userId, database);
          if (amount.amountMinor > balance) return { status: "clarification", message: "The expense exceeds the current available account balance." };
          paymentAccountId = account.value.id;
          accountDetail = { label: "Payment account", value: `${account.value.name} (expected after: ${displayAmount(balance - amount.amountMinor, currencyCode)})` };
        }
        const [allocations, expenses] = await Promise.all([
          findAllocationsForBudgetAndUser(budget.id, context.userId, database),
          findExpensesForBudgetAndUser(budget.id, context.userId, database),
        ]);
        const allocation = allocations.find(({ category }) => category.id === categoryResult.value.id)?.allocation.plannedAmountMinor ?? 0;
        const spent = expenses.filter(({ expense }) => expense.categoryId === categoryResult.value.id && expense.status === "posted")
          .reduce((total, { expense }) => total + expense.amountMinor, 0);
        const plannedAfter = allocation - spent - amount.amountMinor;
        const description = input.description?.trim() || input.categoryName;
        const details = [
          { label: "Budget", value: budget.name },
          { label: "Category", value: categoryResult.value.name },
          { label: "Amount", value: displayAmount(amount.amountMinor, currencyCode) },
          { label: "Date", value: date },
          { label: "Category remaining after", value: displayAmount(plannedAfter, currencyCode) },
          ...(accountDetail ? [accountDetail] : []),
        ];
        return saveProposal("budget_expense", {
          budgetId: budget.id,
          categoryId: categoryResult.value.id,
          amountMinor: amount.amountMinor,
          currencyCode,
          transactionDate: date,
          description,
          ...(paymentAccountId ? { paymentAccountId } : {}),
        }, {
          title: "Budget expense",
          summary: `${displayAmount(amount.amountMinor, currencyCode)} for ${categoryResult.value.name}`,
          details,
          href: "/budget",
          confirmLabel: "Confirm expense",
        });
      },
    }),

    prepareBudgetIncome: tool({
      description: "Prepare planned or received income for the current or explicitly dated monthly Budget. If the user's wording does not make received-versus-planned clear, ask a clarifying question instead of proposing.",
      inputSchema: z.object({
        name: nameSchema,
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        expectedDate: optionalDateSchema,
        receivedDate: optionalDateSchema,
      }).strict(),
      execute: async (input) => {
        const intent = incomeReceiptIntent(context.originalMessage);
        if (!intent) return { status: "clarification", message: "Should I add this as planned income or income already received?" };
        const date = resolveDate(intent === "received" ? input.receivedDate : input.expectedDate, context.originalMessage, context.timezone);
        if (typeof date !== "string") return { status: "clarification", message: date.error };
        const { year, month } = dayInBudgetTimezone(date);
        const currencyCode = input.currencyCode ?? currencyMentioned(context.originalMessage) ?? context.defaultCurrencyCode;
        if (input.currencyCode && currencyMentioned(context.originalMessage) && input.currencyCode !== currencyMentioned(context.originalMessage)) {
          return { status: "clarification", message: "The currency in your request does not match the proposed currency. Please clarify." };
        }
        const budget = await findBudgetForMonthForUser(context.userId, year, month, currencyCode, database);
        if (!budget || budget.status !== "active") return { status: "clarification", message: "There is no active Monthly Budget for that month and currency. Create or reopen one on the Budget page first." };
        const amount = amountInMinor(input.amount, currencyCode);
        if ("error" in amount) return { status: "clarification", message: amount.error };
        const payload = {
          budgetId: budget.id,
          amountMinor: amount.amountMinor,
          currencyCode,
          name: input.name,
          incomeType: incomeTypeFor(context.originalMessage),
          ...(intent === "received" ? { receivedDate: date } : { expectedDate: date }),
        };
        return saveProposal("budget_income", payload, {
          title: intent === "received" ? "Received budget income" : "Planned budget income",
          summary: `${displayAmount(amount.amountMinor, currencyCode)} ${intent === "received" ? "received" : "planned"} as ${input.name}`,
          details: [
            { label: "Budget", value: budget.name },
            { label: "Income type", value: payload.incomeType },
            { label: "Status", value: intent === "received" ? "Received" : "Planned" },
            { label: "Amount", value: displayAmount(amount.amountMinor, currencyCode) },
            { label: intent === "received" ? "Received date" : "Expected date", value: date },
          ],
          href: "/budget",
          confirmLabel: "Confirm income",
        });
      },
    }),

    prepareDebtPayment: tool({
      description: "Prepare a full or explicitly partial payment for one active debt installment. Never waive a balance. Resolve an active debt and an eligible installment; ask if multiple installments match.",
      inputSchema: z.object({
        debtName: nameSchema,
        installmentNumber: z.number().int().positive().optional(),
        amount: amountSchema.optional(),
        currencyCode: currencySchema.optional(),
        paymentDate: optionalDateSchema,
        sourceAccountName: nameSchema.optional(),
      }).strict(),
      execute: async (input) => {
        const debts = await findDebtsForUser(context.userId, { database });
        const debtResult = resolveUnique(debts.filter((debt) => debt.status === "active"), input.debtName, "active debt", (debt) => debt.name);
        if (!debtResult.ok) return { status: "clarification", message: debtResult.message };
        const detail = await getDebtDetails(context.userId, debtResult.value.id, { database, timezone: context.timezone });
        if (!detail) return { status: "clarification", message: "That debt is no longer available." };
        let installments = detail.installments.filter((item) =>
          ["scheduled", "partially_paid", "overdue"].includes(item.status) && item.remainingAmountMinor > 0,
        );
        if (input.installmentNumber !== undefined) {
          installments = installments.filter((item) => item.installmentNumber === input.installmentNumber);
        } else {
          const matched = context.originalMessage.match(/\b(?:installment|payment)\s*(?:number|#)?\s*(\d+)\b/i);
          if (matched) installments = installments.filter((item) => item.installmentNumber === Number(matched[1]));
        }
        if (installments.length === 0) return { status: "clarification", message: "I couldn’t find an unpaid installment matching that request." };
        if (installments.length > 1) {
          return { status: "clarification", message: `More than one installment is unpaid. Specify an installment number or due date: ${installments.slice(0, 5).map((item) => `#${item.installmentNumber} due ${item.dueDate.toISOString().slice(0, 10)}`).join(", ")}.` };
        }
        const installment = installments[0]!;
        const currency = resolveCurrency(detail.debt.currencyCode, input.currencyCode, context.originalMessage);
        if ("error" in currency) return { status: "clarification", message: currency.error };
        const parsedAmount = input.amount
          ? amountInMinor(input.amount, currency.currencyCode)
          : { amountMinor: installment.remainingAmountMinor };
        if ("error" in parsedAmount) return { status: "clarification", message: parsedAmount.error };
        if (parsedAmount.amountMinor > installment.remainingAmountMinor) return { status: "clarification", message: "The proposed payment exceeds the installment amount remaining. Record any excess separately." };
        const paymentDate = resolveDate(input.paymentDate, context.originalMessage, context.timezone);
        if (typeof paymentDate !== "string") return { status: "clarification", message: paymentDate.error };
        let sourceAccountId: string | undefined;
        let accountDetail: { label: string; value: string } | undefined;
        if (input.sourceAccountName) {
          const accounts = await findAccountsForUser(context.userId, { database });
          const account = resolveUnique(accounts, input.sourceAccountName, "active Savings account", (item) => item.name);
          if (!account.ok) return { status: "clarification", message: account.message };
          if (account.value.currencyCode !== currency.currencyCode) return { status: "clarification", message: "The Savings account currency must match the debt currency." };
          const balance = await getBalanceForAccount(account.value.id, context.userId, database);
          if (parsedAmount.amountMinor > balance) return { status: "clarification", message: "The payment exceeds the current available Savings balance." };
          sourceAccountId = account.value.id;
          accountDetail = { label: "Paid from", value: `${account.value.name} (expected after: ${displayAmount(balance - parsedAmount.amountMinor, currency.currencyCode)})` };
        }
        const paymentType: "regular" | "partial" = parsedAmount.amountMinor === installment.remainingAmountMinor ? "regular" : "partial";
        const payload = {
          debtId: detail.debt.id,
          installmentId: installment.id,
          amountMinor: parsedAmount.amountMinor,
          currencyCode: currency.currencyCode,
          paymentDate,
          paymentType,
          ...(sourceAccountId ? { sourceAccountId } : {}),
          description: `Installment payment: ${detail.debt.name}`,
        };
        return saveProposal("debt_payment", payload, {
          title: "Debt installment payment",
          summary: `${displayAmount(parsedAmount.amountMinor, currency.currencyCode)} for ${detail.debt.name}`,
          details: [
            { label: "Debt", value: detail.debt.name },
            { label: "Installment", value: `#${installment.installmentNumber}` },
            { label: "Due date", value: installment.dueDate.toISOString().slice(0, 10) },
            { label: "Amount remaining before", value: displayAmount(installment.remainingAmountMinor, currency.currencyCode) },
            { label: "Payment", value: displayAmount(parsedAmount.amountMinor, currency.currencyCode) },
            { label: "Amount remaining after", value: displayAmount(installment.remainingAmountMinor - parsedAmount.amountMinor, currency.currencyCode) },
            { label: "Payment date", value: paymentDate },
            ...(accountDetail ? [accountDetail] : []),
          ],
          href: "/debt",
          confirmLabel: "Confirm payment",
        });
      },
    }),

    prepareTravelExpense: tool({
      description: "Prepare an actual expense for an active, user-owned trip. Optionally link it to an owned Savings account and/or Monthly Budget. Never execute the expense.",
      inputSchema: z.object({
        tripName: nameSchema,
        category: z.enum(expenseCategories),
        amount: amountSchema,
        currencyCode: currencySchema.optional(),
        transactionDate: optionalDateSchema,
        description: z.string().trim().min(1).max(120),
        paymentAccountName: nameSchema.optional(),
        budgetCategoryName: nameSchema.optional(),
        notes: notesSchema,
      }).strict(),
      execute: async (input) => {
        const trips = await findTripsForUser(context.userId, { database });
        const tripResult = resolveUnique(trips.filter((trip) => !trip.archivedAt), input.tripName, "active trip", (trip) => trip.name);
        if (!tripResult.ok) return { status: "clarification", message: tripResult.message };
        const trip = tripResult.value;
        const currency = resolveCurrency(trip.baseCurrencyCode, input.currencyCode, context.originalMessage);
        if ("error" in currency) return { status: "clarification", message: currency.error };
        const amount = amountInMinor(input.amount, currency.currencyCode);
        if ("error" in amount) return { status: "clarification", message: amount.error };
        const date = resolveDate(input.transactionDate, context.originalMessage, context.timezone);
        if (typeof date !== "string") return { status: "clarification", message: date.error };
        let paymentAccountId: string | undefined;
        let budgetId: string | undefined;
        let budgetCategoryId: string | undefined;
        const details = [
          { label: "Trip", value: trip.name },
          { label: "Category", value: input.category.replaceAll("_", " ") },
          { label: "Amount", value: displayAmount(amount.amountMinor, currency.currencyCode) },
          { label: "Date", value: date },
        ];
        if (input.paymentAccountName) {
          const accounts = await findAccountsForUser(context.userId, { database });
          const account = resolveUnique(accounts, input.paymentAccountName, "active Savings account", (item) => item.name);
          if (!account.ok) return { status: "clarification", message: account.message };
          if (account.value.currencyCode !== currency.currencyCode) return { status: "clarification", message: "The Savings account currency must match this trip expense." };
          const balance = await getBalanceForAccount(account.value.id, context.userId, database);
          if (amount.amountMinor > balance) return { status: "clarification", message: "The expense exceeds the current available Savings balance." };
          paymentAccountId = account.value.id;
          details.push({ label: "Paid from", value: `${account.value.name} (expected after: ${displayAmount(balance - amount.amountMinor, currency.currencyCode)})` });
        }
        if (input.budgetCategoryName) {
          const { year, month } = dayInBudgetTimezone(date);
          const budget = await findBudgetForMonthForUser(context.userId, year, month, currency.currencyCode, database);
          if (!budget || budget.status !== "active") return { status: "clarification", message: "No active Monthly Budget matches the travel expense date and currency." };
          const categories = await findCategoriesForUser(context.userId, true, database);
          const category = resolveUnique(
            categories.filter((item) => item.categoryType === "expense" || item.categoryType === "other"),
            input.budgetCategoryName,
            "Budget expense category",
            (item) => item.name,
          );
          if (!category.ok) return { status: "clarification", message: category.message };
          budgetId = budget.id;
          budgetCategoryId = category.value.id;
          details.push({ label: "Monthly Budget", value: budget.name });
          details.push({ label: "Budget category", value: category.value.name });
        }
        return saveProposal("travel_expense", {
          tripId: trip.id,
          category: input.category,
          amountMinor: amount.amountMinor,
          currencyCode: currency.currencyCode,
          transactionDate: date,
          description: input.description,
          ...(paymentAccountId ? { paymentAccountId } : {}),
          ...(budgetId && budgetCategoryId ? { budgetId, budgetCategoryId } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        }, {
          title: "Travel expense",
          summary: `${displayAmount(amount.amountMinor, currency.currencyCode)} for ${input.description} on ${trip.name}`,
          details,
          warning: "Linked records represent one economic expense, not multiple expenses.",
          href: "/travel",
          confirmLabel: "Confirm expense",
        });
      },
    }),

    prepareTravelTodo: tool({
      description: "Prepare a travel to-do for an active trip. It will only be created after the user confirms the proposal.",
      inputSchema: z.object({
        tripName: nameSchema,
        title: z.string().trim().min(1).max(120),
        description: z.string().trim().max(1000).optional(),
        dueDate: optionalDateSchema,
        priority: z.enum(["low", "normal", "high"]).optional(),
      }).strict(),
      execute: async (input) => {
        const trips = await findTripsForUser(context.userId, { database });
        const match = resolveUnique(trips.filter((trip) => !trip.archivedAt), input.tripName, "active trip", (trip) => trip.name);
        if (!match.ok) return { status: "clarification", message: match.message };
        const dueDate = input.dueDate ? resolveDate(input.dueDate, context.originalMessage, context.timezone) : undefined;
        if (dueDate && typeof dueDate !== "string") return { status: "clarification", message: dueDate.error };
        const payload = {
          tripId: match.value.id,
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          ...(typeof dueDate === "string" ? { dueDate } : {}),
          priority: input.priority ?? "normal",
        };
        return saveProposal("travel_todo", payload, {
          title: "Travel task",
          summary: `${input.title} for ${match.value.name}`,
          details: [
            { label: "Trip", value: match.value.name },
            { label: "Task", value: input.title },
            ...(typeof dueDate === "string" ? [{ label: "Due date", value: dueDate }] : []),
            { label: "Priority", value: payload.priority },
          ],
          href: "/travel",
          confirmLabel: "Confirm task",
        });
      },
    }),

    prepareItineraryItem: tool({
      description: "Prepare an itinerary item for an active, user-owned trip. Require a clear, verifiable date; do not guess an ambiguous date or year.",
      inputSchema: z.object({
        tripName: nameSchema,
        date: z.iso.date().optional(),
        startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
        endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
        title: z.string().trim().min(1).max(120),
        location: z.string().trim().max(160).optional(),
        category: z.enum(itineraryCategories).optional(),
        description: z.string().trim().max(1000).optional(),
      }).strict(),
      execute: async (input) => {
        const trips = await findTripsForUser(context.userId, { database });
        const match = resolveUnique(trips.filter((trip) => !trip.archivedAt), input.tripName, "active trip", (trip) => trip.name);
        if (!match.ok) return { status: "clarification", message: match.message };
        if (!input.date && !/\b(?:today|yesterday|\d{4}-\d{2}-\d{2})\b/i.test(context.originalMessage)) {
          return { status: "clarification", message: "Please specify the itinerary date, including its year." };
        }
        const date = resolveDate(input.date, context.originalMessage, context.timezone);
        if (typeof date !== "string") return { status: "clarification", message: date.error };
        const tripStartYear = match.value.startDate?.slice(0, 4);
        if (!context.originalMessage.match(/\b\d{4}-\d{2}-\d{2}\b/) && tripStartYear && date.slice(0, 4) !== tripStartYear) {
          return { status: "clarification", message: `Please confirm the year for that date. This trip starts in ${tripStartYear}.` };
        }
        const payload = {
          tripId: match.value.id,
          date,
          ...(input.startTime ? { startTime: input.startTime } : {}),
          ...(input.endTime ? { endTime: input.endTime } : {}),
          title: input.title,
          ...(input.location ? { location: input.location } : {}),
          category: input.category ?? "other",
          ...(input.description ? { description: input.description } : {}),
        };
        return saveProposal("itinerary_item", payload, {
          title: "Itinerary item",
          summary: `${input.title} for ${match.value.name}`,
          details: [
            { label: "Trip", value: match.value.name },
            { label: "Date", value: date },
            { label: "Time", value: input.startTime ?? "Not specified" },
            { label: "Title", value: input.title },
            ...(input.location ? [{ label: "Location", value: input.location }] : []),
          ],
          href: "/travel",
          confirmLabel: "Confirm itinerary item",
        });
      },
    }),
  };
}
