export const runtime = "nodejs";

function createEventStream() {
  const encoder = new TextEncoder();
  let interval: NodeJS.Timeout | undefined;

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));
      interval = setInterval(() => {
        controller.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
      }, 25000);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });
}

export async function GET() {
  const stream = createEventStream();
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
