export type ThemePreference = "light" | "dark" | "system";
export type FirstDayPreference = "monday" | "sunday";

export interface UserPreferences {
  id: string;
  userId: string;
  defaultCurrencyCode: "PHP" | "USD" | "EUR" | "JPY";
  locale: "en-PH" | "fil-PH";
  timezone: string;
  theme: ThemePreference;
  firstDayOfWeek: FirstDayPreference;
  onboardingCompleted: boolean;
  aiActionsEnabled: boolean;
  debtRemindersEnabled: boolean;
  tripRemindersEnabled: boolean;
  todoRemindersEnabled: boolean;
  monthlyAnalyticsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}