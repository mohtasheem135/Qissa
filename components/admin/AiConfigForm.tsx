"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAiConfig } from "@/lib/actions/ai-config";
import {
  INITIAL_AI_CONFIG_FORM_STATE,
  type AiConfigFormState,
} from "@/lib/actions/ai-config.types";
import type { ProviderMeta } from "@/lib/ai/registry";

interface AiConfigFormProps {
  current: { default_provider: string; default_model: string };
  /** All providers we *could* support — includes ones with no API key set. */
  allProviders: ReadonlyArray<ProviderMeta>;
  /** Subset of allProviders whose env keys are present. */
  configuredProviderIds: ReadonlyArray<string>;
}

interface TestResult {
  ok: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
  latencyMs?: number;
}

export function AiConfigForm({ current, allProviders, configuredProviderIds }: AiConfigFormProps) {
  const [state, action] = useActionState<AiConfigFormState, FormData>(
    saveAiConfig,
    INITIAL_AI_CONFIG_FORM_STATE,
  );

  const [providerId, setProviderId] = useState<string>(current.default_provider);
  const [model, setModel] = useState<string>(current.default_model);

  // Toast on save success.
  useEffect(() => {
    if (state.success && state.savedAt > 0) {
      toast.success("AI config saved.");
    }
  }, [state.success, state.savedAt]);

  const selectedProvider = useMemo(
    () => allProviders.find((p) => p.id === providerId),
    [allProviders, providerId],
  );

  function handleProviderChange(next: string) {
    setProviderId(next);
    const meta = allProviders.find((p) => p.id === next);
    // Reset model to the provider's default whenever provider switches.
    if (meta) setModel(meta.defaultModel);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Default provider & model</CardTitle>
          <CardDescription>
            Used as the default for every new story. The admin can override per-translation in
            the story workflow (Phase 7).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ai-provider">Provider</Label>
                <Select name="default_provider" value={providerId} onValueChange={handleProviderChange}>
                  <SelectTrigger id="ai-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allProviders.map((p) => {
                      const configured = configuredProviderIds.includes(p.id);
                      return (
                        <SelectItem key={p.id} value={p.id} disabled={!configured}>
                          {p.name}{" "}
                          <span className="text-muted-foreground ml-1 text-xs">
                            {configured ? `· ${p.freeTier}` : `· missing ${p.envKey}`}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-model">Model</Label>
                <Select name="default_model" value={model} onValueChange={setModel}>
                  <SelectTrigger id="ai-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedProvider?.models ?? []).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {state.error ? (
              <p
                role="alert"
                className="text-destructive border-destructive/40 bg-destructive/5 rounded-md border px-3 py-2 text-sm"
              >
                {state.error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <SaveButton />
            </div>
          </form>
        </CardContent>
      </Card>

      <TestConnectionCard providerId={providerId} model={model} />

      <Card>
        <CardHeader>
          <CardTitle>Provider status</CardTitle>
          <CardDescription>From environment variables in .env.local.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allProviders.map((p) => {
            const configured = configuredProviderIds.includes(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground ml-2 font-mono text-xs">{p.envKey}</span>
                </div>
                <Badge variant={configured ? "default" : "outline"}>
                  {configured ? "Configured" : "Missing"}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

function TestConnectionCard({ providerId, model }: { providerId: string; model: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestResult | null>(null);

  function handleTest() {
    setResult(null);
    startTransition(async () => {
      const started = performance.now();
      try {
        const res = await fetch("/api/ai/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerName: providerId, modelName: model }),
        });
        const data = (await res.json()) as TestResult;
        const elapsed = Math.round(performance.now() - started);
        setResult({ ...data, latencyMs: elapsed });
      } catch (err) {
        setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test connection</CardTitle>
        <CardDescription>
          Verifies the API key is present for the selected provider. Real translation round-trip
          lands in Phase 6.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" onClick={handleTest} disabled={pending}>
          {pending ? "Testing…" : "Send test request"}
        </Button>

        {result ? (
          <pre
            className={`rounded-md border px-3 py-2 font-mono text-xs whitespace-pre-wrap ${
              result.error
                ? "text-destructive border-destructive/40 bg-destructive/5"
                : "bg-muted/40"
            }`}
          >
{JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
