import { listVaultItems, saveVaultItem, searchMemory, TIERS, type Tier } from "@/db/index";
import { respond } from "@/lib/api";
import type { NextRequest } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  respond(() => {
    const params = request.nextUrl.searchParams;
    const projectId = params.get("project") ?? undefined;
    const query = params.get("q")?.trim();
    if (query) return { results: searchMemory({ query, projectId, limit: 50 }) };
    const items = TIERS.flatMap((tier: Tier) => listVaultItems({ projectId, tier, limit: 200 }));
    return { items };
  });

const NewNote = z.object({
  project_id: z.string(),
  title: z.string().trim().min(1, "Add a title."),
  content: z.string().trim().min(1, "Add some content."),
  tags: z.array(z.string()).optional(),
});

export const POST = (request: Request) =>
  respond(async () => saveVaultItem({ ...NewNote.parse(await request.json()), tier: "note" }), 201);
