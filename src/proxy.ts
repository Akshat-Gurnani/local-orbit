import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(host: string | null): string {
  if (!host) return "";
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : (host.split(":")[0] ?? "");
}

function basicAuthPassword(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return null;
  }
}

/**
 * The dashboard has no login, so it only answers on loopback by default. This blocks
 * DNS rebinding and cross-site writes from pages open in the user's browser. Reaching
 * it through a tunnel requires both ORBIT_ALLOWED_HOSTS and ORBIT_DASHBOARD_TOKEN.
 */
export function proxy(request: NextRequest) {
  const host = hostnameOf(request.headers.get("host"));

  if (!LOOPBACK.has(host)) {
    const allowed = (process.env.ORBIT_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim());
    const token = process.env.ORBIT_DASHBOARD_TOKEN;
    if (!token || !allowed.includes(host)) return new NextResponse("Host not allowed.", { status: 403 });
    if (basicAuthPassword(request.headers.get("authorization")) !== token) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Local Orbit"' },
      });
    }
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).hostname;
      } catch {
        // An unparseable origin is rejected below.
      }
      const sameLoopback = LOOPBACK.has(host) && LOOPBACK.has(originHost);
      if (originHost !== host && !sameLoopback) return new NextResponse("Origin not allowed.", { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/:path*" };
