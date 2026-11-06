"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getPublicationBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatJalaliDate } from "@/lib/formatters";
import { FileText, Video, Plus } from "lucide-react";

interface BlogPostRow {
  id: number;
  title: string;
  slug: string;
  contentType: string;
  category: string;
  authorName: string;
  status: string;
  featuredImage: string;
  videoUrl: string;
  excerpt: string;
  updatedAt: string;
}

export default function BlogContentPage() {
  const { can } = useRole();
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<"article" | "video_lookbook">(
    "article"
  );
  const [category, setCategory] = useState("استایل و ترند");
  const [videoUrl, setVideoUrl] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [body, setBody] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  if (!can("content", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مدیریت بلاگ و محتوای ویدیویی" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        contentType,
        category,
        videoUrl: videoUrl.trim(),
        excerpt: excerpt.trim(),
        body: body.trim(),
      }),
    });
    if (res.ok) {
      setTitle("");
      setVideoUrl("");
      setExcerpt("");
      setBody("");
      loadPosts();
    }
  };

  const togglePublish = async (p: BlogPostRow) => {
    await fetch("/api/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: p.id,
        status: p.status === "published" ? "draft" : "published",
      }),
    });
    loadPosts();
  };

  return (
    <AdminShell>
      <PageHeader
        title="مجله مد، مقالات متنی و لوک‌بوک‌های ویدیویی"
        description="انتشار محتوای تحریریه و ویدیوهای معرفی کالکشن‌ها متصل به سیستم انتشار Agent 3"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          {loading ? (
            <LoadingState />
          ) : (
            posts.map((p) => {
              const pub = getPublicationBadge(p.status);
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={p.featuredImage}
                      alt={p.title}
                      className="h-16 w-16 rounded-xl object-cover border border-[#EFEFF5] shrink-0"
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge
                          label={
                            p.contentType === "video_lookbook"
                              ? "محتوای ویدیویی"
                              : "مقاله متنی"
                          }
                          tone="indigo"
                        />
                        <StatusBadge label={pub.label} tone={pub.tone} />
                      </div>
                      <h3 className="text-sm font-semibold text-[#080707]">
                        {p.title}
                      </h3>
                      <p className="text-xs text-[#626775] line-clamp-1">
                        {p.excerpt}
                      </p>
                      <div className="text-[11px] text-[#626775]">
                        دسته: {p.category} • نویسنده: {p.authorName} •{" "}
                        {formatJalaliDate(p.updatedAt)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => togglePublish(p)}
                    className="h-9 shrink-0 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
                  >
                    {p.status === "published" ? "انتقال به پیش‌نویس" : "انتشار"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-5 h-fit space-y-4">
          <h2 className="text-sm font-semibold text-[#080707]">
            ایجاد مقاله یا ویدیو لوک‌بوک جدید
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setContentType("article")}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${
                  contentType === "article"
                    ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB]"
                    : "border-[#E5E7EB] bg-white text-[#4B505E]"
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>مقاله متنی</span>
              </button>
              <button
                type="button"
                onClick={() => setContentType("video_lookbook")}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${
                  contentType === "video_lookbook"
                    ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB]"
                    : "border-[#E5E7EB] bg-white text-[#4B505E]"
                }`}
              >
                <Video className="h-3.5 w-3.5" />
                <span>ویدیو لوک‌بوک</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                عنوان محتوا
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: اصول نگهداری از پالتوهای پشمی مرینوس"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                دسته‌بندی مجله
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            {contentType === "video_lookbook" && (
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  نشانی فایل ویدیو (CDN / آپارات / استریم)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://cdn.kolbevintage.example/videos/look.mp4"
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                خلاصه معرفی (Excerpt)
              </label>
              <input
                type="text"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                متن کامل مقاله
              </label>
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-3 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!can("content", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ذخیره پیش‌نویس محتوا</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
