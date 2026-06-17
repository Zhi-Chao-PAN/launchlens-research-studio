"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/utils/date-utils";
import { FolderSidebar } from "@/components/folders/FolderSidebar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getFolder } from "@/lib/research/folders";
import { DataManager } from "@/components/data/DataManager";

interface HistoryRun {
  id: string;
  query: string;
  keywords: string[];
  status: string;
  createdAt: number;
  durationMs: number;
  opportunityScore?: number;
  riskScore?: number;
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string>("");

  const loadRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/research/runs?limit=100");
      if (res.ok) {
        const data = await res.json();
        let allRuns = data.runs || [];

        if (selectedFolder) {
          const folder = getFolder(selectedFolder);
          if (folder) {
            allRuns = allRuns.filter((r: HistoryRun) =>
              folder.runIds.includes(r.id),
            );
          }
        }

        setRuns(allRuns);
      }
    } catch (e) {
      console.error("Failed to load runs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadRuns);
  }, [selectedFolder]);

  useEffect(() => {
    if (selectedFolder) {
      const folder = getFolder(selectedFolder);
      void Promise.resolve().then(() => { setFolderName(folder?.name || ""); })
    } else {
      void Promise.resolve().then(() => { setFolderName(""); })
    }
  }, [selectedFolder, runs.length]);

  return (
    <div className="history-page">
      <SiteHeader />
      <div className="history-layout">
        <FolderSidebar
          selectedFolderId={selectedFolder}
          onSelectFolder={setSelectedFolder}
        />

        <div className="history-content">
          <DataManager />
          <header className="history-header">
            <div>
              <h1 className="history-title">
                {selectedFolder ? folderName : "Research History"}
              </h1>
              <p className="history-subtitle">
                {selectedFolder
                  ? "Research in this folder"
                  : "All research records"}
                {runs.length > 0 && (
                  <>
                    {" "}
                    <span className="history-count">{runs.length} results</span>
                  </>
                )}
              </p>
            </div>
            <Link href="/" className="btn btn-primary">
              + New Research
            </Link>
          </header>

          {loading ? (
            <div className="history-loading">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="history-empty">
              <div className="history-empty-icon">馃摥</div>
              <h3>No research yet</h3>
              <p>
                {selectedFolder
                  ? "This folder is empty"
                  : "Start your first research project"}
              </p>
              <Link href="/" className="btn btn-primary">
                Start Research
              </Link>
            </div>
          ) : (
            <div className="history-list">
              {runs.map((run) => (
                <Link
                  key={run.id}
                  href={"/research/" + run.id}
                  className={"history-item status-" + run.status}
                >
                  <div className="history-item-main">
                    <h3 className="history-item-query">{run.query}</h3>
                    {run.keywords.length > 0 && (
                      <div className="history-item-keywords">
                        {run.keywords.slice(0, 3).map((kw) => (
                          <span key={kw} className="history-kw-tag">
                            {kw}
                          </span>
                        ))}
                        {run.keywords.length > 3 && (
                          <span className="history-kw-more">
                            +{run.keywords.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="history-item-meta">
                    <span className="history-status">{run.status}</span>
                    <span className="history-date">
                      {formatDistanceToNow(run.createdAt)}
                    </span>
                    {run.opportunityScore !== undefined && (
                      <span className="history-score">
                        Opportunity {run.opportunityScore}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
