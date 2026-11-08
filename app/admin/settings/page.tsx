import { requireStaff } from "@/lib/admin/auth";
import { PageHeader } from "../ui";
import { SettingsForm } from "./settings-form";
import { TablesManager } from "./tables-manager";

export default async function SettingsPage() {
  const { supabase, profile } = await requireStaff();
  const [{ data: settings }, { data: tables }] = await Promise.all([
    supabase.from("restaurant_settings").select("*").eq("id", 1).single(),
    supabase.from("restaurant_tables").select("id, number, is_active"),
  ]);
  const sortedTables = (tables ?? []).sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
  return (
    <>
      <PageHeader title="Settings" description={profile.role === "admin" ? undefined : "Only an administrator can change restaurant settings. Managers can manage tables."} />
      {settings ? <SettingsForm settings={settings} canEdit={profile.role === "admin"} /> : null}
      <TablesManager tables={sortedTables} />
    </>
  );
}
