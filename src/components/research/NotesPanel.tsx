"use client";

import { useState, useEffect } from "react";
import {
  getNotes,
  savePersonalNote,
  toggleStar,
  setRating,
  addTag,
  removeTag,
  type ResearchNotes,
} from "@/lib/research/notes";
import { useHotkey } from "@/lib/hooks/use-hotkey";

interface NotesPanelProps {
  runId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function NotesPanel({ runId, isOpen, onClose }: NotesPanelProps) {
  const [notes, setNotes] = useState<ResearchNotes | null>(null);
  const [noteText, setNoteText] = useState("");
  const [newTag, setNewTag] = useState("");

  // Load notes on mount / runId change
  useEffect(() => {
    // Queue as microtask to avoid synchronous setState in effect
    void Promise.resolve().then(() => {
      const n = getNotes(runId);
      setNotes(n);
      setNoteText(n?.personalNote || "");
    });
  }, [runId, isOpen]);

  // Save note with debounce
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      if (noteText !== (notes?.personalNote || "")) {
        savePersonalNote(runId, noteText);
        setNotes(getNotes(runId));
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [noteText, runId, isOpen, notes?.personalNote]);

  // Close with Escape
  useHotkey({ key: "Escape", handler: onClose, ignoreInputs: false }, [isOpen, onClose]);

  const handleStar = () => {
    const starred = toggleStar(runId);
    setNotes({ ...getNotes(runId)!, isStarred: starred });
  };

  const handleRating = (rating: number) => {
    setRating(runId, rating);
    setNotes({ ...getNotes(runId)!, rating });
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    addTag(runId, newTag.trim());
    setNotes(getNotes(runId));
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    removeTag(runId, tag);
    setNotes(getNotes(runId));
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="notes-overlay" onClick={onClose} />
      <aside className="notes-panel">
        <div className="notes-panel-header">
          <h2>📝 我的笔记</h2>
          <button className="notes-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="notes-panel-body">
          <div className="notes-actions">
            <button
              className={`notes-star ${notes?.isStarred ? "starred" : ""}`}
              onClick={handleStar}
              aria-label={notes?.isStarred ? "取消收藏" : "收藏"}
            >
              {notes?.isStarred ? "⭐ 已收藏" : "☆ 收藏"}
            </button>
            <div className="notes-rating" title="评分">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`rating-star ${n <= (notes?.rating || 0) ? "filled" : ""}`}
                  onClick={() => handleRating(n)}
                  aria-label={`${n} 星`}
                >
                  {n <= (notes?.rating || 0) ? "★" : "☆"}
                </button>
              ))}
            </div>
          </div>

          <div className="notes-section">
            <h3 className="notes-section-title">个人笔记</h3>
            <textarea
              className="notes-textarea"
              placeholder="记录你的想法、后续行动、灵感..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={8}
            />
            <div className="notes-save-hint">自动保存</div>
          </div>

          <div className="notes-section">
            <h3 className="notes-section-title">标签</h3>
            <form className="notes-tag-form" onSubmit={handleAddTag}>
              <input
                type="text"
                className="notes-tag-input"
                placeholder="添加标签..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-primary">
                添加
              </button>
            </form>
            <div className="notes-tags-list">
              {notes?.tags.length === 0 && (
                <span className="notes-empty">暂无标签</span>
              )}
              {notes?.tags.map((tag) => (
                <span key={tag} className="notes-tag">
                  {tag}
                  <button
                    className="notes-tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`移除标签 ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="notes-section">
            <h3 className="notes-section-title">高亮与标注</h3>
            <p className="notes-empty-small">
              在研究报告中选中文本即可高亮并添加备注
            </p>
          </div>

          <div className="notes-meta">
            {notes?.lastOpenedAt && (
              <span>最后打开: {new Date(notes.lastOpenedAt).toLocaleString("zh-CN")}</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
