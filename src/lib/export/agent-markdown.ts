// Per-agent markdown formatters — produce self-contained markdown snippets
// for a single agent's report. Used by the "Copy section" button in each
// report section component.

import type {
  AgentId,
  AgentOutput,
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
  SynthesisOutput,
} from "@/lib/schema/research-schema";

const AGENT_TITLE: Record<AgentId, string> = {
  "market-sizer": "Market Sizer",
  "competitor-analyst": "Competitor Analyst",
  "pain-detective": "Pain Detective",
  "pricing-scout": "Pricing Scout",
  "channel-scout": "Channel Scout",
  synthesis: "Synthesis",
};

function fmtMoney(value: number, currency: string = "USD"): string {
  const sym = currency === "USD" ? "$" : currency + " ";
  if (value >= 1_000_000_000) return `${sym}${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(0)}`;
}

function confidence(level: string): string {
  return level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴";
}

function formatMarketSizer(o: MarketSizerOutput): string {
  const m = o.marketSize;
  return [
    `# 📊 ${AGENT_TITLE["market-sizer"]}`,
    ``,
    `> ${o.summary}`,
    ``,
    `## Market Size`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| TAM | ${fmtMoney(m.tam, m.currency)} ${confidence(m.confidence)} |`,
    `| SAM | ${fmtMoney(m.sam, m.currency)} |`,
    `| SOM (3yr) | ${fmtMoney(m.som, m.currency)} |`,
    `| Growth Rate | ${m.growthRate}%/yr (${m.growthTrend}) |`,
    ``,
    `## Key Trends`,
    ``,
    ...o.keyTrends.map((t) => `- ${t.impact === "positive" ? "📈" : t.impact === "negative" ? "📉" : "➡️"} **${t.trend}** — _${t.evidence}_`),
    ``,
    `## Target Segments`,
    ``,
    ...o.targetSegments.map((s) => `- **${s.name}** (~${fmtMoney(s.size, m.currency)}): ${s.description}`),
    ``,
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

function formatCompetitorAnalyst(o: CompetitorAnalystOutput): string {
  return [
    `# 🏆 ${AGENT_TITLE["competitor-analyst"]}`,
    ``,
    `> ${o.summary}`,
    ``,
    `## Competitors`,
    ``,
    ...o.competitors.flatMap((c) => [
      `### ${c.name} _(${c.positioning})_`,
      ``,
      `> ${c.tagline}`,
      ``,
      `- **Pricing:** ${fmtMoney(c.pricing.min, c.pricing.currency)}–${fmtMoney(c.pricing.max, c.pricing.currency)} (${c.pricing.model})`,
      c.marketShare !== undefined ? `- **Market Share:** ${c.marketShare}%` : null,
      `- **Differentiation:** ${c.differentiation}`,
      ``,
      `**Strengths:** ${c.strengths.map((s) => s).join("; ")}`,
    ]),
    `**Weaknesses:** ${o.competitors.flatMap((c) => c.weaknesses).join("; ")}`,
    ``,
    `## Market Gaps & Opportunities`,
    ``,
    ...o.gaps.map((g) => `- **${g.gap}** _(${g.difficulty} difficulty)_\n  _Opportunity:_ ${g.opportunity}`),
    ``,
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

function formatPainDetective(o: PainDetectiveOutput): string {
  return [
    `# 💬 ${AGENT_TITLE["pain-detective"]}`,
    ``,
    `> ${o.summary}`,
    ``,
    `## Pain Points`,
    ``,
    ...o.painPoints.flatMap((p) => [
      `### ${p.severity === "critical" ? "🔴" : p.severity === "significant" ? "🟡" : "⚪"} ${p.pain}`,
      ``,
      `_${p.frequency}, ${p.severity}_`,
      ``,
      ...p.quotes.slice(0, 2).map((q) => `> "${q.text}"\n>\n> _— ${q.source}_`),
      ``,
      `**Affected segments:** ${p.userSegments.join(", ")}`,
      ``,
    ]),
    `## Unmet Needs`,
    ``,
    ...o.unmetNeeds.map((u) => `- **${u.need}** — _${u.whyUnmet}_ → _Opportunity:_ ${u.opportunity}`),
    ``,
    `## User Personas`,
    ``,
    ...o.userPersonas.flatMap((p) => [
      `### ${p.name} — _${p.role}_`,
      ``,
      `**Goals:** ${p.goals.join("; ")}`,
      ``,
      `**Frustrations:** ${p.frustrations.join("; ")}`,
      ``,
    ]),
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

function formatPricingScout(o: PricingScoutOutput): string {
  return [
    `# 💰 ${AGENT_TITLE["pricing-scout"]}`,
    ``,
    `> ${o.summary}`,
    ``,
    `## Price Bands`,
    ``,
    `| Band | Range | Typical |`,
    `|------|-------|---------|`,
    ...o.priceBands.map((b) => `| ${b.name} | ${fmtMoney(b.min, b.currency)}–${fmtMoney(b.max, b.currency)} | ${fmtMoney(b.typical, b.currency)} |`),
    ``,
    `## Monetization Models`,
    ``,
    ...o.monetizationModels.map((m) => `- **${m.model}** _(${m.prevalence}%)_ — ${m.examples.join(", ")}`),
    ``,
    `## Willingness to Pay`,
    ``,
    `| Segment | Estimate | Confidence |`,
    `|---------|----------|------------|`,
    ...o.willingnessToPay.map((w) => `| ${w.segment} | ${fmtMoney(w.estimate)}/period | ${confidence(w.confidence)} |`),
    ``,
    `## Recommendations`,
    ``,
    ...o.recommendations.map((r) => `- **${r.tier}:** ${fmtMoney(r.price)} — _${r.rationale}_`),
    ``,
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

function formatChannelScout(o: ChannelScoutOutput): string {
  return [
    `# 🚀 ${AGENT_TITLE["channel-scout"]}`,
    ``,
    `> ${o.summary}`,
    ``,
    `## Recommended Channels`,
    ``,
    ...o.recommendedChannels.map((r) => `- **${r.channel}** _(${r.priority} priority)_ — ${r.why}`),
    ``,
    `## All Channels`,
    ``,
    ...o.channels.map((c) => `- **${c.name}** _(${c.category})_ — ${c.audience}; _${c.reach} reach, ${c.cost} cost, ${c.effectiveness} effectiveness_`),
    ``,
    `## Community Hubs`,
    ``,
    ...o.communityHubs.map((h) => `- **${h.name}** on ${h.platform} (${h.size}) — ${h.focus}${h.url ? ` [link](${h.url})` : ""}`),
    ``,
    `## Content Topics`,
    ``,
    `| Topic | Volume | Competition |`,
    `|-------|--------|-------------|`,
    ...o.contentTopics.map((t) => `| ${t.topic} | ${t.searchVolume} | ${t.competition} |`),
    ``,
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

function formatSynthesis(o: SynthesisOutput): string {
  return [
    `# 🧠 ${AGENT_TITLE.synthesis}`,
    ``,
    `> ${o.execSummary}`,
    ``,
    `## Scores`,
    ``,
    `- **Opportunity Score:** ${o.opportunityScore}/100`,
    `- **Risk Score:** ${o.riskScore}/100`,
    ``,
    `## Top 3 Opportunities`,
    ``,
    ...o.topThreeOpportunities.map((opp, i) => `**${i + 1}. ${opp.title}** — ${opp.description}\n\n_Rationale:_ ${opp.rationale}`),
    ``,
    `## Top 3 Risks`,
    ``,
    ...o.topThreeRisks.map((r, i) => `**${i + 1}. ${r.title}** — ${r.description}\n\n_Mitigation:_ ${r.mitigation}`),
    ``,
    `## Key Insights`,
    ``,
    ...o.keyInsights.map((ins) => `- ${ins.insight} _(${ins.supportingAgents.join(", ")})_ ${confidence(ins.confidence)}`),
    ``,
    `## Recommended Next Step`,
    ``,
    o.recommendedNextStep,
    ``,
    o.citations.length > 0 ? `## Sources\n\n${o.citations.map((c, i) => `${i + 1}. [${c.title}](${c.url || "#"}) ${confidence(c.confidence)} — _${c.snippet}_`).join("\n")}\n` : "",
  ].filter(Boolean).join("\n");
}

export function generateAgentMarkdown(agentId: AgentId, output: AgentOutput): string {
  switch (output.agent) {
    case "market-sizer": return formatMarketSizer(output);
    case "competitor-analyst": return formatCompetitorAnalyst(output);
    case "pain-detective": return formatPainDetective(output);
    case "pricing-scout": return formatPricingScout(output);
    case "channel-scout": return formatChannelScout(output);
    case "synthesis": return formatSynthesis(output);
  }
}

export function getAgentTitle(agentId: AgentId): string {
  return AGENT_TITLE[agentId];
}
