import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryPartTranslation } from "@/lib/translation/run-part";
import type { ProviderId } from "@/lib/ai/registry";

/**
 * POST /api/translate/queue (Server-Sent Events)
 *
 * Body: { variantId, fromPartNumber?, providerName?, modelName? }
 *
 * Translates every `pending` and `failed` translation for the given variant
 * in part_number order, streaming newline-delimited JSON events:
 *
 *   data: { "type": "queue_started", "totalParts": 4 }\n\n
 *   data: { "type": "part_started", "partNumber": 1, "translationId": "uuid" }\n\n
 *   data: { "type": "part_completed", "partNumber": 1, "translationId": "uuid", ... }\n\n
 *   data: { "type": "part_failed", "partNumber": 2, "translationId": "uuid", "error": "..." }\n\n
 *   data: { "type": "queue_done", "completed": 3, "failed": 1 }\n\n
 *
 * The client consumes via fetch().body.getReader(); EventSource doesn't
 * support custom auth headers cleanly so SSE-over-fetch is the way.
 *
 * Cancellation: request.signal aborts when the browser closes the connection;
 * we stop dispatching new parts but the in-flight part runs to completion.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: {
    variantId?: string;
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

  const variantId = body.variantId?.trim();
  if (!variantId) {
    return new Response(JSON.stringify({ error: "variantId is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createAdminClient();

  // Pull pending/failed translations for this variant, ordered by the parent
  // part's part_number. Edited/completed are skipped (admin can hit per-part
  // re-translate explicitly).
  type QueueRow = {
    id: string;
    part: { id: string; part_number: number } | null;
  };
  const { data: rows, error } = await admin
    .from("story_part_translations")
    .select(`id, part:story_parts!inner ( id, part_number )`)
    .eq("variant_id", variantId)
    .in("status", ["pending", "failed"])
    .order("part_number", { ascending: true, referencedTable: "story_parts" })
    .returns<QueueRow[]>();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const queue = (rows ?? [])
    .filter((r): r is QueueRow & { part: NonNullable<QueueRow["part"]> } => r.part !== null)
    .filter((r) =>
      typeof body.fromPartNumber === "number"
        ? r.part.part_number >= (body.fromPartNumber as number)
        : true,
    );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Controller closed (client disconnected).
        }
      };

      let completed = 0;
      let failed = 0;

      send({ type: "queue_started", totalParts: queue.length, variantId });

      try {
        for (const row of queue) {
          if (request.signal.aborted) {
            send({ type: "queue_cancelled", completed, failed });
            return;
          }

          send({
            type: "part_started",
            translationId: row.id,
            partId: row.part.id,
            partNumber: row.part.part_number,
          });

          const result = await runStoryPartTranslation(row.id, {
            providerName: body.providerName,
            modelName: body.modelName,
            signal: request.signal,
          });

          if (result.ok) {
            completed++;
            send({
              type: "part_completed",
              translationId: row.id,
              partId: row.part.id,
              partNumber: row.part.part_number,
              translatedText: result.output.translatedText,
              modelUsed: result.output.modelUsed,
              tokensUsed: result.output.tokensUsed,
              durationMs: result.durationMs,
            });
          } else {
            failed++;
            send({
              type: "part_failed",
              translationId: row.id,
              partId: row.part.id,
              partNumber: row.part.part_number,
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
      // Browser disconnected; iteration exits on the next signal check.
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
