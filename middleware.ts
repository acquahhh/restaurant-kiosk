import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database, UserRole } from "@/lib/db/database.types";

/**
 * Route protection.
 *   /kiosk/*   public — customers never sign in
 *   /track/*   public — order progress by order number
 *   /kitchen/* kitchen, manager, admin
 *   /admin/*   manager, admin (some pages are admin-only; checked in-page)
 *   /login     public
 */
const ACCESS: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/kitchen", roles: ["kitchen", "manager", "admin"] },
  { prefix: "/admin", roles: ["manager", "admin"] },
];

export async function middleware(request: NextRequest) {
  const rule = ACCESS.find((r) => request.nextUrl.pathname.startsWith(r.prefix));
  if (!rule) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active || !rule.roles.includes(profile.role)) {
    return NextResponse.redirect(new URL("/login?error=forbidden", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/kitchen/:path*", "/admin/:path*"],
};
