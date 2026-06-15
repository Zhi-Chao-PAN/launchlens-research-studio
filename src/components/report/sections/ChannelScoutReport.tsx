import type { ChannelScoutOutput } from "@/lib/schema/research-schema";

const categoryColors: Record<string, string> = {
  social: "bg-blue-100 text-blue-700",
  community: "bg-violet-100 text-violet-700",
  content: "bg-emerald-100 text-emerald-700",
  paid: "bg-amber-100 text-amber-700",
  partnership: "bg-rose-100 text-rose-700",
  direct: "bg-slate-100 text-slate-700",
};

export function ChannelScoutReport({ output }: { output: any }) {
  const data = output as ChannelScoutOutput;
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-xl p-5">
        <h3 className="font-semibold text-slate-800 mb-2">Summary</h3>
        <p className="text-sm text-slate-600 leading-relaxed">{data.summary}</p>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Recommended Channels</h3>
        <div className="space-y-2">
          {data.recommendedChannels.map((rec: any, i: number) => (
            <div
              key={i}
              className={`p-3 rounded-lg border ${
                rec.priority === "high"
                  ? "bg-emerald-50 border-emerald-200"
                  : rec.priority === "medium"
                  ? "bg-amber-50 border-amber-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">{rec.channel}</p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    rec.priority === "high"
                      ? "bg-emerald-200 text-emerald-800"
                      : rec.priority === "medium"
                      ? "bg-amber-200 text-amber-800"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {rec.priority} priority
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{rec.why}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">All Channels</h3>
        <div className="space-y-2">
          {data.channels.map((channel, i) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800">{channel.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[channel.category]}`}>
                  {channel.category}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{channel.notes}</p>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="text-slate-500">Cost: {channel.cost}</span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500">Reach: {channel.reach}</span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500">Effectiveness: {channel.effectiveness}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Community Hubs</h3>
        <div className="grid grid-cols-2 gap-2">
          {data.communityHubs.map((hub: any, i: number) => (
            <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
              <p className="text-sm font-semibold text-slate-800">{hub.name}</p>
              <p className="text-xs text-slate-500">{hub.platform} • {hub.size}</p>
              <p className="text-xs text-slate-400 mt-1">{hub.focus}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-3">Content Topics</h3>
        <div className="flex flex-wrap gap-2">
          {data.contentTopics.map((topic: any, i: number) => (
            <div
              key={i}
              className="px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: topic.competition === "high" ? "#fee2e2" : topic.competition === "medium" ? "#fef3c7" : "#dcfce7",
                color: topic.competition === "high" ? "#991b1b" : topic.competition === "medium" ? "#92400e" : "#166534",
              }}
            >
              {topic.topic}
              <span className="ml-1 opacity-70">({topic.searchVolume} vol)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
