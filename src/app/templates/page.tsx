"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";
import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultCategories,
  incrementTemplateUse,
  type ResearchTemplate,
} from "@/lib/research/templates";
import { useCommandPalette } from "@/components/command-palette/CommandPaletteContext";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";

type TabType = "gallery" | "my-templates" | "all";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("gallery");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    query: "",
    keywords: "",
    category: "Custom",
  });

  const { registerCommands } = useCommandPalette();
  const categories = useMemo(() => ["All", ...getDefaultCategories()], []);

  // Register template page commands
  useEffect(() => {
    const unregister = registerCommands([
      {
        id: "templates:new",
        label: "New Template",
        description: "Create a new research template",
        icon: "?",
        shortcut: "n",
        category: "action",
        keywords: ["new", "create", "template", "add"],
        action: () => setShowNewForm(true),
      },
      {
        id: "templates:search",
        label: "Search Templates",
        description: "Focus the template search input",
        icon: "??",
        shortcut: "/",
        category: "action",
        keywords: ["search", "find", "filter"],
        action: () => {
          const input = document.querySelector(".template-search input") as HTMLInputElement;
          input?.focus();
        },
      },
      {
        id: "templates:gallery",
        label: "Template Gallery",
        description: "View the template gallery",
        icon: "???",
        shortcut: "g",
        category: "navigation",
        keywords: ["gallery", "browse", "community"],
        action: () => setActiveTab("gallery"),
      },
    ]);

    return unregister;
  }, [registerCommands]);

  // '/' to focus search
  useHotkeys("/", () => {
    const input = document.querySelector(".template-search input") as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  }, { ignoreInputs: true, scope: "templates" });

  // 'n' for new template
  useHotkeys("n", () => setShowNewForm(true), { ignoreInputs: true, scope: "templates" });

  const refresh = useCallback(() => {
    let all = listTemplates();
    
    if (activeTab === "gallery") {
      all = all.filter((t) => t.isDefault);
    } else if (activeTab === "my-templates") {
      all = all.filter((t) => !t.isDefault);
    }
    
    if (selectedCategory !== "All") {
      all = all.filter((t) => t.category === selectedCategory);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      all = all.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          t.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }
    
    setTemplates(all);
  }, [activeTab, selectedCategory, searchQuery]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  function handleUseTemplate(tpl: ResearchTemplate) {
    incrementTemplateUse(tpl.id);
    const params = new URLSearchParams();
    if (tpl.query) params.set("q", tpl.query);
    if (tpl.keywords.length) params.set("k", tpl.keywords.join(","));
    router.push("/?" + params.toString());
  }

  function startEdit(tpl: ResearchTemplate) {
    setEditingId(tpl.id);
    setShowNewForm(false);
    setFormData({
      name: tpl.name,
      description: tpl.description || "",
      query: tpl.query,
      keywords: tpl.keywords.join(", "),
      category: tpl.category || "Custom",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
    setFormData({ name: "", description: "", query: "", keywords: "", category: "Custom" });
  }

  function handleSave() {
    if (!formData.name.trim()) return;

    const keywords = formData.keywords
      .split(/[,?]/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (editingId) {
      updateTemplate(editingId, {
        name: formData.name,
        description: formData.description,
        query: formData.query,
        keywords,
        category: formData.category,
      });
    } else {
      createTemplate({
        name: formData.name,
        description: formData.description,
        query: formData.query,
        keywords,
        category: formData.category,
      });
    }

    cancelEdit();
    refresh();
  }

  function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this template?")) return;
    deleteTemplate(id);
    refresh();
  }

  function handleExport() {
    const all = listTemplates();
    const data = JSON.stringify(all, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "launchlens-templates.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (!Array.isArray(imported)) {
          alert("Invalid template file format");
          return;
        }
        let count = 0;
        for (const tpl of imported) {
          if (tpl.name && Array.isArray(tpl.keywords)) {
            createTemplate({
              name: tpl.name,
              description: tpl.description || "",
              query: tpl.query || "",
              keywords: tpl.keywords,
              category: tpl.category || "Custom",
            });
            count++;
          }
        }
        alert(`Successfully imported ${count} template${count !== 1 ? "s" : ""}`);
        refresh();
      } catch {
        alert("Import failed: invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="templates-page">
      <SiteHeader title="Templates" />

      <main className="templates-main">
        <div className="templates-header-bar">
          <div>
            <h1 className="templates-title">Research Templates</h1>
            <p className="templates-subtitle">
              Jumpstart your research with curated templates or create your own
            </p>
          </div>
          <div className="templates-header-actions">
            <button className="btn btn-secondary" onClick={handleExport}>
              馃摛 Export
            </button>
            <label className="btn btn-secondary">
              馃摜 Import
              <input
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => handleImport(e.target.files?.[0] || null)}
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowNewForm(true);
                setEditingId(null);
                setFormData({ name: "", description: "", query: "", keywords: "", category: "Custom" });
              }}
            >
              + New Template
            </button>
          </div>
        </div>

                {/* Tabs */}
        <div className="templates-tabs">
          {[
            { id: "gallery", label: "Gallery", icon: "🖼️" },
            { id: "my-templates", label: "My Templates", icon: "📁" },
            { id: "all", label: "All", icon: "📋" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`templates-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id as TabType)}
            >
              <span className="templates-tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + category filter */}
        <div className="templates-toolbar">
          <div className="templates-search">
            <span className="templates-search-icon">馃攳</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="templates-search-input"
            />
          </div>
          <div className="templates-categories">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`templates-category-chip ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Editor modal */}
        {(showNewForm || editingId) && (
          <div className="template-editor-modal">
            <div className="template-editor-card">
              <div className="template-editor-header">
                <h3>{editingId ? "Edit Template" : "Create Template"}</h3>
                <button className="template-editor-close" onClick={cancelEdit} aria-label="Close">
                  鉁?                </button>
              </div>
              <div className="form-grid">
                <div className="form-group form-group-full">
                  <label>Template Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Market Entry Analysis"
                    className="form-input"
                  />
                </div>
                <div className="form-group form-group-full">
                  <label>Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Short description of what this template is for"
                    className="form-input"
                  />
                </div>
                <div className="form-group form-group-full">
                  <label>Default Research Query (optional)</label>
                  <input
                    type="text"
                    value={formData.query}
                    onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                    placeholder="Pre-filled research question"
                    className="form-input"
                  />
                </div>
                <div className="form-group form-group-full">
                  <label>Keywords (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="e.g. market size, competitors, user persona"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="form-input"
                  >
                    {getDefaultCategories().map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-cancel" onClick={cancelEdit}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={!formData.name.trim()}
                >
                  {editingId ? "Save Changes" : "Create Template"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="templates-results-info">
          <span>
            {templates.length} template{templates.length !== 1 ? "s" : ""}
            {selectedCategory !== "All" && <> in <strong>{selectedCategory}</strong></>}
            {searchQuery && <> matching &quot;<strong>{searchQuery}</strong>&quot;</>}
          </span>
        </div>

        {/* Template gallery grid */}
        {templates.length === 0 ? (
          <div className="templates-empty">
            <div className="templates-empty-icon">馃搫</div>
            <h2>No templates found</h2>
            <p>
              {searchQuery || selectedCategory !== "All"
                ? "Try clearing your filters or search for something else."
                : activeTab === "my-templates"
                ? "Create your first custom template to save time on repeat research."
                : "No templates available."}
            </p>
            {activeTab === "my-templates" && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowNewForm(true);
                  setFormData({ name: "", description: "", query: "", keywords: "", category: "Custom" });
                }}
              >
                Create Template
              </button>
            )}
          </div>
        ) : (
          <div className="templates-grid">
            {templates.map((tpl) => (
              <div key={tpl.id} className={`template-card ${tpl.isDefault ? "is-default" : "is-custom"}`}>
                <div className="template-card-header">
                  <span className="template-card-category">{tpl.category || "Custom"}</span>
                  {tpl.isDefault && <span className="template-card-badge">Curated</span>}
                </div>
                <h3 className="template-card-title">{tpl.name}</h3>
                <p className="template-card-desc">{tpl.description || "No description"}</p>
                <div className="template-card-keywords">
                  {tpl.keywords.slice(0, 4).map((kw) => (
                    <span key={kw} className="template-kw-chip">{kw}</span>
                  ))}
                  {tpl.keywords.length > 4 && (
                    <span className="template-kw-more">+{tpl.keywords.length - 4} more</span>
                  )}
                </div>
                <div className="template-card-footer">
                  <span className="template-card-uses">
                    {tpl.useCount} use{tpl.useCount !== 1 ? "s" : ""}
                  </span>
                  <div className="template-card-actions">
                    {!tpl.isDefault && (
                      <button
                        className="btn btn-xs btn-secondary"
                        onClick={() => startEdit(tpl)}
                        aria-label="Edit template"
                      >
                        Edit
                      </button>
                    )}
                    {!tpl.isDefault && (
                      <button
                        className="btn btn-xs btn-danger"
                        onClick={() => handleDelete(tpl.id)}
                        aria-label="Delete template"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      className="btn btn-xs btn-primary"
                      onClick={() => handleUseTemplate(tpl)}
                    >
                      Use Template 鈫?                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
