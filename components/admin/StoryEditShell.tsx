"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { addStoryPart } from "@/lib/actions/story-parts";
import { deleteStory, setStoryPublished } from "@/lib/actions/stories";
import type { ProviderMeta } from "@/lib/ai/registry";
import { PartCard, type PartCardData, type PartStatus } from "./PartCard";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
  EditStoryMetadataDialog,
  type StoryMetadataInitialValue,
} from "./EditStoryMetadataDialog";
import type {
  CategoryWithSubsOption,
  LanguageOption,
  ToneOption,
} from "./StoryForm";

export interface StoryEditData {
  id: string;
  title_original: string;
  title_translated: string | null;
  cover_image_url: string | null;
  category_name: string;
  subcategory_name: string;
  language_name_english: string;
  tone_name: string;
  ai_provider: string | null;
  ai_model: string | null;
  status: "draft" | "published";
  total_words_original: number;
  total_words_translated: number;
  parts: PartCardData[];
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
  partId?: string;
  partNumber?: number;
  translatedText?: string;
  error?: string;
  completed?: number;
  failed?: number;
}

interface LivePartState {
  status: PartStatus;
  error: string | null;
}

interface StoryEditShellProps {
  story: StoryEditData;
  /** Pre-shaped initial values for the EditStoryMetadataDialog. */
  editInitial: StoryMetadataInitialValue;
  categories: ReadonlyArray<CategoryWithSubsOption>;
  languages: ReadonlyArray<LanguageOption>;
  tones: ReadonlyArray<ToneOption>;
  providers: ReadonlyArray<ProviderMeta>;
  configuredProviderIds: ReadonlyArray<string>;
}

