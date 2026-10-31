import type { SavingsAccountRecord } from "@/types/domain";

type AccountIdentity = Pick<SavingsAccountRecord, "name" | "institution" | "accountType" | "color">;

export type AccountBrand = {
  id: string;
  label: string;
  background: string;
  foreground: string;
  accent: string;
};

const brands: (AccountBrand & { aliases: string[] })[] = [
  { id: "maya", label: "maya", background: "#080e0c", foreground: "#ffffff", accent: "#22ef9a", aliases: ["maya", "paymaya", "pay maya"] },
  { id: "gcash", label: "GCash", background: "#0055df", foreground: "#ffffff", accent: "#b8e2ff", aliases: ["gcash", "g cash"] },
  { id: "bpi", label: "BPI", background: "#a6192e", foreground: "#ffffff", accent: "#f9d27d", aliases: ["bpi", "bank of the philippine islands", "bank of philippine islands"] },
  { id: "eastwest", label: "EastWest", background: "#51225e", foreground: "#ffffff", accent: "#ffe078", aliases: ["eastwest", "east west"] },
  { id: "rcbc", label: "RCBC", background: "#12356d", foreground: "#ffffff", accent: "#f5b8c3", aliases: ["rcbc", "rizal commercial banking corporation"] },
  { id: "maribank", label: "MariBank", background: "#c74913", foreground: "#ffffff", accent: "#ffedc6", aliases: ["maribank", "mari bank", "seabank", "sea bank"] },
  { id: "shopee", label: "ShopeePay", background: "#c73c20", foreground: "#ffffff", accent: "#ffe3d7", aliases: ["shopee", "shopeepay", "shopee pay"] },
  { id: "pnb", label: "PNB", background: "#143d74", foreground: "#ffffff", accent: "#c9eaff", aliases: ["pnb", "philippine national bank"] },
  { id: "bdo", label: "BDO", background: "#063c80", foreground: "#ffffff", accent: "#ffd047", aliases: ["bdo", "banco de oro"] },
  { id: "metrobank", label: "Metrobank", background: "#003b71", foreground: "#ffffff", accent: "#a6dcff", aliases: ["metrobank", "metro bank", "metropolitan bank"] },
  { id: "unionbank", label: "UnionBank", background: "#a83e05", foreground: "#ffffff", accent: "#ffda9f", aliases: ["unionbank", "union bank"] },
  { id: "securitybank", label: "Security Bank", background: "#00634a", foreground: "#ffffff", accent: "#bdedb5", aliases: ["securitybank", "security bank"] },
  { id: "landbank", label: "LANDBANK", background: "#006536", foreground: "#ffffff", accent: "#ffe684", aliases: ["landbank", "land bank"] },
  { id: "gotyme", label: "GoTyme", background: "#093b43", foreground: "#ffffff", accent: "#60ece3", aliases: ["gotyme", "go tyme"] },
  { id: "tonik", label: "tonik", background: "#502c73", foreground: "#ffffff", accent: "#e5c8ff", aliases: ["tonik"] },
  { id: "cimb", label: "CIMB", background: "#8e182a", foreground: "#ffffff", accent: "#ffc4be", aliases: ["cimb"] },
  { id: "chinabank", label: "China Bank", background: "#a72727", foreground: "#ffffff", accent: "#ffd9bd", aliases: ["chinabank", "china bank"] },
  { id: "psbank", label: "PSBank", background: "#173f82", foreground: "#ffffff", accent: "#ffd78e", aliases: ["psbank", "ps bank", "philippine savings bank"] },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function foregroundFor(background: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}

export function resolveAccountBrand(account: AccountIdentity): AccountBrand {
  const institution = account.institution?.trim();
  const identity = ` ${normalize(institution || account.name)} `;
  const brand = brands.find((candidate) => candidate.aliases.some((alias) => identity.includes(` ${alias} `)));
  if (brand) return brand;

  const background = account.color && /^#[0-9a-f]{6}$/i.test(account.color) ? account.color : "#243c36";
  const foreground = foregroundFor(background);
  return {
    id: "personal",
    label: institution || (account.accountType === "cash" ? "Cash" : "Personal"),
    background,
    foreground,
    accent: foreground,
  };
}