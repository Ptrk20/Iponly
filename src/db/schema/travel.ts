import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { currencyPreference, user } from "./auth";
import { accountTransactions, savingsGoals } from "./savings";

export const travelMemberRole = pgEnum("travel_member_role", ["viewer", "editor"]);
export const tripStatus = pgEnum("trip_status", ["idea", "planning", "booked", "ongoing", "completed", "cancelled"]);
export const plannedTravelExpenseStatus = pgEnum("planned_travel_expense_status", [
  "planned",
  "reserved",
  "cancelled",
  "converted_to_actual",
]);
export const travelExpenseCategory = pgEnum("travel_expense_category", [
  "flights",
  "accommodation",
  "local_transportation",
  "food",
  "activities",
  "shopping",
  "insurance",
  "visa",
  "connectivity",
  "emergency",
  "other",
]);
export const travelExpenseStatus = pgEnum("travel_expense_status", ["posted", "reversed"]);
export const travelItineraryCategory = pgEnum("travel_itinerary_category", [
  "flight",
  "accommodation",
  "transport",
  "food",
  "activity",
  "sightseeing",
  "shopping",
  "free_time",
  "other",
]);
export const travelItineraryStatus = pgEnum("travel_itinerary_status", ["planned", "confirmed", "completed", "cancelled"]);
export const travelTodoStatus = pgEnum("travel_todo_status", ["pending", "completed", "cancelled"]);
export const travelTodoPriority = pgEnum("travel_todo_priority", ["low", "normal", "high"]);
export const travelPackingCategory = pgEnum("travel_packing_category", [
  "documents",
  "clothing",
  "electronics",
  "toiletries",
  "medicine",
  "money",
  "travel_gear",
  "other",
]);
export const travelBookingType = pgEnum("travel_booking_type", [
  "flight",
  "hotel",
  "transport",
  "activity",
  "restaurant",
  "insurance",
  "other",
]);
export const travelBookingStatus = pgEnum("travel_booking_status", ["planned", "booked", "completed", "cancelled"]);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    destination: text("destination").notNull(),
    countryCode: text("country_code"),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    travelerCount: integer("traveler_count").notNull().default(1),
    baseCurrencyCode: currencyPreference("base_currency_code").notNull().default("PHP"),
    totalBudgetMinor: bigint("total_budget_minor", { mode: "number" }).notNull().default(0),
    linkedSavingsGoalId: uuid("linked_savings_goal_id"),
    status: tripStatus("status").notNull().default("idea"),
    notes: text("notes"),
    shareEnabled: boolean("share_enabled").notNull().default(false),
    shareCode: text("share_code"),
    shareDefaultRole: travelMemberRole("share_default_role").notNull().default("viewer"),
    creationIdempotencyKey: text("creation_idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("trips_id_user_unique").on(table.id, table.userId),
    uniqueIndex("trips_share_code_unique").on(table.shareCode),
    check("trips_share_code_check", sql`${table.shareCode} IS NULL OR ${table.shareCode} ~ '^[A-HJ-NP-Z2-9]{8}$'`),
    uniqueIndex("trips_user_creation_key_unique").on(table.userId, table.creationIdempotencyKey),
    foreignKey({
      name: "trips_savings_goal_user_currency_fk",
      columns: [table.linkedSavingsGoalId, table.userId, table.baseCurrencyCode],
      foreignColumns: [savingsGoals.id, savingsGoals.userId, savingsGoals.currencyCode],
    }).onDelete("restrict"),
    index("trips_user_status_start_idx").on(table.userId, table.status, table.startDate),
    index("trips_user_archive_start_idx").on(table.userId, table.archivedAt, table.startDate),
    check("trips_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
    check("trips_destination_nonempty_check", sql`length(trim(${table.destination})) > 0`),
    check("trips_date_order_check", sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
    check("trips_traveler_count_positive_check", sql`${table.travelerCount} > 0`),
    check("trips_budget_nonnegative_check", sql`${table.totalBudgetMinor} >= 0`),
    check("trips_country_code_check", sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Za-z]{2}$'`),
  ],
);

export const travelTripMembers = pgTable(
  "travel_trip_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: travelMemberRole("role").notNull().default("viewer"),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_trip_members_trip_user_unique").on(table.tripId, table.userId),
    index("travel_trip_members_user_idx").on(table.userId),
  ],
);

