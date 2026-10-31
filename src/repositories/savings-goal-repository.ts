import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { savingsGoals } from "@/db/schema";
import type { SavingsExecutor } from "./account-repository";

export async function createGoalForUser(
  userId: string,
  input: {
    accountId: string | null;
    name: string;
    currencyCode: "PHP" | "USD" | "EUR" | "JPY";
    targetAmountMinor: number;
    targetDate: Date | null;
    notes: string | null;
  },
  database: SavingsExecutor = getDatabase(),
) {
  const [goal] = await database.insert(savingsGoals).values({ ...input, userId }).returning();
  if (!goal) throw new Error("The savings goal could not be created.");
  return goal;
}

export async function findGoalsForUser(
  userId: string,
  options: { archived?: boolean; database?: SavingsExecutor } = {},
) {
  const database = options.database ?? getDatabase();
  return database.select().from(savingsGoals)
    .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.status, options.archived ? "archived" : "active")))
    .orderBy(desc(savingsGoals.createdAt));
}

export async function findGoalForUser(
  goalId: string,
  userId: string,
  database: SavingsExecutor = getDatabase(),
) {
  const [goal] = await database.select().from(savingsGoals)
    .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId))).limit(1);
  return goal ?? null;
}

export async function updateGoalForUser(
  goalId: string,
  userId: string,
  input: {
    accountId: string | null;
    name: string;
    currencyCode: "PHP" | "USD" | "EUR" | "JPY";
    targetAmountMinor: number;
    targetDate: Date | null;
    notes: string | null;
  },
  database: SavingsExecutor = getDatabase(),
) {
  const [goal] = await database.update(savingsGoals)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(savingsGoals.id, goalId), eq(savingsGoals.userId, userId), eq(savingsGoals.status, "active")))
    .returning();
  return goal ?? null;
}

export async function setGoalStatusForUser(
  goalId: string,
  userId: string,
  status: "completed" | "archived" | "active",
  database: SavingsExecutor = getDatabase(),
) {
  const now = new Date();
  const [goal] = await database.update(savingsGoals)
    .set({
      status,
      completedAt: status === "completed" ? now : null,
      archivedAt: status === "archived" ? now : null,
      updatedAt: now,
    })
    .where(and(
      eq(savingsGoals.id, goalId),
      eq(savingsGoals.userId, userId),
      eq(savingsGoals.status, status === "active" ? "archived" : "active"),
    ))
    .returning();
  return goal ?? null;
}
