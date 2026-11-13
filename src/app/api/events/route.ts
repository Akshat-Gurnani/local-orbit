import { changeSignature } from "@/db/index";

export const dynamic = "force-dynamic";

const POLL_MS = 1000;
const KEEPALIVE_TICKS = 15;

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let last = changeSignature();
      let idle = 0;
      const stop = () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      };
      controller.enqueue(encoder.encode("retry: 2000\nevent: ready\ndata: {}\n\n"));
      timer = setInterval(() => {
        try {
          const current = changeSignature();
          if (current !== last) {
            last = current;
            idle = 0;
            controller.enqueue(encoder.encode("event: change\ndata: {}\n\n"));
          } else if (++idle >= KEEPALIVE_TICKS) {
            idle = 0;
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          }
        } catch {
          stop();
        }
      }, POLL_MS);
      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
