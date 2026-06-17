"use client";

import { useState, useRef, useEffect } from "react";
import { exportAsMarkdown, exportAsJSON, exportAsText } from "@/lib/research/export-utils";
import type { ResearchRun } from "@/lib/research/storage";
import type { SynthesisOutput } from "@/lib/research/synthesis-parser";

interface ExportMenuProps {
  run: ResearchRun;
  synthesis: SynthesisOutput | null;
}

export function ExportMenu({ run, synthesis }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const handleExport = (format: "md" | "json" | "txt" | "print") => {
    if (!synthesis && format !== "json") return;

    switch (format) {
      case "md":
        if (synthesis) exportAsMarkdown(run, synthesis);
        break;
      case "json":
        exportAsJSON(run);
        break;
      case "txt":
        if (synthesis) exportAsText(run, synthesis);
        break;
      case "print":
        window.print();
        break;
    }
    
    setIsOpen(false);
  };

  return (
    <div className="export-menu" ref={menuRef}>
      <button
        className="result-action"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span>📤</span>
        <span>导出</span>
        <span className="export-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="export-dropdown" role="menu">
          <button
            className="export-option"
            onClick={() => handleExport("md")}
            disabled={!synthesis}
            role="menuitem"
          >
            <span className="export-option-icon">📝</span>
            <div className="export-option-info">
              <div className="export-option-label">Markdown</div>
              <div className="export-option-desc">适合 Notion、Obsidian</div>
            </div>
          </button>
          <button
            className="export-option"
            onClick={() => handleExport("json")}
            role="menuitem"
          >
            <span className="export-option-icon">📄</span>
            <div className="export-option-info">
              <div className="export-option-label">JSON</div>
              <div className="export-option-desc">结构化数据</div>
            </div>
          </button>
          <button
            className="export-option"
            onClick={() => handleExport("txt")}
            disabled={!synthesis}
            role="menuitem"
          >
            <span className="export-option-icon">📃</span>
            <div className="export-option-info">
              <div className="export-option-label">纯文本</div>
              <div className="export-option-desc">无格式纯文本</div>
            </div>
          </button>
          <div className="export-divider" />
          <button
            className="export-option"
            onClick={() => handleExport("print")}
            role="menuitem"
          >
            <span className="export-option-icon">🖨️</span>
            <div className="export-option-info">
              <div className="export-option-label">打印 / 存为 PDF</div>
              <div className="export-option-desc">用浏览器打印为 PDF</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
