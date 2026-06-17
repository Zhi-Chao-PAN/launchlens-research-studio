"use client";

import { useState, useEffect } from "react";
import {
  getFolders,
  createFolder,
  deleteFolder,
  addRunToFolder,
  removeRunFromFolder,
  type ResearchFolder,
} from "@/lib/research/folders";

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  runId?: string; // if viewing a specific run
}

export function FolderSidebar({
  selectedFolderId,
  onSelectFolder,
  runId,
}: FolderSidebarProps) {
  const [folders, setFolders] = useState<ResearchFolder[]>([]);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const refresh = () => setFolders(getFolders());

  useEffect(() => {
    void Promise.resolve().then(() => {
      refresh()
    });
  }, []);;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    createFolder({ name: newFolderName.trim() });
    setNewFolderName("");
    setShowNewInput(false);
    refresh();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("ȷ��ɾ������ļ�����������о����ᱻɾ����")) {
      deleteFolder(id);
      if (selectedFolderId === id) {
        onSelectFolder(null);
      }
      refresh();
    }
  };

  // For run-specific view: show which folders this run is in
  if (runId) {
    const runFolders = new Set(
      folders.filter((f) => f.runIds.includes(runId)).map((f) => f.id),
    );

    const toggleFolder = (folderId: string) => {
      if (runFolders.has(folderId)) {
        // Remove
        const folder = folders.find((f) => f.id === folderId);
        if (folder) {
          folder.runIds = folder.runIds.filter((id) => id !== runId);
          removeRunFromFolder(folderId, runId);
        }
      } else {
        addRunToFolder(folderId, runId);
      }
      refresh();
    };

    return (
      <div className="folders-section">
        <h3 className="folders-section-title">�����ļ���</h3>
        <div className="folders-list">
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={
                "folder-item " + (runFolders.has(folder.id) ? "active" : "")
              }
              onClick={() => toggleFolder(folder.id)}
            >
              <span className="folder-icon">{folder.icon}</span>
              <span className="folder-name">{folder.name}</span>
              <span className="folder-count">{folder.runIds.length}</span>
            </button>
          ))}
        </div>
        {showNewInput ? (
          <form className="folder-new-form" onSubmit={handleCreate}>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="�ļ�������..."
              autoFocus
            />
            <button type="submit" className="btn btn-sm btn-primary">
              ����
            </button>
          </form>
        ) : (
          <button
            className="folder-new-btn"
            onClick={() => setShowNewInput(true)}
          >
            + �½��ļ���
          </button>
        )}
      </div>
    );
  }

  // Full sidebar view (for history page)
  return (
    <aside className="folders-sidebar">
      <div className="folders-sidebar-header">
        <h2>?? �ļ���</h2>
      </div>

      <div className="folders-list">
        <button
          className={"folder-item " + (!selectedFolderId ? "active" : "")}
          onClick={() => onSelectFolder(null)}
        >
          <span className="folder-icon">??</span>
          <span className="folder-name">ȫ���о�</span>
        </button>

        {folders.map((folder) => (
          <div key={folder.id} className="folder-item-row">
            <button
              className={
                "folder-item " +
                (selectedFolderId === folder.id ? "active" : "")
              }
              onClick={() => onSelectFolder(folder.id)}
            >
              <span className="folder-icon">{folder.icon}</span>
              <span className="folder-name">{folder.name}</span>
              <span className="folder-count">{folder.runIds.length}</span>
            </button>
            {!folder.isSystem && (
              <button
                className="folder-delete-btn"
                onClick={(e) => handleDelete(folder.id, e)}
                aria-label={"ɾ�� " + folder.name}
              >
                ?
              </button>
            )}
          </div>
        ))}
      </div>

      {showNewInput ? (
        <form className="folder-new-form" onSubmit={handleCreate}>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="�ļ�������..."
            autoFocus
          />
          <button type="submit" className="btn btn-sm btn-primary">
            ����
          </button>
        </form>
      ) : (
        <button
          className="folder-new-btn"
          onClick={() => setShowNewInput(true)}
        >
          + �½��ļ���
        </button>
      )}
    </aside>
  );
}