import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/db/database.types";

/**
 * Route protection.
 *   /kiosk/*   public — customers never sign in
 *   /track/*   public — order progress by order number
 *   /kitchen/* signed-in staff (kitchen, manager, admin; role checked in the page)
 *   /admin/*   signed-in staff (manager, admin; role checked in the layout)
 *   /login     public
 */
const PROTECTED = ["/kitchen", "/admin"];

export async function proxy(request: NextRequest) {
  if (!PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p))) return NextResponse.next();

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

  // getClaims() verifies the signed session token locally (no round trip to
  // Supabase Auth on projects with asymmetric signing keys). The page itself
  // then checks the staff role once, and RLS enforces it in the database.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/kitchen/:path*", "/admin/:path*"],
};
