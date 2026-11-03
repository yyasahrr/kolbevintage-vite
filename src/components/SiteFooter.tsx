import { Link } from "react-router-dom";
import { AtSign, Mail, MapPin, Phone } from "lucide-react";
import { COLLECTIONS, productsInCollection } from "@/data/catalog";
import { useOps } from "@/state/ops";

const SERVICE = [
  { label: "پیگیری سفارش", to: "/about" },
  { label: "ارسال و مرجوعی", to: "/about" },
  { label: "راهنمای سایز", to: "/products" },
  { label: "پرسش‌های متداول", to: "/about" },
  { label: "تماس با ما", to: "/about" },
];

const STUDIO = [
  { label: "دربارهٔ ولور", to: "/about" },
  { label: "آتلیهٔ پاریس", to: "/about" },
  { label: "پایداری", to: "/about" },
  { label: "فرصت‌های شغلی", to: "/about" },
];

export function SiteFooter() {
  const { brand } = useOps();
  return (
    <footer className="border-t border-black/[0.07] bg-[#efe9e1]">
      <div className="mx-auto grid max-w-[1500px] gap-9 px-4 py-11 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:px-10">
        <div>
          <Link to="/" className="inline-flex items-center">
            {brand.logoImage ? (
              <img src={brand.logoImage} alt={brand.name} className="h-9 w-auto max-w-[180px] object-contain" />
            ) : (
              <span className="latin-track font-latin text-[26px] tracking-brand text-ink">{brand.logoText}</span>
            )}
          </Link>
          <p className="mt-3 max-w-[22rem] text-[12px] leading-[1.95] text-ink-70">
            {brand.footerNote}
          </p>
          <div className="mt-4 space-y-1.5 text-[11.5px] text-ink-70">
            <p className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-ink-45" /> پاریس، خیابان سن‌آنوره، پلاک ۲۴
            </p>
            <p className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-ink-45" />
              <span dir="ltr">+33 1 84 80 24 24</span>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-ink-45" /> client@velours.store
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <a
              href="#newsletter"
              aria-label="اینستاگرام ولور"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-black/12 text-ink-70 transition-colors hover:border-ink hover:text-ink"
            >
              <AtSign className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <FooterColumn title="فروشگاه">
          <li>
            <FooterLink to="/products">همهٔ محصولات</FooterLink>
          </li>
          {COLLECTIONS.slice(0, 4).map((c) => (
            <li key={c.id}>
              <FooterLink to={`/products?collection=${c.id}`}>
                {c.label}
                <span className="ms-1 text-[9.5px] text-ink-45">{productsInCollection(c.id).length}</span>
              </FooterLink>
            </li>
          ))}
          <li>
            <FooterLink to="/style">خرید بر اساس استایل</FooterLink>
          </li>
        </FooterColumn>

        <FooterColumn title="خدمات مشتریان">
          {SERVICE.map((item) => (
            <li key={item.label}>
              <FooterLink to={item.to}>{item.label}</FooterLink>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="ولور">
          {STUDIO.map((item) => (
            <li key={item.label}>
              <FooterLink to={item.to}>{item.label}</FooterLink>
            </li>
          ))}
          <li>
            <FooterLink to="/journal">ژورنال ولور</FooterLink>
          </li>
          <li>
            <FooterLink to="/landing">کمپین پاییز / زمستان</FooterLink>
          </li>
        </FooterColumn>
      </div>

      <div className="border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 text-[10px] text-ink-45 sm:px-6 lg:px-10">
          <p>© {new Date().getFullYear()} ولور پاریس — تمام حقوق محفوظ است.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/about" className="transition-colors hover:text-ink">
              حریم خصوصی
            </Link>
            <Link to="/about" className="transition-colors hover:text-ink">
              شرایط استفاده
            </Link>
            <span className="flex items-center gap-1.5 rounded-full border border-black/10 px-2 py-0.5">
              سایت نمایشی — بدون پرداخت واقعی
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-ink-45">{title}</p>
      <ul className="mt-3 space-y-2 text-[11.5px] text-ink-70">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="transition-colors hover:text-ink hover:underline hover:underline-offset-4">
      {children}
    </Link>
  );
}
