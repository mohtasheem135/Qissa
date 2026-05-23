"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { restorePartVersion } from "@/lib/actions/story-parts";

export interface VersionRow {
  id: string;
  version_number: number;
  translated_text: string;
  provider_used: string | null;
  model_used: string | null;
  created_by: "ai" | "admin";
  created_at: string;
}

interface VersionHistoryDialogProps {
  partId: string;
  versions: ReadonlyArray<VersionRow>;
}

export function VersionHistoryDialog({ partId, versions }: VersionHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleRestore(versionId: string) {
    startTransition(async () => {
      const result = await restorePartVersion(partId, versionId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Version restored.");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          History ({versions.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Translation history</DialogTitle>
          <DialogDescription>
            Newest first. Restoring a version creates a new version with the old text — nothing is
            lost.
          </DialogDescription>
        </DialogHeader>

        {versions.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No versions yet.</p>
        ) : (
          <div className="space-y-3">
            {[...versions]
              .sort((a, b) => b.version_number - a.version_number)
              .map((v) => (
                <div key={v.id} className="bg-background space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary">v{v.version_number}</Badge>
                    <Badge variant="outline">
                      {v.created_by === "ai" ? "AI" : "Admin edit"}
                    </Badge>
                    {v.provider_used ? (
                      <span className="text-muted-foreground">
                        {v.provider_used}
                        {v.model_used ? ` · ${v.model_used}` : ""}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground ml-auto">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                  </div>
                  <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap">
                    {v.translated_text}
                  </pre>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={pending}
                      onClick={() => handleRestore(v.id)}
                    >
                      Restore this version
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
