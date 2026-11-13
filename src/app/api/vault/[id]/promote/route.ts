import { promoteVaultItem } from "@/db/index";
import { respond } from "@/lib/api";

export const dynamic = "force-dynamic";

export const POST = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return respond(() => promoteVaultItem(id));
};
