import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ROUTE_ROLES: Record<string, string[]> = {
  "/setup": ["admin"],
  "/dashboard": ["admin"],
  "/approver": ["approver", "admin"],
  "/home": ["user", "approver", "admin"],
  "/booking": ["user", "approver", "admin"],
  "/calendar": ["user", "approver", "admin"],
  "/profile": ["user", "approver", "admin"],
};

function matchRoute(pathname: string): string[] | null {
  for (const [prefix, roles] of Object.entries(ROUTE_ROLES)) {
    if (pathname.startsWith(prefix)) {
      return roles;
    }
  }
  return null;
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
  }

  return response;
}
