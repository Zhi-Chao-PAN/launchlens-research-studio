"use client";

import { useState, useRef } from "react";
import {
  createDataPackage,
  validateDataPackage,
  getExportFilename,
  estimatePackageSize,
  type DataPackage,
  type ImportResult,
  type ImportMergeStrategy,
} from "@/lib/research/data-import-export";
import { getAllNotes, bulkImportNotes } from "@/lib/research/notes";
import { getFolders, bulkImportFolders } from "@/lib/research/folders";
import { listTemplates, bulkImportTemplates } from "@/lib/research/templates";
import type { ResearchRun } from "@/lib/research/storage";

interface ExportOptions {
  includeRuns: boolean;
  includeNotes: boolean;
  includeFolders: boolean;
  includeTemplates: boolean;
}

export function DataManager() {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeRuns: true,
    includeNotes: true,
    includeFolders: true,
    includeTemplates: true,
  });
  const [exportSize, setExportSize] = useState<number | null>(null);
  const [importStrategy, setImportStrategy] = useState<ImportMergeStrategy>("merge");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRuns = async (): Promise<ResearchRun[]> => {
    try {
      const res = await fetch("/api/research/runs?limit=1000");
      if (!res.ok) return [];
      const data = await res.json();
      return data.runs || [];
    } catch {
      return [];
    }
  };

  const gatherClientData = () => {
    const notes = exportOptions.includeNotes ? getAllNotes() : [];
    const folders = exportOptions.includeFolders ? getFolders() : [];
    const templates = exportOptions.includeTemplates ? listTemplates() : [];
    return { notes, folders, templates };
  };

  const handleExport = async () => {
    setIsProcessing(true);
    try {
      const runs = exportOptions.includeRuns ? await fetchRuns() : [];
      const { notes, folders, templates } = gatherClientData();

      const pkg = createDataPackage({ runs, notes, folders, templates });
      const json = JSON.stringify(pkg, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getExportFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportSize(estimatePackageSize(pkg));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEstimate = async () => {
    setIsProcessing(true);
    try {
      const runs = exportOptions.includeRuns ? await fetchRuns() : [];
      const { notes, folders, templates } = gatherClientData();
      const pkg = createDataPackage({ runs, notes, folders, templates });
      setExportSize(estimatePackageSize(pkg));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const pkg = JSON.parse(text) as DataPackage;

      const errors = validateDataPackage(pkg);
      if (errors.length > 0) {
        setImportError("Invalid backup file: " + errors.join(", "));
        return;
      }

      const result: ImportResult = {
        imported: { runs: 0, notes: 0, folders: 0, templates: 0 },
        skipped: { runs: 0, notes: 0, folders: 0, templates: 0 },
        errors,
        totalRuns: 0,
        totalNotes: 0,
        totalFolders: 0,
        totalTemplates: 0,
      };

      // Import runs via API
      if (pkg.data.runs?.length) {
        try {
          const res = await fetch(`/api/data/import?strategy=${importStrategy}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pkg),
          });
          if (res.ok) {
            const data = await res.json();
            result.imported.runs = data.imported ?? 0;
            result.skipped.runs = data.skipped ?? 0;
            result.totalRuns = data.total ?? 0;
          }
        } catch (err) {
          result.errors.push("Run import failed: " + (err instanceof Error ? err.message : String(err)));
        }
      }

      // Import notes locally
      if (pkg.data.notes?.length) {
        try {
          // For notes, use runId as key
          const existingNotes = getAllNotes();
          const existingIds = new Set(existingNotes.map((n) => n.runId));

          if (importStrategy === "overwrite") {
            const count = bulkImportNotes(pkg.data.notes);
            result.imported.notes = count;
            result.totalNotes = count;
          } else if (importStrategy === "skip") {
            const newOnes = pkg.data.notes.filter((n) => !existingIds.has(n.runId));
            const merged = [...existingNotes, ...newOnes];
            const count = bulkImportNotes(merged);
            result.imported.notes = newOnes.length;
            result.skipped.notes = pkg.data.notes.length - newOnes.length;
            result.totalNotes = count;
          } else {
            // merge
            const byId = new Map(existingNotes.map((n) => [n.runId, n]));
            let imported = 0;
            for (const n of pkg.data.notes) {
              if (!byId.has(n.runId)) {
                byId.set(n.runId, n);
                imported++;
              } else {
                const existingTime = byId.get(n.runId)!.updatedAt ?? 0;
                const incomingTime = n.updatedAt ?? 0;
                if (incomingTime > existingTime) {
                  byId.set(n.runId, n);
                  imported++;
                }
              }
            }
            const merged = Array.from(byId.values());
            const count = bulkImportNotes(merged);
            result.imported.notes = imported;
            result.skipped.notes = pkg.data.notes.length - imported;
            result.totalNotes = count;
          }
        } catch (err) {
          result.errors.push("Notes import failed: " + (err instanceof Error ? err.message : String(err)));
        }
      }

      // Import folders locally
      if (pkg.data.folders?.length) {
        try {
          const imported = bulkImportFolders(pkg.data.folders, importStrategy as "merge" | "overwrite");
          result.imported.folders = imported;
          result.totalFolders = getFolders().length;
        } catch (err) {
          result.errors.push("Folders import failed: " + (err instanceof Error ? err.message : String(err)));
        }
      }

      // Import templates locally
      if (pkg.data.templates?.length) {
        try {
          const imported = bulkImportTemplates(pkg.data.templates, importStrategy);
          result.imported.templates = imported;
          result.totalTemplates = listTemplates().length;
        } catch (err) {
          result.errors.push("Templates import failed: " + (err instanceof Error ? err.message : String(err)));
        }
      }

      setImportResult(result);
    } catch (err) {
      setImportError("Failed to parse file: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <div className="data-manager">
      <div className="data-manager-tabs">
        <button
          className={`data-manager-tab ${activeTab === "export" ? "active" : ""}`}
          onClick={() => setActiveTab("export")}
        >
          Export
        </button>
        <button
          className={`data-manager-tab ${activeTab === "import" ? "active" : ""}`}
          onClick={() => setActiveTab("import")}
        >
          Import
        </button>
      </div>

      {activeTab === "export" && (
        <div className="data-manager-panel">
          <p className="data-manager-desc">
            Download all your research data as a backup file.
          </p>

          <div className="data-manager-options">
            <label className="data-manager-option">
              <input
                type="checkbox"
                checked={exportOptions.includeRuns}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, includeRuns: e.target.checked })
                }
              />
              <span>Research runs</span>
            </label>
            <label className="data-manager-option">
              <input
                type="checkbox"
                checked={exportOptions.includeNotes}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, includeNotes: e.target.checked })
                }
              />
              <span>Notes &amp; annotations</span>
            </label>
            <label className="data-manager-option">
              <input
                type="checkbox"
                checked={exportOptions.includeFolders}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, includeFolders: e.target.checked })
                }
              />
              <span>Folders</span>
            </label>
            <label className="data-manager-option">
              <input
                type="checkbox"
                checked={exportOptions.includeTemplates}
                onChange={(e) =>
                  setExportOptions({ ...exportOptions, includeTemplates: e.target.checked })
                }
              />
              <span>Templates</span>
            </label>
          </div>

          <div className="data-manager-actions">
            <button className="btn btn-primary" onClick={handleExport} disabled={isProcessing}>
              {isProcessing ? "Preparing..." : "Download Backup"}
            </button>
            <button className="btn btn-secondary" onClick={handleEstimate} disabled={isProcessing}>
              Estimate Size
            </button>
          </div>

          {exportSize !== null && (
            <p className="data-manager-hint">
              Estimated size: {formatBytes(exportSize)}
            </p>
          )}
        </div>
      )}

      {activeTab === "import" && (
        <div className="data-manager-panel">
          <p className="data-manager-desc">
            Restore data from a backup file.
          </p>

          <div className="data-manager-options">
            <label className="data-manager-label">Merge strategy:</label>
            <select
              className="data-manager-select"
              value={importStrategy}
              onChange={(e) => setImportStrategy(e.target.value as ImportMergeStrategy)}
            >
              <option value="merge">Merge (newer wins)</option>
              <option value="overwrite">Overwrite existing</option>
              <option value="skip">Skip existing</option>
            </select>
          </div>

          <div className="data-manager-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="data-manager-file"
              id="import-file"
              disabled={isProcessing}
            />
            <label htmlFor="import-file" className={`btn btn-primary ${isProcessing ? "disabled" : ""}`}>
              {isProcessing ? "Processing..." : "Choose Backup File"}
            </label>
          </div>

          {importError && (
            <div className="data-manager-error">
              {importError}
            </div>
          )}

          {importResult && (
            <div className="data-manager-result">
              <h4>Import complete</h4>
              <table className="data-manager-result-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Imported</th>
                    <th>Skipped</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Runs</td>
                    <td>{importResult.imported.runs}</td>
                    <td>{importResult.skipped.runs}</td>
                    <td>{importResult.totalRuns}</td>
                  </tr>
                  <tr>
                    <td>Notes</td>
                    <td>{importResult.imported.notes}</td>
                    <td>{importResult.skipped.notes}</td>
                    <td>{importResult.totalNotes}</td>
                  </tr>
                  <tr>
                    <td>Folders</td>
                    <td>{importResult.imported.folders}</td>
                    <td>{importResult.skipped.folders}</td>
                    <td>{importResult.totalFolders}</td>
                  </tr>
                  <tr>
                    <td>Templates</td>
                    <td>{importResult.imported.templates}</td>
                    <td>{importResult.skipped.templates}</td>
                    <td>{importResult.totalTemplates}</td>
                  </tr>
                </tbody>
              </table>
              {importResult.errors.length > 0 && (
                <div className="data-manager-warnings">
                  {importResult.errors.length} issue(s): {importResult.errors.join("; ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}