import { useParams } from "react-router-dom";
import { LOOKS } from "@/data/looks";
import { RunwaySection } from "@/components/RunwaySection";
import { Breadcrumbs } from "@/components/ui";

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

    </>
  );
}
