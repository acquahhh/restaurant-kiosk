import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KitchenBoard, type KitchenOrder } from "./kitchen-board";

export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/kitchen");

  const [profile, settings, orders] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    supabase.from("restaurant_settings").select("name, kitchen_sound_enabled").eq("id", 1).single(),
    supabase.rpc("kitchen_orders"),
  ]);
  if (!profile.data) redirect("/login?error=forbidden");

  return (
    <KitchenBoard
      initialOrders={(orders.data as unknown as KitchenOrder[]) ?? []}
      restaurantName={settings.data?.name ?? "Kitchen"}
      staffName={profile.data.full_name}
      role={profile.data.role}
      soundDefault={settings.data?.kitchen_sound_enabled ?? true}
    />
  );
}
