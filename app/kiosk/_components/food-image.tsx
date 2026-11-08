import Image from "next/image";

/**
 * Food photo, or a quiet colour field when the restaurant has not uploaded one
 * yet. Never a stock illustration or placeholder text.
 */
export function FoodImage({
  src, alt, className = "", sizes,
}: {
  src: string | null;
  alt: string;
  className?: string;
  sizes: string;
}) {
  if (!src) return <div className={`bg-sand ${className}`} aria-hidden />;
  return (
    // `relative` is only a default: a caller asking for `absolute` (the welcome
    // hero) must win, or the box collapses to zero height and the photo vanishes.
    <div className={`${/\b(absolute|fixed)\b/.test(className) ? "" : "relative"} overflow-hidden bg-sand ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}
