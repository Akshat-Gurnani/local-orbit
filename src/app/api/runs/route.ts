import { dashboardStats, listAgentNames, listRuns } from "@/db/index";
import { respond } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  respond(() => {
    const projectId = request.nextUrl.searchParams.get("project") ?? undefined;
    return { runs: listRuns({ projectId, limit: 60 }), stats: dashboardStats(projectId), agents: listAgentNames() };
  });
