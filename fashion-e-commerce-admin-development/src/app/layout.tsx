import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "./globals.css";
import { RoleProvider } from "@/components/admin/RoleContext";
import { getActiveRole } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "کلبه وینتیج | پنل مدیریت یکپارچه مد و پوشاک (V3)",
  description:
    "سامانه عملیات فروش، کاتالوگ، انبارداری، سفارش‌ها، بازاریابی و استودیو طراحی فروشگاه اینترنتی کلبه وینتیج",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const initialRole = await getActiveRole();

  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen bg-[#F7F7FB] text-[#080707] antialiased selection:bg-[#F0EEFF] selection:text-[#1813FB]">
        <RoleProvider initialRole={initialRole}>{children}</RoleProvider>
      </body>
    </html>
  );
}
