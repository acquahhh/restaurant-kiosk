import Link from "next/link";
import { requireStaff } from "@/lib/admin/auth";
import { PageHeader } from "../../ui";
import { PhotoFinder } from "./photo-finder";

export const metadata = { title: "Find photos" };

export default async function PhotosPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { supabase } = await requireStaff();
  const { all } = await searchParams;
  const showAll = all === "1";
  let query = supabase.from("menu_items").select("id, name, description, image_url, image_credit, menu_categories(name, sort_order)").order("sort_order");
  if (!showAll) query = query.is("image_url", null);
  const { data: items } = await query;

  type Row = { id: string; name: string; description: string; image_url: string | null; image_credit: string | null; menu_categories: { name: string; sort_order: number } | null };
  const rows = ((items ?? []) as unknown as Row[]).sort((a, b) => (a.menu_categories?.sort_order ?? 0) - (b.menu_categories?.sort_order ?? 0));

  return (
    <>
      <Link href="/admin/menu" className="text-sm font-semibold text-palm">Back to menu</Link>
      <PageHeader
        title="Find photos"
        description="Free-to-use photos from Pexels. Pick the one that looks most like your dish; it is copied into your own storage. Replace them with photos of your real food when you can."
        actions={
          <Link href={showAll ? "/admin/menu/photos" : "/admin/menu/photos?all=1"} prefetch={false} className="font-semibold text-palm">
            {showAll ? "Show only meals without a photo" : "Show all meals"}
          </Link>
        }
      />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sand-deep p-10 text-center">
          <p className="text-lg font-semibold">Every meal has a photo</p>
          <Link href="/admin/menu/photos?all=1" className="mt-2 inline-block font-semibold text-palm">Change a photo anyway</Link>
        </div>
      ) : (
        <PhotoFinder items={rows.map((r) => ({ id: r.id, name: r.name, description: r.description, imageUrl: r.image_url, credit: r.image_credit, category: r.menu_categories?.name ?? "" }))} />
      )}
    </>
  );
}