export function StoryEditShell({
  story,
  editInitial,
  categories,
  languages,
  tones,
  providers,
  configuredProviderIds,
}: StoryEditShellProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  // Out-of-band part status from the SSE queue. Overrides the DB status
  // until the next router.refresh() reconciles.
  const [liveByPart, setLiveByPart] = useState<Record<string, LivePartState>>({});
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueSummary, setQueueSummary] = useState<{ completed: number; failed: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const [publishPending, startPublish] = useTransition();
  const [addPending, startAdd] = useTransition();

  const pendingCount = story.parts.filter(
    (p) =>
      (liveByPart[p.id]?.status ?? p.status) === "pending" ||
      (liveByPart[p.id]?.status ?? p.status) === "failed",
  ).length;

  const runQueue = useCallback(
    async (fromPartNumber?: number) => {
      if (queueRunning) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setQueueRunning(true);
      setQueueSummary(null);
      setLiveByPart({});

      try {
        const response = await fetch("/api/translate/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storyId: story.id, fromPartNumber }),
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
              // ignore malformed event
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
        // Reconcile DB state once everything settles.
        router.refresh();
      }
    },
    [queueRunning, story.id, router],
  );

  function handleEvent(data: QueueEvent) {
    if (data.type === "queue_started") {
      toast.message(`Translating ${data.totalParts ?? 0} part(s)…`);
    } else if (data.type === "part_started" && data.partId) {
      setLiveByPart((prev) => ({
        ...prev,
        [data.partId!]: { status: "translating", error: null },
      }));
    } else if (data.type === "part_completed" && data.partId) {
      setLiveByPart((prev) => ({
        ...prev,
        [data.partId!]: { status: "completed", error: null },
      }));
    } else if (data.type === "part_failed" && data.partId) {
      setLiveByPart((prev) => ({
        ...prev,
        [data.partId!]: { status: "failed", error: data.error ?? "Translation failed." },
      }));
    } else if (data.type === "queue_done" || data.type === "queue_cancelled") {
      setQueueSummary({
        completed: data.completed ?? 0,
        failed: data.failed ?? 0,
      });
      if (data.type === "queue_done") {
        toast.success(
          `Queue done: ${data.completed ?? 0} translated, ${data.failed ?? 0} failed.`,
        );
      }
    } else if (data.type === "queue_error") {
      toast.error(`Queue error: ${data.error ?? "unknown"}`);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }

  function handleTogglePublished(next: boolean) {
    startPublish(async () => {
      try {
        await setStoryPublished(story.id, next);
        toast.success(next ? "Published." : "Unpublished.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  function handleAddPart() {
    startAdd(async () => {
      try {
        await addStoryPart(story.id);
        toast.success("Part added.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add part.");
      }
    });
  }

  async function handleTranslateOne(partId: string) {
    if (queueRunning) return;
    setLiveByPart((prev) => ({ ...prev, [partId]: { status: "translating", error: null } }));
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyPartId: partId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && data.ok) {
        setLiveByPart((prev) => ({ ...prev, [partId]: { status: "completed", error: null } }));
        toast.success("Translated.");
      } else {
        setLiveByPart((prev) => ({
          ...prev,
          [partId]: { status: "failed", error: data.error ?? "Translation failed." },
        }));
        toast.error(data.error ?? `Translation failed (${res.status}).`);
      }
    } catch (err) {
      setLiveByPart((prev) => ({
        ...prev,
        [partId]: {
          status: "failed",
          error: err instanceof Error ? err.message : "Network error.",
        },
      }));
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Link
            href="/admin/stories"
            className="text-muted-foreground text-xs hover:underline"
          >
            ← Stories
          </Link>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {story.title_translated ?? story.title_original}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{story.language_name_english}</Badge>
            <Badge variant="outline">{story.tone_name}</Badge>
            <span className="text-muted-foreground">
              {story.category_name} → {story.subcategory_name}
            </span>
            {story.ai_provider ? (
              <span className="text-muted-foreground">
                · {story.ai_provider}
                {story.ai_model ? ` · ${story.ai_model}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit details
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Published</span>
            <Switch
              checked={story.status === "published"}
              onCheckedChange={handleTogglePublished}
              disabled={publishPending}
              aria-label="Publish toggle"
            />
          </div>
          <DeleteConfirmDialog
            title="Delete this story?"
            description="Soft delete — hides the story from readers and the listing. Translations are preserved."
            onConfirm={async () => {
              const result = await deleteStory(story.id);
              if (!result.error) router.push("/admin/stories");
              return result;
            }}
            successMessage="Story deleted."
          />
        </div>
      </div>

      <EditStoryMetadataDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialValue={editInitial}
        categories={categories}
        languages={languages}
        tones={tones}
        providers={providers}
        configuredProviderIds={configuredProviderIds}
      />

      {/* Queue controls */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Translation queue</CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              {pendingCount > 0
                ? `${pendingCount} pending / failed part${pendingCount === 1 ? "" : "s"}.`
                : "All parts translated."}
              {queueSummary
                ? ` Last run: ${queueSummary.completed} ok, ${queueSummary.failed} failed.`
                : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {queueRunning ? (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={pendingCount === 0}
                onClick={() => runQueue()}
              >
                Translate {pendingCount > 0 ? `${pendingCount} ` : ""}pending
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {story.total_words_original} words original · {story.total_words_translated} words
            translated.
          </p>
        </CardContent>
      </Card>

      {/* Parts */}
      <div className="space-y-3">
        {story.parts.map((part, idx) => {
          const live = liveByPart[part.id];
          return (
            <PartCard
              key={part.id}
              part={part}
              isInFlight={live?.status === "translating"}
              liveStatus={live?.status}
              liveError={live?.error}
              isFirst={idx === 0}
              isLast={idx === story.parts.length - 1}
              onTranslate={handleTranslateOne}
              queueRunning={queueRunning}
            />
          );
        })}

        <Button type="button" variant="outline" onClick={handleAddPart} disabled={addPending}>
          + Add empty part
        </Button>
      </div>
    </div>
  );
}
