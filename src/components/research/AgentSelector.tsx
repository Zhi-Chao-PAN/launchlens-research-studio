"use client";

import { useState } from "react";
import { getAllAgents, getSelectedAgentId, setSelectedAgentId } from "@/lib/research/agent-personas";

interface AgentSelectorProps {
  selected: string;
  onSelect: (agentId: string) => void;
}

export function AgentSelector({ selected, onSelect }: AgentSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const agents = getAllAgents();
  const current = agents.find((a) => a.id === selected) || agents[0];

  return (
    <div className="agent-selector">
      <button
        className="agent-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="agent-icon">{current?.icon}</span>
        <span className="agent-name">{current?.name}</span>
        <span className="agent-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <>
          <div className="agent-selector-backdrop" onClick={() => setIsOpen(false)} />
          <div className="agent-dropdown" role="listbox">
            <div className="agent-dropdown-header">
              选择研究风格
            </div>
            <div className="agent-dropdown-list">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={`agent-option ${agent.id === selected ? "selected" : ""}`}
                  onClick={() => {
                    onSelect(agent.id);
                    setIsOpen(false);
                  }}
                  role="option"
                  aria-selected={agent.id === selected}
                >
                  <span className="agent-option-icon">{agent.icon}</span>
                  <div className="agent-option-info">
                    <div className="agent-option-name">{agent.name}</div>
                    <div className="agent-option-desc">{agent.description}</div>
                  </div>
                  {agent.id === selected && (
                    <span className="agent-option-check">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Helper hook for client components
let _agentCache: string | null = null;

export function useAgentSelection(): [string, (id: string) => void] {
  const [selected, setSelected] = useState(() => {
    if (_agentCache) return _agentCache;
    if (typeof localStorage !== "undefined") {
      return getSelectedAgentId();
    }
    return "analyst";
  });

  const handleSelect = (id: string) => {
    setSelected(id);
    _agentCache = id;
    setSelectedAgentId(id);
  };

  return [selected, handleSelect];
}
