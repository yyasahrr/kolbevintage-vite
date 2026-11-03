import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { buttonStyles } from "@/components/ui";

export function NotFoundPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-10 lg:py-28">
      <p className="latin-track font-latin text-[clamp(4rem,14vw,9rem)] leading-none tracking-brand text-ink/15">404</p>
      <span className="mt-2 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-bone">
        <Compass className="h-5 w-5" />
      </span>
      <h1 className="mt-5 font-display text-[clamp(1.6rem,3.4vw,2.3rem)] font-medium text-ink">
        این صفحه از رانو خارج شد
      </h1>
      <p className="mt-2.5 max-w-[27rem] text-[12.5px] leading-[1.95] text-ink-70">
        نشانی‌ای که باز کردی وجود ندارد یا جابه‌جا شده. می‌توانی به خانه برگردی یا از صفحهٔ استایل‌ها شروع کنی.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2.5">
        <Link to="/" className={buttonStyles("solid", "md")}>
          خانه <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
        <Link to="/style" className={buttonStyles("outline", "md")}>
          خرید بر اساس استایل
        </Link>
        <Link to="/products" className={buttonStyles("ghost", "md")}>
          همهٔ محصولات
        </Link>
      </div>
    </div>
  );
}
