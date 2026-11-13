import { getRunDetail } from "@/db/index";
import { NotFound, respond } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return respond(() => {
    const detail = getRunDetail(id);
    if (!detail) throw new NotFound("Run not found.");
    return detail;
  });
};
