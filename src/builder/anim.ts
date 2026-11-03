import { useEffect } from "react";

/** Reveal `.eb-anim` elements (entrance animations) once they scroll into view. */
export function useEntranceAnimations(root: React.RefObject<HTMLElement | null>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const targets = Array.from(el.querySelectorAll<HTMLElement>(".eb-anim:not(.eb-shown)"));
    if (!targets.length) return;
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((t) => t.classList.add("eb-shown"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("eb-shown");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
