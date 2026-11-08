import { loadBranding } from "@/lib/db/load-menu";
import { BrandStyle } from "../brand-style";
import { BoardView } from "./board-view";

export const metadata = { title: "Order status" };
export const dynamic = "force-dynamic";

/** Public customer-facing screen: which order numbers are being prepared or ready. */
export default async function BoardPage() {
  const brand = await loadBranding();
  return (
    <>
      <BrandStyle primary={brand.brand_primary} accent={brand.brand_accent} />
      <BoardView restaurantName={brand.name} logoUrl={brand.logo_url} />
    </>
  );
}
