import { getCurrentUser } from "@/lib/auth-session";
import { createFinancialDataExport } from "@/services/export-service";
import { connection } from "next/server";

export async function GET() {
  await connection();

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    console.error("Iponly could not resolve the session for a financial data export.");
    return Response.json(
      { error: "Your session could not be verified. Please sign in again." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!user) {
    return Response.json(
      { error: "Please sign in to export your financial data." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const data = await createFinancialDataExport(user.id);
    const filename = `iponly-financial-data-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(data), {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("Iponly financial data export failed.", { category: "financial-data-export" });
    return Response.json(
      { error: "We couldn’t create your export. Please try again later." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
