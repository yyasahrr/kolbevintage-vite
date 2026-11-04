import { Link, useParams } from "react-router-dom";
import { LOOKS } from "@/data/looks";
import { RunwaySection } from "@/components/RunwaySection";
import { Breadcrumbs, buttonStyles } from "@/components/ui";


export function StylePage() {
  const { lookId } = useParams();
  const look = LOOKS.find((l) => l.id === lookId);

  return (
    <>
      <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-10">
        <Breadcrumbs
          items={[{ label: "خرید بر اساس استایل", to: look ? "/style" : undefined }, ...(look ? [{ label: look.name }] : [])]}
        />
      </div>

      <RunwaySection initialLookId={look?.id} />

      <section className="mx-auto mt-8 flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] px-4 pt-5 sm:px-6 lg:px-10">
        <p className="text-[11.5px] text-ink-45">
          این صفحه یک رانوی تعاملی است: مدل را انتخاب کن، استایلش را ببین و یک‌جا بخر.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to="/style-builder" className={buttonStyles("solid", "sm")}>استایل بیلدر</Link>
          <Link to="/products" className={buttonStyles("ghost", "sm")}>همهٔ محصولات</Link>
        </div>
      </section>

    </>
  );
}
