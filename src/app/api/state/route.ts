import { getProject, listVaultItems } from "@/db/index";
import { NotFound, respond } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  respond(() => {
    const id = request.nextUrl.searchParams.get("project") ?? "default";
    const project = getProject(id);
    if (!project) throw new NotFound("Project not found.");
    return { project, knowledge: listVaultItems({ projectId: id, tier: "knowledge", limit: 200 }) };
  });
