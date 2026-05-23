"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coverUrl, normalizeStoredValue } from "@/lib/imagekit/url";

interface ImageUploadFieldProps {
  /** Name of the hidden input that carries the stored value (path or URL) on form submit. */
  name: string;
  /**
   * Initial stored value from the DB — either a "/covers/foo.png" path
   * (new shape), a full ImageKit URL (legacy), or an external URL.
   */
  initialUrl?: string | null;
}

/**
 * Cover field. The DB stores either:
 *   - "/covers/foo.png"                  (new — uploaded via /api/upload)
 *   - "https://example.com/foo.png"      (external URL the admin pasted)
 *   - "https://ik.imagekit.io/.../x.png" (legacy full ImageKit URL)
 *
 * - File upload  → store the path the API returns.
 * - Paste URL    → run through normalizeStoredValue: if it's our
 *                  ImageKit endpoint, strip to path; otherwise pass through.
 * - Preview      → pipe whatever's stored through coverUrl() so the
 *                  thumbnail composes correctly in all three cases.
 */
export function ImageUploadField({ name, initialUrl = null }: ImageUploadFieldProps) {
  const [stored, setStored] = useState<string>(initialUrl ?? "");
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewSrc = coverUrl(stored, "w-256,h-192,c-maintain_ratio");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = (await res.json()) as { ok: boolean; path?: string; error?: string };
        if (!res.ok || !data.ok || !data.path) {
          toast.error(data.error ?? `Upload failed (${res.status})`);
          return;
        }
        setStored(data.path);
        toast.success("Cover uploaded.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed.");
      }
    });
    // Clear so re-selecting the same file fires onChange again.
    event.target.value = "";
  }

  function handlePastedChange(event: React.ChangeEvent<HTMLInputElement>) {
    setStored(normalizeStoredValue(event.target.value));
  }

  return (
    <div className="space-y-2">
      <Label>Cover image</Label>
      <div className="flex items-start gap-4">
        <div className="bg-muted/40 flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded border">
          {previewSrc ? (
            <Image
              src={previewSrc}
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
            {stored ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStored("")}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <Input
            type="text"
            placeholder="…or paste an ImageKit URL / path"
            value={stored}
            onChange={handlePastedChange}
            className="font-mono text-xs"
          />
          <p className="text-muted-foreground text-xs">
            JPEG/PNG/WebP/AVIF, max 2MB. Uploads return a path under
            <code className="mx-1">NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT</code>; full ImageKit URLs
            are normalized to that path on paste.
          </p>
        </div>
      </div>
      <input type="hidden" name={name} value={stored} />
    </div>
  );
}
