"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  ErrorState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatNumberFa } from "@/lib/formatters";
import {
  FolderTree,
  Plus,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  sortOrder: number;
  isVisible: boolean;
  description: string;
  productCount: number;
}

export default function CategoriesPage() {
  const { can } = useRole();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");
  const [newDesc, setNewDesc] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/catalog/meta", { cache: "no-store" });
      if (!res.ok) throw new Error("خطا در بارگذاری دسته‌بندی‌ها");
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  if (!can("catalog", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مدیریت دسته‌بندی‌ها" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr(null);
    setActionMsg(null);
    if (!newName.trim()) return;
    const res = await fetch("/api/catalog/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        name: newName.trim(),
        parentId: newParentId ? Number(newParentId) : null,
        description: newDesc.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionErr(data?.error || "خطا در ثبت دسته‌بندی");
    } else {
      setNewName("");
      setNewDesc("");
      setActionMsg(`دسته‌بندی «${data.category.name}» با موفقیت ایجاد شد.`);
      loadCategories();
    }
  };

  const handlePatch = async (
    id: number,
    patch: Partial<{
      name: string;
      parentId: number | null;
      sortOrder: number;
      isVisible: boolean;
    }>
  ) => {
    setActionErr(null);
    setActionMsg(null);
    const res = await fetch("/api/catalog/meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "category", id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionErr(data?.error || "عملیات غیرمجاز در ساختار درختی");
    } else {
      loadCategories();
    }
  };

  // Build hierarchical tree order
  const roots = categories.filter((c) => !c.parentId);
  const childrenByParent = new Map<number, CategoryRow[]>();
  for (const c of categories) {
    if (c.parentId) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c);
      childrenByParent.set(c.parentId, arr);
    }
  }

  const flattenedTree: Array<{ item: CategoryRow; depth: number }> = [];
  const visit = (node: CategoryRow, depth: number) => {
    flattenedTree.push({ item: node, depth });
    const kids = childrenByParent.get(node.id) ?? [];
    for (const k of kids) {
      visit(k, depth + 1);
    }
  };
  for (const r of roots) {
    visit(r, 0);
  }

  const filteredTree = search.trim()
    ? flattenedTree.filter(({ item }) =>
        item.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : flattenedTree;

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت درختی دسته‌بندی‌های کاتالوگ"
        description="ساختار سلسله‌مراتبی والد/فرزند، ترتیب نمایش، وضعیت انتشار و هشدار تعداد محصولات متصل"
      />

      {actionMsg && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {actionErr}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Tree Table */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در درخت دسته‌بندی‌ها..."
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
              />
            </div>
            <span className="text-xs text-[#626775]">
              مجموع: {formatNumberFa(categories.length)} دسته‌بندی
            </span>
          </div>

          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} onRetry={loadCategories} />
          ) : (
            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[620px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                    <th className="py-2.5 font-medium">نام دسته‌بندی و سطح</th>
                    <th className="py-2.5 font-medium">دسته والد</th>
                    <th className="py-2.5 font-medium">محصولات متصل</th>
                    <th className="py-2.5 font-medium">وضعیت نمایش</th>
                    <th className="py-2.5 font-medium text-left">ترتیب و عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {filteredTree.map(({ item, depth }) => (
                    <tr key={item.id} className="hover:bg-[#FAFAFE]">
                      <td className="py-3">
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingRight: `${depth * 20}px` }}
                        >
                          <FolderTree className="h-4 w-4 text-[#1813FB] shrink-0" />
                          <div>
                            <div className="font-semibold text-[#080707]">
                              {item.name}
                            </div>
                            <div className="font-mono text-[10px] text-[#626775]">
                              <bdi dir="ltr">{item.slug}</bdi>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3">
                        <select
                          aria-label={`تغییر والد برای ${item.name}`}
                          value={item.parentId ?? ""}
                          onChange={(e) =>
                            handlePatch(item.id, {
                              parentId: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs"
                        >
                          <option value="">دسته اصلی (ریشه)</option>
                          {categories
                            .filter((c) => c.id !== item.id)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>

                      <td className="py-3">
                        {item.productCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F0EEFF] px-2.5 py-0.5 text-[11px] font-medium text-[#1813FB]">
                            {formatNumberFa(item.productCount)} محصول
                          </span>
                        ) : (
                          <span className="text-[11px] text-[#626775]">
                            ۰ محصول
                          </span>
                        )}
                      </td>

                      <td className="py-3">
                        {item.isVisible ? (
                          <StatusBadge label="قابل مشاهده" tone="success" />
                        ) : (
                          <StatusBadge label="مخفی" tone="neutral" />
                        )}
                      </td>

                      <td className="py-3 text-left">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="جابجایی به بالا"
                            onClick={() =>
                              handlePatch(item.id, {
                                sortOrder: Math.max(0, item.sortOrder - 1),
                              })
                            }
                            className="rounded-lg border border-[#E5E7EB] p-1.5 text-[#4B505E] hover:bg-[#F7F7FB]"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="جابجایی به پایین"
                            onClick={() =>
                              handlePatch(item.id, {
                                sortOrder: item.sortOrder + 1,
                              })
                            }
                            className="rounded-lg border border-[#E5E7EB] p-1.5 text-[#4B505E] hover:bg-[#F7F7FB]"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title={
                              item.isVisible
                                ? "مخفی کردن دسته‌بندی"
                                : "نمایش دسته‌بندی"
                            }
                            onClick={() =>
                              handlePatch(item.id, {
                                isVisible: !item.isVisible,
                              })
                            }
                            className="rounded-lg border border-[#E5E7EB] p-1.5 text-[#4B505E] hover:bg-[#F7F7FB]"
                          >
                            {item.isVisible ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create New Category Form */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit space-y-4">
          <h2 className="text-sm font-semibold text-[#080707]">
            افزودن دسته‌بندی جدید
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                نام دسته‌بندی
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="مثال: بافت و پلیور"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                دسته‌بندی والد
              </label>
              <select
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
              >
                <option value="">دسته اصلی (بدون والد)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                توضیحات سئو دسته‌بندی
              </label>
              <textarea
                rows={3}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
              />
            </div>

            <div className="rounded-xl bg-[#FFFAEB] border border-[#FEDF89] p-2.5 text-[11px] text-[#7A4905] flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-[#9A5B04] shrink-0 mt-0.5" />
              <span>
                ساختار درختی به صورت خودکار از ایجاد حلقه‌های والد-فرزندی
                نامعتبر جلوگیری می‌کند.
              </span>
            </div>

            <button
              type="submit"
              disabled={!can("catalog", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              <span>ثبت دسته‌بندی</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