export const travelPlannedExpenses = pgTable(
  "travel_planned_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    category: travelExpenseCategory("category").notNull().default("other"),
    description: text("description").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: currencyPreference("currency_code").notNull(),
    expectedDate: date("expected_date", { mode: "string" }),
    notes: text("notes"),
    status: plannedTravelExpenseStatus("status").notNull().default("planned"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_planned_expenses_id_user_trip_currency_unique").on(table.id, table.userId, table.tripId, table.currencyCode),
    foreignKey({
      name: "travel_planned_expenses_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    index("travel_planned_expenses_user_trip_status_idx").on(table.userId, table.tripId, table.status),
    check("travel_planned_expenses_description_nonempty_check", sql`length(trim(${table.description})) > 0`),
    check("travel_planned_expenses_amount_positive_check", sql`${table.amountMinor} > 0`),
  ],
);

export const travelExpenses = pgTable(
  "travel_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    plannedExpenseId: uuid("planned_expense_id"),
    category: travelExpenseCategory("category").notNull().default("other"),
    description: text("description").notNull(),
    merchant: text("merchant"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currencyCode: currencyPreference("currency_code").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    linkedAccountTransactionId: uuid("linked_account_transaction_id"),
    notes: text("notes"),
    status: travelExpenseStatus("status").notNull().default("posted"),
    reversalReason: text("reversal_reason"),
    reversedAt: timestamp("reversed_at", { withTimezone: true, mode: "date" }),
    reversalIdempotencyKey: text("reversal_idempotency_key"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_expenses_id_user_currency_unique").on(table.id, table.userId, table.currencyCode),
    uniqueIndex("travel_expenses_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    uniqueIndex("travel_expenses_user_reversal_key_unique").on(table.userId, table.reversalIdempotencyKey).where(sql`${table.reversalIdempotencyKey} IS NOT NULL`),
    uniqueIndex("travel_expenses_account_transaction_unique").on(table.linkedAccountTransactionId).where(sql`${table.linkedAccountTransactionId} IS NOT NULL`),
    foreignKey({
      name: "travel_expenses_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "travel_expenses_planned_user_trip_currency_fk",
      columns: [table.plannedExpenseId, table.userId, table.tripId, table.currencyCode],
      foreignColumns: [
        travelPlannedExpenses.id,
        travelPlannedExpenses.userId,
        travelPlannedExpenses.tripId,
        travelPlannedExpenses.currencyCode,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "travel_expenses_account_transaction_user_currency_fk",
      columns: [table.linkedAccountTransactionId, table.userId, table.currencyCode],
      foreignColumns: [accountTransactions.id, accountTransactions.userId, accountTransactions.currencyCode],
    }).onDelete("restrict"),
    index("travel_expenses_user_trip_date_idx").on(table.userId, table.tripId, table.transactionDate),
    index("travel_expenses_user_status_date_idx").on(table.userId, table.status, table.transactionDate),
    check("travel_expenses_description_nonempty_check", sql`length(trim(${table.description})) > 0`),
    check("travel_expenses_amount_positive_check", sql`${table.amountMinor} > 0`),
    check(
      "travel_expenses_reversal_fields_check",
      sql`(${table.status} = 'reversed' AND length(trim(coalesce(${table.reversalReason}, ''))) > 0 AND ${table.reversedAt} IS NOT NULL AND ${table.reversalIdempotencyKey} IS NOT NULL) OR (${table.status} = 'posted' AND ${table.reversalReason} IS NULL AND ${table.reversedAt} IS NULL AND ${table.reversalIdempotencyKey} IS NULL)`,
    ),
  ],
);

export const travelItineraryItems = pgTable(
  "travel_itinerary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time", { precision: 0 }),
    endTime: time("end_time", { precision: 0 }),
    title: text("title").notNull(),
    location: text("location"),
    category: travelItineraryCategory("category").notNull().default("other"),
    description: text("description"),
    confirmationReference: text("confirmation_reference"),
    link: text("link"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    status: travelItineraryStatus("status").notNull().default("planned"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_itinerary_items_id_user_unique").on(table.id, table.userId),
    uniqueIndex("travel_itinerary_items_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    foreignKey({
      name: "travel_itinerary_items_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    index("travel_itinerary_items_user_trip_date_order_idx").on(table.userId, table.tripId, table.date, table.sortOrder),
    check("travel_itinerary_items_title_nonempty_check", sql`length(trim(${table.title})) > 0`),
    check("travel_itinerary_items_time_order_check", sql`${table.startTime} IS NULL OR ${table.endTime} IS NULL OR ${table.endTime} >= ${table.startTime}`),
    check("travel_itinerary_items_sort_order_nonnegative_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const travelTodos = pgTable(
  "travel_todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date", { mode: "string" }),
    priority: travelTodoPriority("priority").notNull().default("normal"),
    status: travelTodoStatus("status").notNull().default("pending"),
    sortOrder: integer("sort_order").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("travel_todos_id_user_unique").on(table.id, table.userId),
    uniqueIndex("travel_todos_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    foreignKey({
      name: "travel_todos_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    index("travel_todos_user_trip_status_due_idx").on(table.userId, table.tripId, table.status, table.dueDate),
    check("travel_todos_title_nonempty_check", sql`length(trim(${table.title})) > 0`),
    check("travel_todos_sort_order_nonnegative_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const travelPackingItems = pgTable(
  "travel_packing_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    name: text("name").notNull(),
    category: travelPackingCategory("category").notNull().default("other"),
    quantity: integer("quantity").notNull().default(1),
    packed: boolean("packed").notNull().default(false),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_packing_items_id_user_unique").on(table.id, table.userId),
    foreignKey({
      name: "travel_packing_items_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    index("travel_packing_items_user_trip_category_idx").on(table.userId, table.tripId, table.category, table.sortOrder),
    check("travel_packing_items_name_nonempty_check", sql`length(trim(${table.name})) > 0`),
    check("travel_packing_items_quantity_positive_check", sql`${table.quantity} > 0`),
    check("travel_packing_items_sort_order_nonnegative_check", sql`${table.sortOrder} >= 0`),
  ],
);

export const travelBookings = pgTable(
  "travel_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull(),
    bookingType: travelBookingType("booking_type").notNull().default("other"),
    provider: text("provider"),
    title: text("title").notNull(),
    confirmationNumber: text("confirmation_number"),
    bookingDate: date("booking_date", { mode: "string" }),
    startDateTime: timestamp("start_date_time", { withTimezone: true, mode: "date" }),
    endDateTime: timestamp("end_date_time", { withTimezone: true, mode: "date" }),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currencyCode: currencyPreference("currency_code"),
    status: travelBookingStatus("status").notNull().default("planned"),
    link: text("link"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("travel_bookings_id_user_unique").on(table.id, table.userId),
    foreignKey({
      name: "travel_bookings_trip_user_fk",
      columns: [table.tripId, table.userId],
      foreignColumns: [trips.id, trips.userId],
    }).onDelete("cascade"),
    index("travel_bookings_user_trip_start_idx").on(table.userId, table.tripId, table.startDateTime),
    check("travel_bookings_title_nonempty_check", sql`length(trim(${table.title})) > 0`),
    check("travel_bookings_amount_nonnegative_check", sql`${table.amountMinor} IS NULL OR ${table.amountMinor} >= 0`),
    check("travel_bookings_amount_currency_pair_check", sql`(${table.amountMinor} IS NULL AND ${table.currencyCode} IS NULL) OR (${table.amountMinor} IS NOT NULL AND ${table.currencyCode} IS NOT NULL)`),
    check("travel_bookings_datetime_order_check", sql`${table.startDateTime} IS NULL OR ${table.endDateTime} IS NULL OR ${table.endDateTime} >= ${table.startDateTime}`),
  ],
);
