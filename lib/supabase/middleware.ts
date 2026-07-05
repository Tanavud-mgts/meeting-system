import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROUTE_ROLES: Record<string, string[]> = {
  "/setup": ["admin"],
  "/dashboard": ["admin"],
  "/dashboard/reports": ["approver", "admin"],
  "/approver": ["approver", "admin"],
  "/home": ["user", "approver", "admin"],
  "/booking": ["user", "approver", "admin"],
  "/calendar": ["user", "approver", "admin"],
  "/profile": ["user", "approver", "admin"],
};

function matchRoute(pathname: string): string[] | null {
  let bestMatch: { prefix: string; roles: string[] } | null = null;

  for (const [prefix, roles] of Object.entries(ROUTE_ROLES)) {
    if (
      pathname.startsWith(prefix) &&
      (!bestMatch || prefix.length > bestMatch.prefix.length)
    ) {
      bestMatch = { prefix, roles };
    }
  }

  return bestMatch ? bestMatch.roles : null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Domain restriction: only @g.lpru.ac.th accounts may use the system. In
  // development, @test.local test accounts are also allowed — NODE_ENV MUST be
  // "production" in production (see CLAUDE.md) so this bypass never leaks there.
  // Applied to every authenticated request so a wrong-domain session cannot
  // reach any route. Signing out here would otherwise be discarded by the
  // redirect, so the cleared cookies are copied onto the redirect response.
  if (user) {
    const email = user.email ?? "";
    const allowed =
      email.endsWith("@g.lpru.ac.th") ||
      (process.env.NODE_ENV === "development" &&
        email.endsWith("@test.local"));

    if (!allowed) {
      await supabase.auth.signOut();
      const redirect = NextResponse.redirect(
        new URL("/login?error=domain", request.url)
      );
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie);
      }
      return redirect;
    }
  }

  const requiredRoles = matchRoute(request.nextUrl.pathname);

  if (requiredRoles) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !requiredRoles.includes(profile.role)) {
      return NextResponse.redirect(new URL("/home", request.url));
    }

    if (
      profile.role === "admin" &&
      request.nextUrl.pathname.startsWith("/dashboard")
    ) {
      const { data: config } = await supabase
        .from("system_config")
        .select("setup_completed")
        .single();

      if (config && config.setup_completed === false) {
        return NextResponse.redirect(new URL("/setup", request.url));
      }
    }
  }

  return response;
}
