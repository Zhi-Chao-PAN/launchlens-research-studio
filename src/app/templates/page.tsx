"use client";

import { SiteHeader } from "@/components/layout/SiteHeader";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type ResearchTemplate,
} from "@/lib/research/templates";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    query: "",
    keywords: "",
  });

  const refresh = useCallback(() => {
    setTemplates(listTemplates());
  }, []);

  useEffect(() => {
    // Queue as microtask to avoid synchronous setState in effect
    void Promise.resolve().then(refresh);
  }, [refresh]);

  function handleUseTemplate(tpl: ResearchTemplate) {
    // Build a URL to prefill the home page
    const params = new URLSearchParams();
    if (tpl.query) params.set("q", tpl.query);
    if (tpl.keywords.length) params.set("k", tpl.keywords.join(","));
    router.push("/?" + params.toString());
  }

  function startEdit(tpl: ResearchTemplate) {
    setEditingId(tpl.id);
    setFormData({
      name: tpl.name,
      description: tpl.description || "",
      query: tpl.query,
      keywords: tpl.keywords.join(", "),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setShowNewForm(false);
    setFormData({ name: "", description: "", query: "", keywords: "" });
  }

  function handleSave() {
    if (!formData.name.trim()) return;

    const keywords = formData.keywords
      .split(/[,，]/)
      .map((k) => k.trim())
      .filter(Boolean);

    if (editingId) {
      updateTemplate(editingId, {
        name: formData.name,
        description: formData.description,
        query: formData.query,
        keywords,
      });
    } else {
      createTemplate({
        name: formData.name,
        description: formData.description,
        query: formData.query,
        keywords,
      });
    }

    cancelEdit();
    refresh();
  }

  function handleDelete(id: string) {
    if (!confirm("确定要删除这个模板吗？")) return;
    deleteTemplate(id);
    refresh();
  }

  function handleExport() {
    const data = JSON.stringify(templates, null, 2);
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
          alert("导入的文件格式不正确");
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
            });
            count++;
          }
        }
        alert(`成功导入 ${count} 个模板`);
        refresh();
      } catch {
        alert("导入失败：文件解析错误");
      }
    };
    reader.readAsText(file);
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString("zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="templates-page">
      <header className="templates-header">
        <div className="templates-header-inner">
          <Link href="/" className="research-back-link">← 返回首页</Link>
          <h1 className="templates-title">研究模板</h1>
          <p className="templates-subtitle">保存常用研究配置，一键启动</p>

          <div className="templates-toolbar">
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowNewForm(true);
                setFormData({ name: "", description: "", query: "", keywords: "" });
              }}
            >
              + 新建模板
            </button>
            <div className="templates-toolbar-right">
              <button className="btn btn-secondary" onClick={handleExport}>
                📤 导出
              </button>
              <label className="btn btn-secondary">
                📥 导入
                <input
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={(e) => handleImport(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
        </div>
      </header>

      <SiteHeader />
      <main className="templates-main">
        {(showNewForm || editingId) && (
          <div className="template-editor">
            <h3>{editingId ? "编辑模板" : "新建模板"}</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>模板名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：市场进入分析"
                  className="form-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label>描述</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简短描述这个模板的用途"
                  className="form-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label>默认研究问题（可选）</label>
                <input
                  type="text"
                  value={formData.query}
                  onChange={(e) => setFormData({ ...formData, query: e.target.value })}
                  placeholder="默认的研究查询问题"
                  className="form-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label>关键词（用逗号分隔）</label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="例如：市场规模, 竞争格局, 用户画像"
                  className="form-input"
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-cancel" onClick={cancelEdit}>取消</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!formData.name.trim()}
              >
                保存
              </button>
            </div>
          </div>
        )}

        {templates.length === 0 && !showNewForm ? (
          <div className="templates-empty">
            <div className="templates-empty-icon">📋</div>
            <h2>还没有模板</h2>
            <p>创建第一个模板，下次研究就能一键启动了</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowNewForm(true)}
            >
              创建第一个模板
            </button>
          </div>
        ) : (
          <div className="templates-list">
            {templates.map((tpl) => (
              <div key={tpl.id} className="template-list-item">
                <div className="template-list-main">
                  <h3 className="template-list-title">{tpl.name}</h3>
                  {tpl.description && (
                    <p className="template-list-desc">{tpl.description}</p>
                  )}
                  <div className="template-list-keywords">
                    {tpl.keywords.length > 0 ? (
                      tpl.keywords.map((kw) => (
                        <span key={kw} className="template-keyword-pill">{kw}</span>
                      ))
                    ) : (
                      <span className="template-no-keywords">无关键词</span>
                    )}
                  </div>
                  <div className="template-list-meta">
                    <span>使用 {tpl.useCount} 次</span>
                    <span>更新于 {formatDate(tpl.updatedAt)}</span>
                  </div>
                </div>
                <div className="template-list-actions">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleUseTemplate(tpl)}
                  >
                    使用
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => startEdit(tpl)}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(tpl.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
