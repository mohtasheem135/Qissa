"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface RequestDialogLanguage {
  code: string;
  name_english: string;
}
export interface RequestDialogTone {
  id: string;
  name: string;
  language_code: string;
}

interface RequestStoryDialogProps {
  /** When set, the dialog defaults to type='new_variant' for this story. */
  storyId?: string;
  storyTitle?: string;
  /** Whether the user can switch between new_story and new_variant in the dialog. */
  allowTypeToggle?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost" | "link";
  languages: ReadonlyArray<RequestDialogLanguage>;
  tones: ReadonlyArray<RequestDialogTone>;
}

/**
 * Anonymous "request a story / request a variant" dialog. Submits to
 * POST /api/requests — that endpoint handles honeypot + rate-limit + dedup
 * (matching requests collapse to an upvote and we toast accordingly).
 */
export function RequestStoryDialog({
  storyId,
  storyTitle,
  allowTypeToggle = !storyId,
  triggerLabel,
  triggerVariant = "outline",
  languages,
  tones,
}: RequestStoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"new_story" | "new_variant">(
    storyId ? "new_variant" : "new_story",
  );
  const [language, setLanguage] = useState<string>(languages[0]?.code ?? "");
  const [toneId, setToneId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  // Reset to defaults when opened.
  const sig = open ? "open" : "closed";
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    if (open) {
      setType(storyId ? "new_variant" : "new_story");
      setLanguage(languages[0]?.code ?? "");
      setToneId("");
    }
  }

  const tonesForLanguage = useMemo(
    () => tones.filter((t) => t.language_code === language),
    [tones, language],
  );

  // Reset toneId when language changes / first sets.
  const [prevLanguage, setPrevLanguage] = useState(language);
  if (language !== prevLanguage) {
    setPrevLanguage(language);
    if (!tonesForLanguage.some((t) => t.id === toneId)) {
      setToneId(tonesForLanguage[0]?.id ?? "");
    }
  }

  // Close on success.
  useEffect(() => {
    // (no-op — submission handler closes via setOpen)
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      type,
      storyId,
      requestedTitle: formData.get("requested_title")?.toString().trim() || undefined,
      requestedAuthor: formData.get("requested_author")?.toString().trim() || undefined,
      targetLanguage: language || undefined,
      toneId: toneId || undefined,
      notes: formData.get("notes")?.toString().trim() || undefined,
      requesterEmail: formData.get("requester_email")?.toString().trim() || undefined,
      hp: formData.get("hp")?.toString() ?? "",
    };

    startTransition(async () => {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        matched?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? `Submission failed (${res.status}).`);
        return;
      }
      if (data.matched) {
        toast.success("There's already an open request for this — your upvote was added.");
      } else {
        toast.success("Request submitted. Thank you!");
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          {triggerLabel ?? (storyId ? "Request a translation" : "Request a story")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {type === "new_variant"
              ? `Request a translation of "${storyTitle ?? "this story"}"`
              : "Request a new story"}
          </DialogTitle>
          <DialogDescription>
            Tell us what you&rsquo;d like to read next. Duplicate requests are merged into upvotes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Honeypot — hidden from users; bots fill it and get silently dropped. */}
          <input
            type="text"
            name="hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="sr-only"
          />

          {allowTypeToggle ? (
            <div className="space-y-2">
              <Label>Request type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "new_story" | "new_variant")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_story">A new story</SelectItem>
                  {storyId ? (
                    <SelectItem value="new_variant">Another translation of this story</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {type === "new_story" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="rs-title">Title</Label>
                <Input
                  id="rs-title"
                  name="requested_title"
                  required
                  placeholder="The Bet"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rs-author">Author (optional)</Label>
                <Input id="rs-author" name="requested_author" placeholder="Anton Chekhov" />
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rs-lang">Target language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="rs-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name_english}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rs-tone">Tone (optional)</Label>
              <Select value={toneId || "__any"} onValueChange={(v) => setToneId(v === "__any" ? "" : v)}>
                <SelectTrigger id="rs-tone">
                  <SelectValue placeholder="No preference" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any">No preference</SelectItem>
                  {tonesForLanguage.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rs-notes">Notes (optional)</Label>
            <Textarea id="rs-notes" name="notes" rows={2} placeholder="Anything else we should know?" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rs-email">Email (optional)</Label>
            <Input
              id="rs-email"
              name="requester_email"
              type="email"
              placeholder="So we can tell you when it's ready"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
