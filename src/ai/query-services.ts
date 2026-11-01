import "server-only";

import { getAnalyticsDashboardData } from "@/services/analytics-service";
import { getDebtDetails, getDebtOverview } from "@/services/debt-service";
import { getSavingsOverview } from "@/services/savings-service";
import {
  getTravelPageData,
  getTravelTripDetail,
} from "@/services/travel-service";
import type { AnalyticsPeriod } from "@/types/analytics";
import type { CurrencyCode } from "@/types/domain";
import type { IponlyDatabase } from "@/db";

export interface AIQueryContext {
  userId: string;
  timezone: string;
  defaultCurrencyCode: CurrencyCode;
  database?: IponlyDatabase;
}

export const aiQueryServices = {
  getSavingsOverview(context: AIQueryContext) {
    return getSavingsOverview(context.userId, context.database, "6m");
  },

  getDebtOverview(context: AIQueryContext) {
    return getDebtOverview(context.userId, { database: context.database, timezone: context.timezone });
  },

  getDebtDetails(context: AIQueryContext, debtId: string) {
    return getDebtDetails(context.userId, debtId, { database: context.database, timezone: context.timezone });
  },

  getAnalytics(context: AIQueryContext, period: AnalyticsPeriod) {
    return getAnalyticsDashboardData(context.userId, {
      period,
      timezone: context.timezone,
      defaultCurrencyCode: context.defaultCurrencyCode,
      database: context.database,
    });
  },

  getTravelPageData(context: AIQueryContext) {
    return getTravelPageData(context.userId, context.database);
  },

  getTravelTripDetail(context: AIQueryContext, tripId: string) {
    return getTravelTripDetail(tripId, context.userId, context.database);
  },
};
