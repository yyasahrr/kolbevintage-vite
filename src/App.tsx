import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { CartProvider } from "@/state/cart";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { AuthProvider } from "@/state/auth";
import { useOps } from "@/state/ops";
import { AuthPage } from "@/pages/AuthPage";
import { AccountPage } from "@/pages/AccountPage";
import { HomePage } from "@/pages/HomePage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductPage } from "@/pages/ProductPage";
import { StylePage } from "@/pages/StylePage";
import { LandingPage } from "@/pages/LandingPage";
import { JournalPage } from "@/pages/JournalPage";
import { ArticlePage } from "@/pages/ArticlePage";
import { AboutPage } from "@/pages/AboutPage";
import { WishlistPage } from "@/pages/WishlistPage";
import { CheckoutPage } from "@/pages/CheckoutPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { AdminPage } from "@/pages/AdminPage";
import { adminUnlocked } from "@/state/admin";
import { StyleBuilderPage } from "@/pages/StyleBuilderPage";
import { BuilderApp } from "@/builder/BuilderApp";
import { CorePageSlot, PublishedPage, SiteShell } from "@/builder/SiteIntegration";
import { IssueButton } from "@/pages/AdminLaunch";

function BrandMeta() {
  const { brand, seo } = useOps();
  /* the owner's search title + description are the real document head (decision 64) */
  useEffect(() => {
    if (seo.title) document.title = seo.title;
    let meta = document.querySelector("meta[name='description']") as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    if (seo.description) meta.content = seo.description;
  }, [seo.title, seo.description]);
  useEffect(() => {
    const link = (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ?? (() => {
      const el = document.createElement("link");
      el.rel = "icon";
      document.head.appendChild(el);
      return el;
    })();
    if (brand.favicon) link.href = brand.favicon;
    if (!document.title || document.title.includes("ولور")) document.title = brand.name + " — فروشگاه پوشاک آماده";
  }, [brand.favicon, brand.name]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function SiteRoutes() {
  const { pathname } = useLocation();
  return (
    <SiteShell>
      <Routes>
        {/* an owner-built page wins over the hand-written one, once published */}
        <Route path="/" element={<CorePageSlot slug="home"><HomePage /></CorePageSlot>} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/product/:productId" element={<ProductPage />} />
        <Route path="/style" element={<StylePage />} />
        <Route path="/style-builder" element={<StyleBuilderPage />} />
        <Route path="/style/:lookId" element={<StylePage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/journal/:slug" element={<ArticlePage />} />
        <Route path="/about" element={<CorePageSlot slug="about"><AboutPage /></CorePageSlot>} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/:tab" element={<AccountPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {/* the report button belongs to the shop floor as much as to the panel (decision 96) */}
      <IssueButton page={pathname} />
    </SiteShell>
  );
}

/** the page studio is an owner tool — a visitor never reaches it (decision 73) */
function AdminOnly({ children }: { children: React.ReactNode }) {
  if (!adminUnlocked()) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
        <CartProvider>
          <ScrollToTop />
          <BrandMeta />
          <Routes>
            <Route path="/builder/*" element={<AdminOnly><BuilderApp /></AdminOnly>} />
            <Route path="/admin/*" element={<AdminPage />} />
            <Route path="/account" element={<SiteShell><AccountPage /></SiteShell>} />
            <Route path="/auth" element={<SiteShell><AuthPage /></SiteShell>} />
            <Route path="/p/:slug" element={<PublishedPage />} />
            <Route path="*" element={<SiteRoutes />} />
          </Routes>
        </CartProvider>
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  );
}
