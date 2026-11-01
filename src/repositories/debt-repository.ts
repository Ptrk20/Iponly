import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  debtAdjustments,
  debtInstallmentReschedules,
  debtInstallments,
  debtPaymentAllocations,
  debtPayments,
  debts,
} from "@/db/schema";
import type { SavingsExecutor } from "@/repositories/account-repository";

export async function createDebtForUser(userId: string, values: Omit<typeof debts.$inferInsert, "userId">, database: SavingsExecutor = getDatabase()) {
  const [debt] = await database.insert(debts).values({ ...values, userId }).returning();
  if (!debt) throw new Error("The debt could not be created.");
  return debt;
}

export async function findDebtByCreationKey(userId: string, key: string, database: SavingsExecutor = getDatabase()) {
  const [debt] = await database.select().from(debts)
    .where(and(eq(debts.userId, userId), eq(debts.creationIdempotencyKey, key))).limit(1);
  return debt ?? null;
}

export async function findDebtForUser(debtId: string, userId: string, database: SavingsExecutor = getDatabase()) {
  const [debt] = await database.select().from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId))).limit(1);
  return debt ?? null;
}

export async function lockDebtForUser(debtId: string, userId: string, database: SavingsExecutor) {
  const [debt] = await database.select().from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId))).for("update").limit(1);
  return debt ?? null;
}

export async function findDebtsForUser(
  userId: string,
  options: { archived?: boolean; database?: SavingsExecutor } = {},
) {
  const database = options.database ?? getDatabase();
  return database.select().from(debts)
    .where(and(
      eq(debts.userId, userId),
      options.archived ? eq(debts.status, "archived") : ne(debts.status, "archived"),
    ))
    .orderBy(desc(debts.createdAt))
    .limit(250);
}

export async function createInstallmentsForDebtAndUser(
  userId: string,
  debtId: string,
  values: Array<Omit<typeof debtInstallments.$inferInsert, "userId" | "debtId">>,
  database: SavingsExecutor,
) {
  if (values.length === 0) return [];
  return database.insert(debtInstallments)
    .values(values.map((value) => ({ ...value, userId, debtId })))
    .returning();
}

export async function createInstallmentForDebtAndUser(
  userId: string,
  debtId: string,
  value: Omit<typeof debtInstallments.$inferInsert, "userId" | "debtId">,
  database: SavingsExecutor,
) {
  const [installment] = await database.insert(debtInstallments)
    .values({ ...value, userId, debtId }).returning();
  if (!installment) throw new Error("The installment could not be created.");
  return installment;
}

export async function findInstallmentsForDebtAndUser(
  debtId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(debtInstallments)
    .where(and(eq(debtInstallments.debtId, debtId), eq(debtInstallments.userId, userId)))
    .orderBy(asc(debtInstallments.dueDate), asc(debtInstallments.installmentNumber))
    .limit(600);
}

export async function findInstallmentForUser(installmentId: string, userId: string, database: SavingsExecutor) {
  const [installment] = await database.select().from(debtInstallments)
    .where(and(eq(debtInstallments.id, installmentId), eq(debtInstallments.userId, userId))).limit(1);
  return installment ?? null;
}

export async function updateInstallmentForUser(
  installmentId: string,
  userId: string,
  values: Partial<typeof debtInstallments.$inferInsert>,
  database: SavingsExecutor,
) {
  const [installment] = await database.update(debtInstallments)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(debtInstallments.id, installmentId), eq(debtInstallments.userId, userId)))
    .returning();
  return installment ?? null;
}

export async function createInstallmentRescheduleForUser(
  userId: string,
  value: Omit<typeof debtInstallmentReschedules.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [reschedule] = await database.insert(debtInstallmentReschedules)
    .values({ ...value, userId }).returning();
  if (!reschedule) throw new Error("The reschedule could not be recorded.");
  return reschedule;
}

export async function findInstallmentReschedulesForDebtAndUser(
  debtId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(debtInstallmentReschedules)
    .where(and(eq(debtInstallmentReschedules.debtId, debtId), eq(debtInstallmentReschedules.userId, userId)))
    .orderBy(desc(debtInstallmentReschedules.createdAt))
    .limit(600);
}

export async function findPaymentsForDebtAndUser(
  debtId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(debtPayments)
    .where(and(eq(debtPayments.debtId, debtId), eq(debtPayments.userId, userId)))
    .orderBy(desc(debtPayments.paymentDate), desc(debtPayments.createdAt))
    .limit(300);
}

export async function findPaymentForUser(paymentId: string, userId: string, database: SavingsExecutor) {
  const [payment] = await database.select().from(debtPayments)
    .where(and(eq(debtPayments.id, paymentId), eq(debtPayments.userId, userId))).limit(1);
  return payment ?? null;
}

export async function findPaymentByIdempotencyKey(userId: string, key: string, database: SavingsExecutor) {
  const [payment] = await database.select().from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), eq(debtPayments.idempotencyKey, key))).limit(1);
  return payment ?? null;
}

export async function createPaymentForDebtAndUser(
  userId: string,
  values: Omit<typeof debtPayments.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [payment] = await database.insert(debtPayments).values({ ...values, userId }).returning();
  if (!payment) throw new Error("The payment could not be recorded.");
  return payment;
}

