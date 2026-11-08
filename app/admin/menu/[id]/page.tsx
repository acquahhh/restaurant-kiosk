import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/admin/auth";
import { PageHeader } from "../../ui";
import { ItemEditor, type EditorItem } from "./item-editor";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !UUID_RE.test(id)) notFound();
  const { supabase } = await requireStaff();

  const { data: categories } = await supabase.from("menu_categories").select("id, name, slug").order("sort_order");
  const choosable = (categories ?? []).filter((c) => c.slug !== "popular");

  let item: EditorItem;
  if (isNew) {
    item = {
      category_id: choosable[0]?.id ?? "", name: "", description: "", image_url: "", base_price: 0,
      is_available: true, is_featured: false, is_popular: false, prep_minutes: 15, groups: [],
    };
  } else {
    const [{ data: row }, { data: groups }] = await Promise.all([
      supabase.from("menu_items").select("*").eq("id", id).single(),
      supabase.from("customization_groups").select("*").eq("menu_item_id", id).order("sort_order"),
    ]);
    if (!row) notFound();
    const groupIds = (groups ?? []).map((g) => g.id);
    const { data: options } = groupIds.length
      ? await supabase.from("customization_options").select("*").in("group_id", groupIds).order("sort_order")
      : { data: [] };
    item = {
      id: row.id, category_id: row.category_id, name: row.name, description: row.description, image_url: row.image_url ?? "",
      base_price: row.base_price, is_available: row.is_available, is_featured: row.is_featured, is_popular: row.is_popular,
      prep_minutes: row.prep_minutes,
      groups: (groups ?? []).map((g) => ({
        id: g.id, name: g.name, selection_type: g.selection_type, is_required: g.is_required, max_select: g.max_select,
        options: (options ?? []).filter((o) => o.group_id === g.id).map((o) => ({
          id: o.id, name: o.name, price_delta: o.price_delta, is_default: o.is_default, is_available: o.is_available,
        })),
      })),
    };
  }

  return (
    <>
      <Link href="/admin/menu" className="text-sm font-semibold text-palm">Back to menu</Link>
      <PageHeader title={isNew ? "Add a meal" : item.name} />
      {choosable.length === 0 ? (
        <p className="rounded-lg bg-pepper-soft p-4 font-semibold text-pepper">Create a category on the Menu page first.</p>
      ) : (
        <ItemEditor initial={item} categories={choosable} />
      )}
    </>
  );
}
