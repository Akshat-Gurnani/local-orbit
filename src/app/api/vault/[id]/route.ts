import { getVaultItem } from "@/db/index";
import { NotFound, respond } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return respond(() => {
    const item = getVaultItem(id);
    if (!item) throw new NotFound("Vault item not found.");
    return item;
  });
};