export async function markPaymentReversedForUser(paymentId: string, userId: string, reversalId: string, database: SavingsExecutor) {
  const [payment] = await database.update(debtPayments)
    .set({ status: "reversed", reversedByPaymentId: reversalId, updatedAt: new Date() })
    .where(and(
      eq(debtPayments.id, paymentId),
      eq(debtPayments.userId, userId),
      eq(debtPayments.status, "posted"),
      sql`${debtPayments.reversedByPaymentId} IS NULL`,
    ))
    .returning();
  return payment ?? null;
}

export async function createPaymentAllocationsForUser(
  userId: string,
  debtId: string,
  paymentId: string,
  values: Array<Omit<typeof debtPaymentAllocations.$inferInsert, "userId" | "debtId" | "paymentId">>,
  database: SavingsExecutor,
) {
  if (values.length === 0) return [];
  return database.insert(debtPaymentAllocations)
    .values(values.map((value) => ({ ...value, userId, debtId, paymentId })))
    .returning();
}

export async function findAllocationsForDebtAndUser(
  debtId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select({ allocation: debtPaymentAllocations })
    .from(debtPaymentAllocations)
    .innerJoin(debtPayments, and(
      eq(debtPaymentAllocations.paymentId, debtPayments.id),
      eq(debtPaymentAllocations.userId, debtPayments.userId),
    ))
    .where(and(
      eq(debtPaymentAllocations.debtId, debtId),
      eq(debtPaymentAllocations.userId, userId),
      eq(debtPayments.status, "posted"),
    ))
    .orderBy(asc(debtPaymentAllocations.createdAt))
    .limit(2000)
    .then((rows) => rows.map((row) => row.allocation));
}

export async function createAdjustmentForDebtAndUser(
  userId: string,
  values: Omit<typeof debtAdjustments.$inferInsert, "userId">,
  database: SavingsExecutor,
) {
  const [adjustment] = await database.insert(debtAdjustments).values({ ...values, userId }).returning();
  if (!adjustment) throw new Error("The adjustment could not be recorded.");
  return adjustment;
}

export async function findAdjustmentForUser(adjustmentId: string, userId: string, database: SavingsExecutor) {
  const [adjustment] = await database.select().from(debtAdjustments)
    .where(and(eq(debtAdjustments.id, adjustmentId), eq(debtAdjustments.userId, userId))).limit(1);
  return adjustment ?? null;
}

export async function findAdjustmentReversalForUser(adjustmentId: string, userId: string, database: SavingsExecutor) {
  const [reversal] = await database.select().from(debtAdjustments)
    .where(and(
      eq(debtAdjustments.reversalOfAdjustmentId, adjustmentId),
      eq(debtAdjustments.userId, userId),
    )).limit(1);
  return reversal ?? null;
}

export async function findAdjustmentsForDebtAndUser(
  debtId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  return database.select().from(debtAdjustments)
    .where(and(eq(debtAdjustments.debtId, debtId), eq(debtAdjustments.userId, userId)))
    .orderBy(desc(debtAdjustments.effectiveDate), desc(debtAdjustments.createdAt))
    .limit(300);
}

export async function setDebtStatusForUser(
  debtId: string,
  userId: string,
  status: typeof debts.$inferSelect.status,
  database: SavingsExecutor,
) {
  const [debt] = await database.update(debts)
    .set({
      status,
      completedAt: status === "paid" ? new Date() : null,
      archivedAt: status === "archived" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .returning();
  return debt ?? null;
}

export async function updateDebtDetailsForUser(
  debtId: string,
  userId: string,
  values: Partial<typeof debts.$inferInsert>,
  database: SavingsExecutor,
) {
  const [debt] = await database.update(debts)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
    .returning();
  return debt ?? null;
}

export async function findDebtPaymentsForUser(userId: string, debtIds: string[], database: SavingsExecutor) {
  if (debtIds.length === 0) return [];
  return database.select().from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), inArray(debtPayments.debtId, debtIds)))
    .orderBy(desc(debtPayments.paymentDate), desc(debtPayments.createdAt))
    .limit(1000);
}

export async function findDebtAdjustmentsForUser(userId: string, debtIds: string[], database: SavingsExecutor) {
  if (debtIds.length === 0) return [];
  return database.select().from(debtAdjustments)
    .where(and(eq(debtAdjustments.userId, userId), inArray(debtAdjustments.debtId, debtIds)))
    .orderBy(desc(debtAdjustments.effectiveDate))
    .limit(1000);
}

export async function findAllInstallmentsForUser(userId: string, debtIds: string[], database: SavingsExecutor) {
  if (debtIds.length === 0) return [];
  return database.select().from(debtInstallments)
    .where(and(eq(debtInstallments.userId, userId), inArray(debtInstallments.debtId, debtIds)))
    .orderBy(asc(debtInstallments.dueDate), asc(debtInstallments.installmentNumber))
    .limit(2000);
}

export async function findPaymentAllocationsForPayments(paymentIds: string[], userId: string, database: SavingsExecutor) {
  if (paymentIds.length === 0) return [];
  return database.select({ allocation: debtPaymentAllocations })
    .from(debtPaymentAllocations)
    .innerJoin(debtPayments, and(
      eq(debtPaymentAllocations.paymentId, debtPayments.id),
      eq(debtPaymentAllocations.userId, debtPayments.userId),
    ))
    .where(and(
      eq(debtPaymentAllocations.userId, userId),
      inArray(debtPaymentAllocations.paymentId, paymentIds),
      eq(debtPayments.status, "posted"),
    ))
    .orderBy(asc(debtPaymentAllocations.createdAt))
    .limit(3000)
    .then((rows) => rows.map((row) => row.allocation));
}
