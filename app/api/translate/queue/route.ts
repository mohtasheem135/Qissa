import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryPartTranslation } from "@/lib/translation/run-part";
import type { ProviderId } from "@/lib/ai/registry";

/**
 * POST /api/translate/queue (Server-Sent Events)
 *
 * Body: { storyId, fromPartNumber?, providerName?, modelName? }
 *
 * Translates every `pending` and `failed` part of a story in order, sending
 * a stream of newline-delimited JSON events:
 *
 *   data: { "type": "queue_started", "totalParts": 4 }\n\n
 *   data: { "type": "part_started", "partNumber": 1, "partId": "uuid" }\n\n
 *   data: { "type": "part_completed", "partNumber": 1, "partId": "uuid", ... }\n\n
 *   data: { "type": "part_failed", "partNumber": 2, "partId": "uuid", "error": "..." }\n\n
 *   data: { "type": "queue_done", "completed": 3, "failed": 1 }\n\n
 *
 * The client (components/admin/TranslationProgress.tsx) consumes via
 * fetch().body.getReader(); EventSource doesn't support custom auth
 * headers cleanly so SSE-over-fetch is the way.
 *
 * Cancellation: request.signal aborts when the browser closes the
 * connection (e.g. admin clicks Cancel); we stop dispatching new parts
 * but the in-flight part runs to completion (no partial DB state).
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: {
    storyId?: string;
    fromPartNumber?: number;
    providerName?: ProviderId;
    modelName?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const storyId = body.storyId?.trim();
  if (!storyId) {
    return new Response(JSON.stringify({ error: "storyId is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();

  // Select which parts to process: pending OR failed, optionally from a
  // given part_number onward. Edited/completed parts are skipped (admin
  // can hit per-part re-translate explicitly).
  let query = admin
    .from("story_parts")
    .select("id, part_number, status")
    .eq("story_id", storyId)
    .in("status", ["pending", "failed"])
    .order("part_number", { ascending: true });

  if (typeof body.fromPartNumber === "number") {
    query = query.gte("part_number", body.fromPartNumber);
  }

  const { data: parts, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const queue = parts ?? [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller closed (client disconnected). Swallow.
        }
      };

      let completed = 0;
      let failed = 0;

      send({ type: "queue_started", totalParts: queue.length, storyId });

      try {
        for (const part of queue) {
          if (request.signal.aborted) {
            send({ type: "queue_cancelled", completed, failed });
            return;
          }

          send({ type: "part_started", partId: part.id, partNumber: part.part_number });

          const result = await runStoryPartTranslation(part.id, {
            providerName: body.providerName,
            modelName: body.modelName,
            signal: request.signal,
          });

          if (result.ok) {
            completed++;
            send({
              type: "part_completed",
              partId: part.id,
              partNumber: part.part_number,
              translatedText: result.output.translatedText,
              modelUsed: result.output.modelUsed,
              tokensUsed: result.output.tokensUsed,
              durationMs: result.durationMs,
            });
          } else {
            failed++;
            send({
              type: "part_failed",
              partId: part.id,
              partNumber: part.part_number,
              error: result.error,
              durationMs: result.durationMs,
            });
          }
        }

        send({ type: "queue_done", completed, failed });
      } catch (err) {
        send({
          type: "queue_error",
          error: err instanceof Error ? err.message : String(err),
          completed,
          failed,
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Browser disconnected. request.signal.aborted is true at this point;
      // the iteration loop will exit on its next check.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
