import type { Metadata } from "next";
import type { Viewport } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Iponly | Ipon. Budget. Bayad. Gala.",
    template: "%s | Iponly",
  },
  description: "A clear, calm way to track your savings, budget, payments, and travel plans.",
  applicationName: "Iponly",
};

export const viewport: Viewport = {
  themeColor: "#f3f6f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
