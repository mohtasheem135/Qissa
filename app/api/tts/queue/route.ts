import { requireAdmin } from "@/lib/auth/check-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStoryPartAudio } from "@/lib/tts/run-part";
import { audioUrl } from "@/lib/r2/url";
import type { TtsProviderId } from "@/lib/tts/registry";

/**
 * POST /api/tts/queue (Server-Sent Events)
 *
 * Body: { variantId, fromPartNumber?, voiceId?, providerName? }
 *
 * Generates audio for every translation of the variant that has narratable
 * text (status completed/edited) and does not yet have completed audio, in
 * part_number order. Streams newline-delimited JSON events mirroring
 * /api/translate/queue:
 *
 *   queue_started { totalParts } · part_started { partNumber, translationId }
 *   part_completed { audioUrl, durationSeconds } · part_failed { error }
 *   queue_done { completed, failed }
 *
 * Cancellation: request.signal aborts when the browser closes the connection;
 * we stop dispatching new parts at the next boundary.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAdmin();

  let body: {
    variantId?: string;
    fromPartNumber?: number;
    voiceId?: string;
    model?: string;
    providerName?: TtsProviderId;
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

  // Translations with narratable text + their current audio status (one-to-one).
  type QueueRow = {
    id: string;
    part: { id: string; part_number: number } | null;
    audio: { status: string } | { status: string }[] | null;
  };
  const { data: rows, error } = await admin
    .from("story_part_translations")
    .select(
      `id,
       part:story_parts!inner ( id, part_number ),
       audio:story_part_audio ( status )`,
    )
    .eq("variant_id", variantId)
    .in("status", ["completed", "edited"])
    .order("part_number", { ascending: true, referencedTable: "story_parts" })
    .returns<QueueRow[]>();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const audioStatus = (a: QueueRow["audio"]): string | null => {
    if (!a) return null;
    const row = Array.isArray(a) ? a[0] : a;
    return row?.status ?? null;
  };

  const queue = (rows ?? [])
    .filter((r): r is QueueRow & { part: NonNullable<QueueRow["part"]> } => r.part !== null)
    .filter((r) =>
      typeof body.fromPartNumber === "number"
        ? r.part.part_number >= (body.fromPartNumber as number)
        : true,
    )
    // Skip parts that already have completed audio (re-generate is per-part).
    .filter((r) => audioStatus(r.audio) !== "completed");

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

          const result = await runStoryPartAudio(row.id, {
            providerId: body.providerName,
            voiceId: body.voiceId,
            model: body.model,
            signal: request.signal,
          });

          if (result.ok) {
            completed++;
            send({
              type: "part_completed",
              translationId: row.id,
              partId: row.part.id,
              partNumber: row.part.part_number,
              audioUrl: audioUrl(result.audioPath),
              durationSeconds: result.durationSeconds,
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
