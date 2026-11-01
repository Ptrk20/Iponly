import { getFinancialRecordsForExport } from "@/repositories/export-repository";

export async function createFinancialDataExport(userId: string) {
  return {
    formatVersion: 1,
    application: "Iponly",
    exportedAt: new Date().toISOString(),
    amountConvention: "Monetary values are integer minor units and retain their currency code or parent-record currency.",
    records: await getFinancialRecordsForExport(userId),
  };
}
