import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useCart } from "@/state/cart";
import { useReducedMotion } from "motion/react";
import { Toasts } from "@/components/Toasts";
import { Dashboard } from "./Dashboard";
import { EditorPage } from "./Editor";

/**
 * Full-screen page-builder shell. The site's visual theme is suspended while the builder is open
 * so the editor chrome never inherits (e.g.) the dark / neo-brutalist theme rules.
 */
export function BuilderApp() {
  const reduced = useReducedMotion() ?? false;
  useCart(); // make sure a CartProvider is available for shop widgets

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.dataset.theme;
    root.dataset.theme = "builder";
    document.title = "صفحه‌ساز — کلبه وینتیج";
    return () => {
      if (prev) root.dataset.theme = prev;
    };
  }, []);

  return (
    <>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="edit/:id" element={<EditorPage />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      <Toasts reduced={reduced} />
    </>
  );
}
