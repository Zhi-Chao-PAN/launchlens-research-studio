"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  getAllTags,
  createTag,
  addTagToRun,
  removeTagFromRun,
  getRunTags,
  getTagDetails,
  // deleteTag reserved for future use
  type RunTag,
} from "@/lib/research/tags";

interface TagListProps {
  runId: string;
  onTagsChange?: () => void;
}

export function TagList({ runId, onTagsChange }: TagListProps) {
  const [revision, setRevision] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
    const [newTagName, setNewTagName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive tag state synchronously from runId + revision counter
  const tagIds = useMemo(() => getRunTags(runId), [runId, revision]);
  const allTags = useMemo(() => getAllTags(), [revision]) as Array<{ id: string; name: string; color?: string }>;

  const refresh = () => setRevision((r) => r + 1);

  useEffect(() => {
    if (showAdd && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showAdd]);

  const tagDetails = getTagDetails(tagIds);

  const handleAddTag = (tagId: string) => {
    addTagToRun(runId, tagId);
    refresh();
    setShowAdd(false);
    setNewTagName("");
    onTagsChange?.();
  };

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    const tag = createTag(name);
    handleAddTag(tag.id);
    setRevision(r => r + 1);
  };

  const handleRemoveTag = (tagId: string) => {
    removeTagFromRun(runId, tagId);
    refresh();
    onTagsChange?.();
  };

  // Available tags (not already on this run)
  const availableTags = allTags.filter((t) => !tagIds.includes(t.id));

  return (
    <div className="tag-list">
      <div className="tag-list-header">
        <h4 className="tag-list-title">Tags</h4>
        <button
          type="button"
          className="tag-add-btn"
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {tagDetails.length === 0 && !showAdd && (
        <p className="tag-empty">No tags yet</p>
      )}

      {tagDetails.length > 0 && (
        <div className="tag-chips">
          {tagDetails.map((tag) => (
            <span
              key={tag.id}
              className="tag-chip"
              style={{ background: tag.color + "20", color: tag.color, borderColor: tag.color + "40" }}
            >
              {tag.name}
              <button
                type="button"
                className="tag-chip-remove"
                onClick={() => handleRemoveTag(tag.id)}
                aria-label={"Remove tag " + tag.name}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="tag-add-panel">
          {availableTags.length > 0 && (
            <div className="tag-suggestions">
              <p className="tag-suggestions-label">Existing tags:</p>
              <div className="tag-suggestions-list">
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className="tag-suggestion"
                    style={{ background: tag.color + "15", color: tag.color, borderColor: tag.color + "30" }}
                    onClick={() => handleAddTag(tag.id)}
                  >
                    + {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tag-create">
            <input
              ref={inputRef}
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateTag();
              }}
              placeholder="Create new tag..."
              className="tag-input"
            />
            <button
              type="button"
              className="tag-create-btn"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TagList;
