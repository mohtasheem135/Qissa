/**
 * Supabase database type stub.
 *
 * Regenerated in Phase 3 once the schema migrations are applied, via:
 *   Supabase Dashboard → API → "Generate TypeScript types"
 * or the Supabase CLI:
 *   supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 *
 * Until then this empty shape satisfies the `Database` generic so the clients
 * are typed end-to-end without any errors.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
