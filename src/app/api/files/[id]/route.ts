import { getFile, readStoredFile } from "@/db/index";
import { NotFound, respond } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_PREVIEW_BYTES = 2_000_000;

export const GET = async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return respond(() => {
    const file = getFile(id);
    if (!file) throw new NotFound("File not found.");
    const bytes = readStoredFile(file);
    return {
      file,
      size: bytes.length,
      truncated: bytes.length > MAX_PREVIEW_BYTES,
      content: bytes.subarray(0, MAX_PREVIEW_BYTES).toString("utf8"),
    };
  });
};
