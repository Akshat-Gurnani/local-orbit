import { getFile, readStoredFile } from "@/db/index";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Agents write these files, so nothing that can run script is served inline from
// the dashboard's origin. Everything else downloads, or displays as plain text.
export const GET = async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const file = getFile(id);
  if (!file) return new Response("File not found.", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = readStoredFile(file);
  } catch {
    return new Response("The file is missing from disk.", { status: 404 });
  }

  const download = request.nextUrl.searchParams.has("download");
  const encoded = encodeURIComponent(file.filename);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": download ? "application/octet-stream" : "text/plain; charset=utf-8",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
    },
  });
};
