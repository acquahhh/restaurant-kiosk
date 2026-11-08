import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandStyle } from "../brand-style";
import { KitchenBoard, type KitchenOrder } from "./kitchen-board";

export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login?next=/kitchen");

  const [profile, settings, orders] = await Promise.all([
    supabase.from("profiles").select("full_name, role, is_active").eq("id", userId).single(),
    supabase.from("restaurant_settings").select("name, kitchen_sound_enabled, brand_primary, brand_accent").eq("id", 1).single(),
    supabase.rpc("kitchen_orders"),
  ]);
  if (!profile.data?.is_active) redirect("/login?error=forbidden");

  return (
    <>
    <BrandStyle primary={settings.data?.brand_primary} accent={settings.data?.brand_accent} />
    <KitchenBoard
      initialOrders={(orders.data as unknown as KitchenOrder[]) ?? []}
      restaurantName={settings.data?.name ?? "Kitchen"}
      staffName={profile.data.full_name}
      role={profile.data.role}
      soundDefault={settings.data?.kitchen_sound_enabled ?? true}
    />
    </>
  );
}
