"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  deleteVariant,
  setVariantPrimary,
  setVariantPublished,
} from "@/lib/actions/story-variants";
import { PartCard, type PartCardData, type PartStatus } from "./PartCard";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";

export interface VariantPanelData {
  id: string;
  slug: string;
  target_language: string;
  language_name_english: string;
  tone_name: string;
  title_translated: string | null;
  status: "draft" | "published";
  is_primary: boolean;
  ai_provider: string | null;
  ai_model: string | null;
  total_words_translated: number;
  parts: ReadonlyArray<PartCardData>;
}

interface QueueEvent {
  type:
    | "queue_started"
    | "part_started"
    | "part_completed"
    | "part_failed"
    | "queue_done"
    | "queue_cancelled"
    | "queue_error";
  totalParts?: number;
  translationId?: string;
  partId?: string;
  partNumber?: number;
  error?: string;
  completed?: number;
  failed?: number;
}

interface LiveState {
  status: PartStatus;
  error: string | null;
}

interface VariantPanelProps {
  variant: VariantPanelData;
  /** True when there are multiple variants and the user can pick a primary. */
  hasSiblings: boolean;
}

export function VariantPanel({ variant, hasSiblings }: VariantPanelProps) {
  const router = useRouter();
  const [liveByTranslation, setLiveByTranslation] = useState<Record<string, LiveState>>({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueSummary, setQueueSummary] = useState<{ completed: number; failed: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);
  const [publishPending, startPublish] = useTransition();
  const [primaryPending, startPrimary] = useTransition();

  const pendingCount = variant.parts.filter((p) => {
    const status = liveByTranslation[p.translationId]?.status ?? p.status;
    return status === "pending" || status === "failed";
  }).length;

  const handleEvent = useCallback(
    (data: QueueEvent) => {
      if (data.type === "queue_started") {
        toast.message(
          `Translating ${data.totalParts ?? 0} part(s) for ${variant.language_name_english}/${variant.tone_name}…`,
        );
      } else if (data.type === "part_started" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "translating", error: null },
        }));
      } else if (data.type === "part_completed" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "completed", error: null },
        }));
      } else if (data.type === "part_failed" && data.translationId) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [data.translationId!]: { status: "failed", error: data.error ?? "Translation failed." },
        }));
      } else if (data.type === "queue_done" || data.type === "queue_cancelled") {
        setQueueSummary({ completed: data.completed ?? 0, failed: data.failed ?? 0 });
        if (data.type === "queue_done") {
          toast.success(`Queue done: ${data.completed ?? 0} translated, ${data.failed ?? 0} failed.`);
        }
      } else if (data.type === "queue_error") {
        toast.error(`Queue error: ${data.error ?? "unknown"}`);
      }
    },
    [variant.language_name_english, variant.tone_name],
  );

  const runQueue = useCallback(
    async (fromPartNumber?: number) => {
      if (queueRunning) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setQueueRunning(true);
      setQueueSummary(null);
      setLiveByTranslation({});

      try {
        const response = await fetch("/api/translate/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId: variant.id, fromPartNumber }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => "");
          toast.error(`Queue failed: ${response.status} ${errText.slice(0, 200)}`);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            if (!ev.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(ev.slice(6)) as QueueEvent;
              handleEvent(data);
            } catch {
              // malformed event — ignore
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          toast.message("Translation cancelled.");
        } else {
          toast.error(err instanceof Error ? err.message : "Queue error.");
        }
      } finally {
        setQueueRunning(false);
        abortRef.current = null;
        router.refresh();
      }
    },
    [queueRunning, variant.id, router, handleEvent],
  );

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleTogglePublished(next: boolean) {
    startPublish(async () => {
      try {
        await setVariantPublished(variant.id, next);
        toast.success(next ? "Variant published." : "Variant unpublished.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  function handleSetPrimary() {
    if (variant.is_primary) return;
    startPrimary(async () => {
      try {
        await setVariantPrimary(variant.id);
        toast.success("Marked as primary.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to set primary.");
      }
    });
  }

  async function handleTranslateOne(translationId: string) {
    if (queueRunning) return;
    setLiveByTranslation((prev) => ({
      ...prev,
      [translationId]: { status: "translating", error: null },
    }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPartTranslationId: translationId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        setLiveByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "completed", error: null },
        }));
        toast.success("Translated.");
      } else {
        setLiveByTranslation((prev) => ({
          ...prev,
          [translationId]: { status: "failed", error: data.error ?? "Translation failed." },
        }));
        toast.error(data.error ?? `Translation failed (${res.status}).`);
      }
    } catch (err) {
      setLiveByTranslation((prev) => ({
        ...prev,
        [translationId]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Network error.",
        },
      }));
    } finally {
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              {variant.language_name_english} · {variant.tone_name}
            </CardTitle>
            <Badge variant={variant.status === "published" ? "default" : "outline"}>
              {variant.status}
            </Badge>
            {variant.is_primary ? <Badge variant="secondary">primary</Badge> : null}
            <code className="text-muted-foreground text-xs">/{variant.slug}/</code>
          </div>
          <p className="text-muted-foreground text-xs">
            {variant.title_translated ?? <em>untitled translation</em>}
            {" · "}
            {variant.total_words_translated} words
            {variant.ai_provider ? ` · ${variant.ai_provider}` : ""}
            {variant.ai_model ? ` · ${variant.ai_model}` : ""}
          </p>
          <p className="text-muted-foreground text-xs">
            {pendingCount > 0
              ? `${pendingCount} pending / failed part${pendingCount === 1 ? "" : "s"}.`
              : "All parts translated."}
            {queueSummary
              ? ` Last run: ${queueSummary.completed} ok, ${queueSummary.failed} failed.`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {queueRunning ? (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          ) : (
            <Button size="sm" disabled={pendingCount === 0} onClick={() => runQueue()}>
              Translate {pendingCount > 0 ? `${pendingCount} ` : ""}pending
            </Button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Published</span>
            <Switch
              checked={variant.status === "published"}
              onCheckedChange={handleTogglePublished}
              disabled={publishPending}
              aria-label="Publish variant"
            />
          </div>
          {hasSiblings && !variant.is_primary ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetPrimary}
              disabled={primaryPending}
            >
              Set primary
            </Button>
          ) : null}
          <DeleteConfirmDialog
            title="Delete this variant?"
            description="Soft delete — hides the variant from readers and the reader URL. Translations are preserved and can be undeleted via SQL."
            triggerLabel="Delete variant"
            onConfirm={() => deleteVariant(variant.id)}
            successMessage="Variant deleted."
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {variant.parts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No parts yet — add some in the Source section above.</p>
        ) : (
          variant.parts.map((part) => {
            const live = liveByTranslation[part.translationId];
            return (
              <PartCard
                key={part.translationId}
                part={part}
                isInFlight={live?.status === "translating"}
                liveStatus={live?.status}
                liveError={live?.error}
                onTranslate={handleTranslateOne}
                queueRunning={queueRunning}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
