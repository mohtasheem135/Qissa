"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageUploadFieldProps {
  /** Name of the hidden input that holds the resulting URL (for form submit). */
  name: string;
  initialUrl?: string | null;
}

export function ImageUploadField({ name, initialUrl = null }: ImageUploadFieldProps) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [pasted, setPasted] = useState<string>(initialUrl ?? "");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
        if (!res.ok || !data.ok || !data.url) {
          toast.error(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setUrl(data.url);
        setPasted(data.url);
        toast.success("Cover uploaded.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      }
    });
    // Clear so re-selecting the same file fires onChange again.
    event.target.value = "";
  }

  function handlePastedChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setPasted(next);
    setUrl(next.trim() || null);
  }

  return (
    <div className="space-y-2">
      <Label>Cover image</Label>
      <div className="flex items-start gap-4">
        <div className="bg-muted/40 flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded border">
          {url ? (
            <Image
              src={url}
              alt=""
              width={128}
              height={96}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-muted-foreground text-xs">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
            >
              {pending ? "Uploading…" : "Upload file"}
            </Button>
            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUrl(null);
                  setPasted("");
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <Input
            type="url"
            placeholder="…or paste an image URL"
            value={pasted}
            onChange={handlePastedChange}
            className="text-xs"
          />
          <p className="text-muted-foreground text-xs">
            JPEG/PNG/WebP/AVIF, max 2MB. Uploads go to ImageKit; URLs are stored as-is.
          </p>
        </div>
      </div>
      <input type="hidden" name={name} value={url ?? ""} />
    </div>
  );
}
