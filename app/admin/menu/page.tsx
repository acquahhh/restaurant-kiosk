import Link from "next/link";
import { requireStaff } from "@/lib/admin/auth";
import { PageHeader, btnPrimary, btnSecondary } from "../ui";
import { MenuManager } from "./menu-manager";

export default async function MenuPage() {
  const { supabase } = await requireStaff();
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from("menu_categories").select("id, name, slug, is_active, sort_order").order("sort_order"),
    supabase.from("menu_items").select("id, category_id, name, base_price, image_url, is_available, is_featured, is_popular").order("sort_order"),
  ]);
  return (
    <>
      <PageHeader
        title="Menu"
        description="Click a price to change it. Use Edit for the name, photo, description and choices. Changes reach the kiosk on its next screen load."
        actions={
          <div className="flex gap-2">
            <Link href="/admin/menu/photos" className={btnSecondary}>Find photos</Link>
            <Link href="/admin/menu/new" className={btnPrimary}>Add meal</Link>
          </div>
        }
      />
      <MenuManager categories={categories ?? []} items={items ?? []} />
    </>
  );
}
