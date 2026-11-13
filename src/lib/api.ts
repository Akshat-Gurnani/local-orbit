import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Wraps a route handler so validation and domain errors become JSON responses. */
export async function respond(handler: () => unknown | Promise<unknown>, status = 200): Promise<NextResponse> {
  try {
    return NextResponse.json((await handler()) ?? { ok: true }, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ")
        : error instanceof Error
          ? error.message
          : "Request failed.";
    return NextResponse.json({ error: message }, { status: error instanceof NotFound ? 404 : 400 });
  }
}

export class NotFound extends Error {}
