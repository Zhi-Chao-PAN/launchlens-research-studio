// Markdown formatter for research reports
// Produces a clean, complete Markdown report covering all 6 agents
// with evidence, confidence levels, and LaunchLens import instructions.

import type {
  AgentId,
  AgentOutput,
  MarketSizerOutput,
  CompetitorAnalystOutput,
  PainDetectiveOutput,
  PricingScoutOutput,
  ChannelScoutOutput,
  SynthesisOutput,
  SourceCitation,
} from "@/lib/schema/research-schema";

const AGENT_TITLE: Record<AgentId, string> = {
  "market-sizer": "Market Sizer",
  "competitor-analyst": "Competitor Analyst",
  "pain-detective": "Pain Detective",
  "pricing-scout": "Pricing Scout",
  "channel-scout": "Channel Scout",
  synthesis: "Synthesis",
};

const AGENT_ORDER: AgentId[] = [
  "market-sizer",
  "competitor-analyst",
  "pain-detective",
  "pricing-scout",
  "channel-scout",
  "synthesis",
];

function fmtMoney(value: number, currency: string = "USD"): string {
  const sym = currency === "USD" ? "$" : currency + " ";
  if (value >= 1_000_000_000) return `${sym}${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(0)}`;
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function confidenceBadge(level: "low" | "medium" | "high"): string {
  const map = { low: "🔴 Low", medium: "🟡 Medium", high: "🟢 High" };
  return map[level];
}

function formatCitations(citations: SourceCitation[]): string {
  if (!citations || citations.length === 0) return "_No citations_\n";
  return citations
    .map((c, i) => {
      const url = c.url ? ` — [link](${c.url})` : "";
      return `${i + 1}. **${c.title}**${url} _(${confidenceBadge(c.confidence)})_\n   > ${c.snippet}`;
    })
    .join("\n\n");
}

function formatMarketSizer(o: MarketSizerOutput): string {
  const m = o.marketSize;
  return [
    `### Market Size Estimate\n`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| TAM | ${fmtMoney(m.tam, m.currency)} |`,
    `| SAM | ${fmtMoney(m.sam, m.currency)} |`,
    `| SOM (3yr) | ${fmtMoney(m.som, m.currency)} |`,
    `| Growth Rate | ${fmtPercent(m.growthRate)}/yr (${m.growthTrend}) |`,
    `| Unit | ${m.unit} |`,
    `| Confidence | ${confidenceBadge(m.confidence)} |`,
    ``,
    `### Key Trends\n`,
    ...o.keyTrends.map((t) => {
      const icon = t.impact === "positive" ? "📈" : t.impact === "negative" ? "📉" : "➡️";
      return `- ${icon} **${t.trend}**\n  _Evidence:_ ${t.evidence}`;
    }),
    ``,
    `### Target Segments\n`,
    ...o.targetSegments.map((s) => `- **${s.name}** (~${fmtMoney(s.size, m.currency)}): ${s.description}`),
    ``,
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatCompetitorAnalyst(o: CompetitorAnalystOutput): string {
  return [
    `### Competitive Landscape\n`,
    ...o.competitors.map((c) => {
      const url = c.url ? ` (${c.url})` : "";
      return [
        `#### ${c.name}${url}`,
        `> ${c.tagline}`,
        ``,
        `- **Positioning:** ${c.positioning}`,
        `- **Pricing:** ${fmtMoney(c.pricing.min, c.pricing.currency)}–${fmtMoney(c.pricing.max, c.pricing.currency)} (${c.pricing.model})`,
        c.marketShare !== undefined ? `- **Market Share:** ${fmtPercent(c.marketShare)}` : null,
        `- **Differentiation:** ${c.differentiation}`,
        ``,
        `**Strengths:**`,
        ...c.strengths.map((s) => `  - ${s}`),
        ``,
        `**Weaknesses:**`,
        ...c.weaknesses.map((w) => `  - ${w}`),
        ``,
      ].filter(Boolean).join("\n");
    }),
    `### Market Gaps\n`,
    ...o.gaps.map((g) => `- **${g.gap}** _(${g.difficulty} difficulty)_\n  _Opportunity:_ ${g.opportunity}`),
    ``,
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatPainDetective(o: PainDetectiveOutput): string {
  return [
    `### User Pain Points\n`,
    ...o.painPoints.map((p) => {
      const sev = p.severity === "critical" ? "🔴" : p.severity === "significant" ? "🟡" : "⚪";
      const freq = p.frequency === "common" ? "common" : p.frequency === "occasional" ? "occasional" : "rare";
      return [
        `#### ${sev} ${p.pain} _(${freq}, ${p.severity})_`,
        ...p.quotes.map((q) => `> "${q.text}" — _${q.source}_`),
        ``,
        `**Affected segments:** ${p.userSegments.join(", ")}`,
        ``,
      ].join("\n");
    }),
    `### Unmet Needs\n`,
    ...o.unmetNeeds.map((u) => `- **${u.need}**\n  _Why unmet:_ ${u.whyUnmet}\n  _Opportunity:_ ${u.opportunity}`),
    ``,
    `### User Personas\n`,
    ...o.userPersonas.map((p) => [
      `#### ${p.name} — _${p.role}_`,
      `**Goals:**`,
      ...p.goals.map((g) => `  - ${g}`),
      `**Frustrations:**`,
      ...p.frustrations.map((f) => `  - ${f}`),
      ``,
    ].join("\n")),
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatPricingScout(o: PricingScoutOutput): string {
  return [
    `### Price Bands\n`,
    `| Band | Range | Typical |`,
    `|------|-------|---------|`,
    ...o.priceBands.map((b) => `| ${b.name} | ${fmtMoney(b.min, b.currency)}–${fmtMoney(b.max, b.currency)} | ${fmtMoney(b.typical, b.currency)} |`),
    ``,
    `### Monetization Models\n`,
    ...o.monetizationModels.map((m) => `- **${m.model}** _(${fmtPercent(m.prevalence)} prevalence)_\n  _Examples:_ ${m.examples.join(", ")}`),
    ``,
    `### Willingness to Pay by Segment\n`,
    `| Segment | Estimate | Confidence |`,
    `|---------|----------|------------|`,
    ...o.willingnessToPay.map((w) => `| ${w.segment} | ${fmtMoney(w.estimate)}/period | ${confidenceBadge(w.confidence)} |`),
    ``,
    `### Recommendations\n`,
    ...o.recommendations.map((r) => `- **${r.tier}:** ${fmtMoney(r.price)} — _${r.rationale}_`),
    ``,
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatChannelScout(o: ChannelScoutOutput): string {
  return [
    `### Recommended Channels\n`,
    `| Channel | Priority | Rationale |`,
    `|---------|----------|-----------|`,
    ...o.recommendedChannels.map((c) => `| ${c.channel} | ${c.priority} | ${c.why} |`),
    ``,
    `### Channel Landscape\n`,
    ...o.channels.map((c) => {
      const eff = c.effectiveness === "high" ? "🟢" : c.effectiveness === "medium" ? "🟡" : c.effectiveness === "low" ? "🔴" : "⚪";
      return `- ${eff} **${c.name}** _(${c.category}, ${c.reach} reach, ${c.cost} cost)_\n  _Audience:_ ${c.audience}\n  _Platforms:_ ${c.keyPlatforms.join(", ")}\n  ${c.notes}`;
    }),
    ``,
    `### Community Hubs\n`,
    ...o.communityHubs.map((h) => {
      const url = h.url ? ` (${h.url})` : "";
      return `- **${h.name}** on ${h.platform} _(${h.size})_ — ${h.focus}${url}`;
    }),
    ``,
    `### Content Topics\n`,
    `| Topic | Search Volume | Competition |`,
    `|-------|---------------|-------------|`,
    ...o.contentTopics.map((t) => `| ${t.topic} | ${t.searchVolume} | ${t.competition} |`),
    ``,
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatSynthesis(o: SynthesisOutput): string {
  return [
    `### Executive Summary\n\n${o.execSummary}\n`,
    `### Scores\n`,
    `- **Opportunity Score:** ${o.opportunityScore}/100`,
    `- **Risk Score:** ${o.riskScore}/100`,
    ``,
    `### Top 3 Opportunities\n`,
    ...o.topThreeOpportunities.map((opp, i) => [
      `**${i + 1}. ${opp.title}**`,
      `> ${opp.description}`,
      ``,
      `_Rationale:_ ${opp.rationale}`,
      ``,
    ].join("\n")),
    `### Top 3 Risks\n`,
    ...o.topThreeRisks.map((risk, i) => [
      `**${i + 1}. ${risk.title}**`,
      `> ${risk.description}`,
      ``,
      `_Mitigation:_ ${risk.mitigation}`,
      ``,
    ].join("\n")),
    `### Key Insights\n`,
    ...o.keyInsights.map((ins) => {
      const agents = ins.supportingAgents.map((a) => AGENT_TITLE[a]).join(", ");
      return `- ${ins.insight}\n  _Supporting agents:_ ${agents} · ${confidenceBadge(ins.confidence)}`;
    }),
    ``,
    `### Recommended Next Step\n\n${o.recommendedNextStep}\n`,
    `### LaunchLens Import Brief\n`,
    `<details><summary>Click to expand importable brief</summary>\n\n\`\`\`\n${o.launchlensBrief}\n\`\`\`\n\n</details>`,
    `### Citations\n${formatCitations(o.citations)}`,
  ].join("\n");
}

function formatAgent(agentId: AgentId, output: AgentOutput): string {
  const title = AGENT_TITLE[agentId];
  const summary = (output as { summary?: string }).summary;
  let body = "";
  switch (output.agent) {
    case "market-sizer": body = formatMarketSizer(output); break;
    case "competitor-analyst": body = formatCompetitorAnalyst(output); break;
    case "pain-detective": body = formatPainDetective(output); break;
    case "pricing-scout": body = formatPricingScout(output); break;
    case "channel-scout": body = formatChannelScout(output); break;
    case "synthesis": body = formatSynthesis(output); break;
  }
  return [`## ${title}`, summary ? `\n> ${summary}\n` : "", body].join("\n");
}

export interface MarkdownExportOptions {
  sessionId: string;
  query: string;
  keywords: string[];
  outputs: Record<AgentId, AgentOutput | null>;
  generatedAt?: Date;
  includeTableOfContents?: boolean;
  personalNotes?: {
    personalNote: string;
    tags: string[];
    rating: number;
    isStarred: boolean;
    updatedAt?: number;
  };
}

export function generateMarkdownReport(opts: MarkdownExportOptions): string {
  const { sessionId, query, keywords, outputs, includeTableOfContents = true, personalNotes } = opts;
  const generatedAt = (opts.generatedAt ?? new Date()).toISOString();
  const completedAgents = AGENT_ORDER.filter((id) => outputs[id] !== null);

  const lines: string[] = [];
  lines.push(`# Market Research Report`);
  lines.push(``);
  lines.push(`**Generated by** LaunchLens Research Studio  `);
  lines.push(`**Generated at** ${generatedAt}  `);
  lines.push(`**Session ID** \`${sessionId}\`  `);
  lines.push(`**Agents completed** ${completedAgents.length}/6`);
  lines.push(``);
  lines.push(`## Research Brief`);
  lines.push(``);
  lines.push(`**Query:** ${query}`);
  if (keywords.length > 0) {
    lines.push(``);
    lines.push(`**Keywords:** ${keywords.map((k) => `\`${k}\``).join(", ")}`);
  }
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  if (includeTableOfContents) {
    lines.push(`## Table of Contents`);
    lines.push(``);
    for (const id of completedAgents) {
      lines.push(`- [${AGENT_TITLE[id]}](#${AGENT_TITLE[id].toLowerCase().replace(/\s+/g, "-")})`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  if (personalNotes) {
    lines.push(`## Personal Notes`);
    lines.push(``);
    if (personalNotes.tags && personalNotes.tags.length > 0) {
      lines.push(`**Tags:** ${personalNotes.tags.map((t) => `\`${t}\``).join(', ')}`);
      lines.push(``);
    }
    if (personalNotes.rating > 0) {
      const stars = '★'.repeat(personalNotes.rating) + '☆'.repeat(5 - personalNotes.rating);
      lines.push(`**Rating:** ${stars} (${personalNotes.rating}/5)`);
      lines.push(``);
    }
    if (personalNotes.isStarred) {
      lines.push(`**Starred:** ⭐ Yes`);
      lines.push(``);
    }
    if (personalNotes.personalNote && personalNotes.personalNote.trim()) {
      lines.push(personalNotes.personalNote);
      lines.push(``);
    } else {
      lines.push(`_No personal notes yet._`);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  for (const id of completedAgents) {
    const output = outputs[id];
    if (!output) continue;
    lines.push(formatAgent(id, output));
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  lines.push(``);
  lines.push(`## How to use this report`);
  lines.push(``);
  lines.push(`- **Import into LaunchLens AI:** Use the "Copy LaunchLens brief" button, then paste it into launchlens-ai's GTM strategy generator.`);
  lines.push("- **Share with team:** Export as Markdown (.md) for Notion / GitHub / Slack, or JSON for downstream tooling.");
  lines.push(`- **Verify claims:** Every claim is backed by citations. Click through to sources to confirm before major decisions.`);
  lines.push(``);
  lines.push(`_This report was generated by AI agents. Always validate high-stakes assumptions with primary research._`);

  return lines.join("\n");
}

export function generateBriefOnly(outputs: Record<AgentId, AgentOutput | null>): string {
  const synth = outputs["synthesis"] as SynthesisOutput | null;
  if (!synth) return "";
  return [
    `# LaunchLens Import Brief`,
    ``,
    `**Product idea researched:** _(see context below)_`,
    ``,
    `## Opportunity & Risk`,
    ``,
    `- Opportunity Score: ${synth.opportunityScore}/100`,
    `- Risk Score: ${synth.riskScore}/100`,
    ``,
    `## Top Opportunities`,
    ``,
    ...synth.topThreeOpportunities.map((o, i) => `${i + 1}. **${o.title}** — ${o.description}\n   _Rationale:_ ${o.rationale}`),
    ``,
    `## Top Risks`,
    ``,
    ...synth.topThreeRisks.map((r, i) => `${i + 1}. **${r.title}** — ${r.description}\n   _Mitigation:_ ${r.mitigation}`),
    ``,
    `## Recommended Next Step`,
    ``,
    synth.recommendedNextStep,
    ``,
    `## Agent Consensus Brief`,
    ``,
    synth.launchlensBrief,
  ].join("\n");
}
