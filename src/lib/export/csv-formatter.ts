// CSV formatter for research reports
// Produces flat CSV for spreadsheet analysis of competitor pricing, segments, and pain points.

import type {
  AgentId,
  AgentOutput,
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
} from "@/lib/schema/research-schema";

const DQUOTE = String.fromCharCode(34);

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes(DQUOTE)) {
    return DQUOTE + s.replace(/"/g, DQUOTE + DQUOTE) + DQUOTE;
  }
  return s;
}

function rowsToCSV(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(csvEscape).join(",");
  const dataLines = rows.map((row) => row.map(csvEscape).join(","));
  return [headerLine, ...dataLines].join("\n");
}

export function generateCompetitorsCSV(o: CompetitorAnalystOutput): string {
  const headers = ["name", "tagline", "positioning", "min_price", "max_price", "currency", "pricing_model", "market_share", "url"];
  const rows = o.competitors.map((c) => [
    c.name,
    c.tagline,
    c.positioning,
    c.pricing.min,
    c.pricing.max,
    c.pricing.currency,
    c.pricing.model,
    c.marketShare ?? "",
    c.url ?? "",
  ]);
  return rowsToCSV(headers, rows);
}

export function generatePainPointsCSV(o: PainDetectiveOutput): string {
  const headers = ["pain", "frequency", "severity", "segments", "representative_quote"];
  const rows = o.painPoints.map((p) => [
    p.pain,
    p.frequency,
    p.severity,
    p.userSegments.join("; "),
    p.quotes[0]?.text ?? "",
  ]);
  return rowsToCSV(headers, rows);
}

export function generatePricingCSV(o: PricingScoutOutput): string {
  const headers = ["band", "min", "max", "typical", "currency"];
  const rows = o.priceBands.map((b) => [b.name, b.min, b.max, b.typical, b.currency]);
  return rowsToCSV(headers, rows);
}

export function generateChannelsCSV(o: ChannelScoutOutput): string {
  const headers = ["channel", "category", "reach", "cost", "effectiveness", "audience"];
  const rows = o.channels.map((c) => [c.name, c.category, c.reach, c.cost, c.effectiveness, c.audience]);
  return rowsToCSV(headers, rows);
}

export function generateMarketCSV(o: MarketSizerOutput): string {
  const headers = ["metric", "value", "unit"];
  const rows = [
    ["TAM", o.marketSize.tam, o.marketSize.currency],
    ["SAM", o.marketSize.sam, o.marketSize.currency],
    ["SOM_3yr", o.marketSize.som, o.marketSize.currency],
    ["Growth_Rate", o.marketSize.growthRate, "percent_per_year"],
  ];
  return rowsToCSV(headers, rows);
}

export function generateCSVBundle(opts: { outputs: Record<AgentId, AgentOutput | null> }): Record<string, string> {
  const { outputs } = opts;
  const bundle: Record<string, string> = {};
  const m = outputs["market-sizer"] as MarketSizerOutput | null;
  if (m) bundle["market-size.csv"] = generateMarketCSV(m);
  const c = outputs["competitor-analyst"] as CompetitorAnalystOutput | null;
  if (c) bundle["competitors.csv"] = generateCompetitorsCSV(c);
  const p = outputs["pain-detective"] as PainDetectiveOutput | null;
  if (p) bundle["pain-points.csv"] = generatePainPointsCSV(p);
  const pr = outputs["pricing-scout"] as PricingScoutOutput | null;
  if (pr) bundle["pricing.csv"] = generatePricingCSV(pr);
  const ch = outputs["channel-scout"] as ChannelScoutOutput | null;
  if (ch) bundle["channels.csv"] = generateChannelsCSV(ch);
  return bundle;
}
