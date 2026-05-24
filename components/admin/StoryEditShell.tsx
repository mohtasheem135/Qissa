"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addStoryPart } from "@/lib/actions/story-parts";
import { deleteStory, setStoryPublished } from "@/lib/actions/stories";
import type { ProviderMeta } from "@/lib/ai/registry";
import { CreateVariantDialog } from "./CreateVariantDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
  EditStoryMetadataDialog,
  type StoryMetadataInitialValue,
} from "./EditStoryMetadataDialog";
import { SourcePartRow, type SourcePartData } from "./SourcePartRow";
import { VariantPanel, type VariantPanelData } from "./VariantPanel";
import type {
  CategoryWithSubsOption,
  LanguageOption,
  ToneOption,
} from "./StoryForm";

export interface StoryEditData {
  id: string;
  title_original: string;
  cover_image_url: string | null;
  category_name: string;
  subcategory_name: string;
  status: "draft" | "published";
  total_words_original: number;
  parts: ReadonlyArray<SourcePartData>;
  variants: ReadonlyArray<VariantPanelData>;
}

interface StoryEditShellProps {
  story: StoryEditData;
  editInitial: StoryMetadataInitialValue;
  categories: ReadonlyArray<CategoryWithSubsOption>;
  languages: ReadonlyArray<LanguageOption>;
  tones: ReadonlyArray<ToneOption>;
  providers: ReadonlyArray<ProviderMeta>;
  configuredProviderIds: ReadonlyArray<string>;
  defaultProvider: string;
  defaultModel: string;
}

const SOURCE_TAB = "__source__";

export function StoryEditShell({
  story,
  editInitial,
  categories,
  languages,
  tones,
  providers,
  configuredProviderIds,
  defaultProvider,
  defaultModel,
}: StoryEditShellProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [publishPending, startPublish] = useTransition();
  const [addPending, startAdd] = useTransition();

  // Default to the primary variant tab if there's at least one variant; else
  // Source. Reset only when the variant set actually changes (e.g. one is
  // added or deleted) so a router.refresh from a Translate run doesn't yank
  // the admin off the tab they were looking at.
  const variantIds = story.variants.map((v) => v.id).join("|");
  const primaryId = story.variants.find((v) => v.is_primary)?.id ?? story.variants[0]?.id;
  const defaultTab = primaryId ?? SOURCE_TAB;
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [prevVariantIds, setPrevVariantIds] = useState<string>(variantIds);
  if (variantIds !== prevVariantIds) {
    setPrevVariantIds(variantIds);
    if (activeTab !== SOURCE_TAB && !story.variants.some((v) => v.id === activeTab)) {
      // The active variant was just deleted — fall back to a sensible default.
      setActiveTab(defaultTab);
    }
  }

  function handleTogglePublished(next: boolean) {
    startPublish(async () => {
      try {
        await setStoryPublished(story.id, next);
        toast.success(next ? "Story published." : "Story unpublished.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update.");
      }
    });
  }

  function handleAddPart() {
    startAdd(async () => {
      try {
        await addStoryPart(story.id);
        toast.success("Part added. Pending translations seeded for every variant.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add part.");
      }
    });
  }

  const existingPairs = story.variants.map((v) => ({
    target_language: v.target_language,
    tone_id:
      tones.find((t) => t.name === v.tone_name && t.language_code === v.target_language)?.id ?? "",
  }));

  const publishedVariants = story.variants.filter((v) => v.status === "published").length;

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
            {story.title_original}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={story.status === "published" ? "default" : "outline"}>
              {story.status}
            </Badge>
            <span className="text-muted-foreground">
              {story.category_name} → {story.subcategory_name}
            </span>
            <span className="text-muted-foreground">
              · {story.parts.length} part{story.parts.length === 1 ? "" : "s"} ·{" "}
              {story.variants.length} variant{story.variants.length === 1 ? "" : "s"}
              {story.variants.length > 0
                ? ` (${publishedVariants} published)`
                : ""}
            </span>
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
            description="Soft delete — hides the story and every variant from readers and listings. Translations are preserved."
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
      />

      {/* Tabs: Source · each variant. "Add variant" sits next to the list. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value={SOURCE_TAB}>
              Source
              <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">
                {story.parts.length}
              </span>
            </TabsTrigger>
            {story.variants.map((v) => {
              const translatedCount = v.parts.filter(
                (p) => p.status === "completed" || p.status === "edited",
              ).length;
              return (
                <TabsTrigger key={v.id} value={v.id}>
                  <span className="font-medium">
                    {v.language_name_english}
                    <span className="text-muted-foreground"> · {v.tone_name}</span>
                  </span>
                  {v.is_primary ? (
                    <span className="text-primary ml-1 text-[10px]" aria-label="primary">
                      ★
                    </span>
                  ) : null}
                  <Badge
                    variant={v.status === "published" ? "default" : "outline"}
                    className="ml-1 px-1 py-0 text-[10px]"
                  >
                    {translatedCount}/{v.parts.length}
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <CreateVariantDialog
            storyId={story.id}
            existingPairs={existingPairs}
            languages={languages}
            tones={tones}
            providers={providers}
            configuredProviderIds={configuredProviderIds}
            defaultProvider={defaultProvider}
            defaultModel={defaultModel}
            canSetPrimary={story.variants.length > 0}
          />
        </div>

        {/* Source tab */}
        <TabsContent value={SOURCE_TAB} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              The original text. Shared across every variant — edits here invalidate existing
              translations until you re-run them. {story.total_words_original} words total.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddPart}
              disabled={addPending}
            >
              + Add empty part
            </Button>
          </div>
          {story.parts.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">No parts yet.</p>
          ) : (
            <div className="space-y-3">
              {story.parts.map((part, idx) => (
                <SourcePartRow
                  key={part.id}
                  part={part}
                  isFirst={idx === 0}
                  isLast={idx === story.parts.length - 1}
                />
              ))}
            </div>
          )}
          {story.variants.length === 0 ? (
            <div className="bg-muted/20 mt-2 rounded-md border border-dashed p-6 text-center">
              <p className="text-muted-foreground text-sm">
                No variants yet. Click <span className="font-medium">+ Add variant</span> above to
                translate this story into a language + tone.
              </p>
            </div>
          ) : null}
        </TabsContent>

        {/* One tab per variant. `forceMount` keeps each VariantPanel mounted so a
            running translation queue isn't aborted by switching tabs. */}
        {story.variants.map((v) => (
          <TabsContent key={v.id} value={v.id} forceMount className="data-[state=inactive]:hidden">
            <VariantPanel variant={v} hasSiblings={story.variants.length > 1} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
