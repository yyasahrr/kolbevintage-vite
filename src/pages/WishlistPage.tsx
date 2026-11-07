import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { visibleProducts } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState, PageIntro, buttonStyles } from "@/components/ui";
import { useOps } from "@/state/ops";

export function WishlistPage() {
  const { wishlist } = useCart();
  const features = useOps().features ?? { tryon: true, reviews: true, journal: true, wishlist: true };
  const items = visibleProducts().filter((p) => wishlist.includes(p.id));

  if (!features.wishlist) {
    return (
      <div className="pb-14">
        <PageIntro crumbs={[{ label: "علاقه‌مندی‌ها" }]} title="فهرست علاقه‌مندی‌ها خاموش است" description="مالک فروشگاه این بخش را از پنل خاموش کرده است." />
        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
          <EmptyState icon={<Heart className="h-5 w-5" />} title="این بخش در دسترس نیست" body="همهٔ محصولات را می‌توانی از فروشگاه ببینی." />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-14">
      <PageIntro
        crumbs={[{ label: "علاقه‌مندی‌ها" }]}
        eyebrow={`${items.length.toLocaleString("fa-IR")} قطعه ذخیره‌شده`}
        title="علاقه‌مندی‌های تو"
        description="قطعه‌هایی که نگه داشته‌ای اینجا می‌مانند. موجودی و قیمت به‌صورت زنده به‌روز می‌شود."
      />

      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
        {items.length === 0 ? (
          <EmptyState
            icon={<Heart className="h-5 w-5" />}
            title="هنوز چیزی را نشان نکرده‌ای"
            body="روی قلب هر محصول بزن تا اینجا ذخیره شود. می‌توانی بعداً از فروشگاه یا صفحهٔ استایل اضافه کنی."
            action={{ to: "/products", label: "دیدن محصولات" }}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <Link to="/products" className={buttonStyles("outline", "md", "mt-8")}>
              ادامهٔ خرید
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
