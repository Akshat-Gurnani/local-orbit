import { listFiles } from "@/db/index";
import { respond } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  respond(() => ({ files: listFiles({ projectId: request.nextUrl.searchParams.get("project") ?? undefined }) }));
