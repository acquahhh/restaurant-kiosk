import { requireStaff } from "@/lib/admin/auth";
import { AdminNav } from "./admin-nav";
import { BrandStyle } from "../brand-style";
import { countryMismatch } from "@/lib/country-check";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireStaff();
  const { data: settings } = await supabase.from("restaurant_settings").select("*").eq("id", 1).single();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-[15px] lg:flex-row">
      <BrandStyle primary={settings?.brand_primary} accent={settings?.brand_accent} />
      <AdminNav restaurantName={settings?.name ?? "Restaurant"} staffName={profile.full_name} role={profile.role} />
      <main className="min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8">
        {countryMismatch(settings) ? (
          <p role="alert" className="mb-6 rounded-lg bg-pepper-soft p-4 font-semibold text-pepper">{countryMismatch(settings)}</p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
