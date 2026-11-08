"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RestaurantSettingsRow } from "@/lib/db/database.types";
import { DAYS, DAY_LABEL, type Hours } from "@/lib/kiosk/opening-hours";
import { BRAND_PRESETS, checkBrand } from "@/lib/branding";
import { saveSettings, type SettingsInput } from "./actions";
import { btnPrimary, btnSecondary, input } from "../ui";

const pct = (bp: number) => String(bp / 100);
const toBp = (s: string) => Math.round(Number(s.replace(",", ".")) * 100);

export function SettingsForm({ settings, canEdit }: { settings: RestaurantSettingsRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedHours = (settings.opening_hours ?? {}) as Hours;
  const [s, setS] = useState({
    name: settings.name,
    tagline: settings.tagline ?? "",
    logo_url: settings.logo_url ?? "",
    tax: pct(settings.tax_rate_bp),
    service: pct(settings.service_charge_bp),
    accept_cash: settings.accept_cash,
    accept_mobile_money: settings.accept_mobile_money,
    accept_card: settings.accept_card,
    kiosk_timeout_seconds: settings.kiosk_timeout_seconds,
    default_prep_minutes: settings.default_prep_minutes,
    kitchen_sound_enabled: settings.kitchen_sound_enabled,
    brand_primary: settings.brand_primary,
    brand_accent: settings.brand_accent,
    hoursEnabled: Object.keys(savedHours).length > 0,
    hours: Object.fromEntries(DAYS.map((d) => [d, savedHours[d] === undefined ? { open: "08:00", close: "22:00" } : savedHours[d]])) as Hours,
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((x) => ({ ...x, [k]: v }));

  async function uploadLogo(file: File) {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) || file.size > 2 * 1024 * 1024) {
      return setNotice({ ok: false, text: "Use a PNG, JPG, WebP or SVG logo under 2 MB." });
    }
    setUploading(true);
    const supabase = createClient();
    const path = `branding/logo-${crypto.randomUUID()}.${file.name.split(".").pop()?.toLowerCase() ?? "png"}`;
    const { error } = await supabase.storage.from("menu-images").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    setUploading(false);
    if (error) return setNotice({ ok: false, text: `Upload failed: ${error.message}` });
    set("logo_url", supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl);
    setNotice({ ok: true, text: "Logo uploaded. Save settings to use it." });
  }

  function save() {
    const tax = toBp(s.tax), service = toBp(s.service);
    if (!Number.isFinite(tax) || !Number.isFinite(service)) return setNotice({ ok: false, text: "Enter tax and service charge as percentages, like 12.5." });
    const brandProblem = checkBrand({ primary: s.brand_primary, accent: s.brand_accent });
    if (brandProblem) return setNotice({ ok: false, text: brandProblem });
    if (!s.accept_cash && !s.accept_mobile_money && !s.accept_card) return setNotice({ ok: false, text: "Keep at least one payment method switched on." });
    const payload: SettingsInput = {
      name: s.name, tagline: s.tagline, logo_url: s.logo_url, tax_rate_bp: tax, service_charge_bp: service,
      accept_cash: s.accept_cash, accept_mobile_money: s.accept_mobile_money, accept_card: s.accept_card,
      kiosk_timeout_seconds: s.kiosk_timeout_seconds, default_prep_minutes: s.default_prep_minutes,
      kitchen_sound_enabled: s.kitchen_sound_enabled,
      brand_primary: s.brand_primary.toLowerCase(),
      brand_accent: s.brand_accent.toLowerCase(),
      opening_hours: s.hoursEnabled ? (s.hours as SettingsInput["opening_hours"]) : {},
    };
    start(async () => {
      const r = await saveSettings(payload);
      setNotice({ ok: r.ok, text: r.message ?? "" });
      if (r.ok) router.refresh();
    });
  }

  const box = "rounded-xl border border-sand-deep p-5";
  return (
    <fieldset disabled={!canEdit} className="mb-8 grid gap-6 xl:grid-cols-2">
      <section className={box}>
        <h2 className="font-bold">Restaurant</h2>
        <div className="mt-4 space-y-4">
          <label className="block"><span className="font-semibold">Name</span>
            <input value={s.name} maxLength={60} onChange={(e) => set("name", e.target.value)} className={`${input} mt-1`} /></label>
          <label className="block"><span className="font-semibold">Welcome headline</span>
            <input value={s.tagline} maxLength={60} onChange={(e) => set("tagline", e.target.value)} className={`${input} mt-1`} placeholder="Good Food. Great Moments." /></label>
          <div>
            <span className="font-semibold">Logo</span>
            <div className="mt-2 flex items-center gap-4">
              {s.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.logo_url} alt="" className="h-16 w-16 rounded-full border border-sand-deep bg-white object-contain" />
              ) : <span className="grid h-16 w-16 place-items-center rounded-full bg-sand text-xs text-ink-muted">None</span>}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} />
              <button type="button" className={btnSecondary} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading" : "Upload logo"}</button>
              {s.logo_url ? <button type="button" className={btnSecondary} onClick={() => set("logo_url", "")}>Remove</button> : null}
            </div>
          </div>
        </div>
      </section>

      <section className={`${box} xl:col-span-2`}>
        <h2 className="font-bold">Colours</h2>
        <p className="mt-1 text-sm text-ink-muted">Used on the kiosk, the order status screen, the kitchen display and here. Pick a palette or set your own.</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BRAND_PRESETS.map((p) => {
                const on = p.primary === s.brand_primary.toLowerCase() && p.accent === s.brand_accent.toLowerCase();
                return (
                  <button key={p.name} type="button" onClick={() => setS((x) => ({ ...x, brand_primary: p.primary, brand_accent: p.accent }))}
                    aria-pressed={on}
                    className={`flex items-center gap-2 rounded-lg border-2 p-2 text-left text-sm font-semibold ${on ? "border-ink" : "border-sand-deep hover:border-ink-muted"}`}>
                    <span className="flex shrink-0 overflow-hidden rounded-md">
                      <span className="h-8 w-6" style={{ background: p.primary }} />
                      <span className="h-8 w-3" style={{ background: p.accent }} />
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              {([["brand_primary", "Main colour", "Buttons, selected items, welcome panel"], ["brand_accent", "Accent colour", "The main button on each screen"]] as const).map(([k, label, hint]) => (
                <label key={k} className="block">
                  <span className="font-semibold">{label}</span>
                  <span className="block text-xs text-ink-muted">{hint}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <input type="color" value={s[k]} onChange={(e) => set(k, e.target.value)} className="h-11 w-14 cursor-pointer rounded-lg border border-sand-deep bg-canvas p-1" aria-label={`${label} picker`} />
                    <input value={s[k]} onChange={(e) => set(k, e.target.value.trim())} maxLength={7} className={`${input} font-mono`} aria-label={`${label} code`} />
                  </span>
                </label>
              ))}
            </div>
            {checkBrand({ primary: s.brand_primary, accent: s.brand_accent }) ? (
              <p role="alert" className="mt-3 text-sm font-semibold text-pepper">{checkBrand({ primary: s.brand_primary, accent: s.brand_accent })}</p>
            ) : (
              <p className="mt-3 text-sm text-palm">Readable from a distance.</p>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-sand-deep" aria-label="Preview">
            <div className="p-5 text-white" style={{ background: s.brand_primary }}>
              <p className="text-sm font-bold opacity-90">{s.name || "Restaurant"}</p>
              <p className="mt-6 text-3xl font-extrabold leading-none tracking-tight">{s.tagline || "Good Food. Great Moments."}</p>
              <span className="mt-6 inline-block rounded-lg px-5 py-3 font-bold text-ink" style={{ background: s.brand_accent }}>Start order</span>
            </div>
            <div className="flex items-center justify-between bg-canvas p-4">
              <span className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: s.brand_primary }}>Popular</span>
              <span className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: s.brand_primary }}>+ Add</span>
            </div>
          </div>
        </div>
      </section>

      <section className={box}>
        <h2 className="font-bold">Charges and payments</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block"><span className="font-semibold">Tax (%)</span>
            <input inputMode="decimal" value={s.tax} onChange={(e) => set("tax", e.target.value)} className={`${input} mt-1`} /></label>
          <label className="block"><span className="font-semibold">Service charge (%)</span>
            <input inputMode="decimal" value={s.service} onChange={(e) => set("service", e.target.value)} className={`${input} mt-1`} /></label>
        </div>
        <p className="mt-2 text-sm text-ink-muted">Both are added on top of menu prices and shown as separate lines. Set 0 if prices already include them.</p>
        <div className="mt-4 space-y-2">
          {([["accept_mobile_money", "Mobile Money (MTN MoMo, Telecel Cash, AT Money)"], ["accept_card", "Card"], ["accept_cash", "Pay at the counter (cash)"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 font-semibold">
              <input type="checkbox" checked={s[k]} onChange={(e) => set(k, e.target.checked)} className="h-5 w-5 accent-[var(--color-palm)]" />{label}
            </label>
          ))}
          <p className="text-sm text-ink-muted">Mobile Money and card take payments once Paystack is connected.</p>
        </div>
      </section>

      <section className={box}>
        <h2 className="font-bold">Kiosk and kitchen</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block"><span className="font-semibold">Reset kiosk after (seconds idle)</span>
            <input type="number" min={15} max={600} value={s.kiosk_timeout_seconds} onChange={(e) => set("kiosk_timeout_seconds", Number(e.target.value))} className={`${input} mt-1`} /></label>
          <label className="block"><span className="font-semibold">Default preparation time (minutes)</span>
            <input type="number" min={1} max={240} value={s.default_prep_minutes} onChange={(e) => set("default_prep_minutes", Number(e.target.value))} className={`${input} mt-1`} /></label>
        </div>
        <label className="mt-4 flex items-center gap-3 font-semibold">
          <input type="checkbox" checked={s.kitchen_sound_enabled} onChange={(e) => set("kitchen_sound_enabled", e.target.checked)} className="h-5 w-5 accent-[var(--color-palm)]" />
          Offer a sound for new orders on the kitchen screen
        </label>
      </section>

      <section className={box}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Opening hours</h2>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={s.hoursEnabled} onChange={(e) => set("hoursEnabled", e.target.checked)} className="h-5 w-5 accent-[var(--color-palm)]" />
            Close the kiosk outside these hours
          </label>
        </div>
        <div className={`mt-4 space-y-2 ${s.hoursEnabled ? "" : "opacity-50"}`}>
          {DAYS.map((d) => {
            const h = s.hours[d];
            return (
              <div key={d} className="grid grid-cols-[110px_auto_1fr_1fr] items-center gap-3 text-sm">
                <span className="font-semibold">{DAY_LABEL[d]}</span>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" disabled={!s.hoursEnabled || !canEdit} checked={Boolean(h)} className="h-4 w-4 accent-[var(--color-palm)]"
                    onChange={(e) => set("hours", { ...s.hours, [d]: e.target.checked ? { open: "08:00", close: "22:00" } : null })} />Open
                </label>
                <input type="time" disabled={!h || !s.hoursEnabled} value={h?.open ?? ""} onChange={(e) => set("hours", { ...s.hours, [d]: { ...h!, open: e.target.value } })} className={`${input} h-9`} aria-label={`${DAY_LABEL[d]} opens`} />
                <input type="time" disabled={!h || !s.hoursEnabled} value={h?.close ?? ""} onChange={(e) => set("hours", { ...s.hours, [d]: { ...h!, close: e.target.value } })} className={`${input} h-9`} aria-label={`${DAY_LABEL[d]} closes`} />
              </div>
            );
          })}
        </div>
      </section>

      {canEdit ? (
        <div className="flex items-center gap-4 xl:col-span-2">
          <button type="button" className={btnPrimary} disabled={pending || uploading} onClick={save}>{pending ? "Saving" : "Save settings"}</button>
          {notice ? <p role="status" className={`font-semibold ${notice.ok ? "text-palm" : "text-pepper"}`}>{notice.text}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
