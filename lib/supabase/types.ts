export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_config: {
        Row: {
          default_model: string
          default_provider: string
          id: string
          updated_at: string
        }
        Insert: {
          default_model?: string
          default_provider?: string
          id: string
          updated_at?: string
        }
        Update: {
          default_model?: string
          default_provider?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon_emoji: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon_emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon_emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      languages: {
        Row: {
          code: string
          direction: string
          display_order: number
          font_family: string | null
          font_family_reading: string | null
          is_active: boolean
          name_english: string
          name_native: string
        }
        Insert: {
          code: string
          direction?: string
          display_order?: number
          font_family?: string | null
          font_family_reading?: string | null
          is_active?: boolean
          name_english: string
          name_native: string
        }
        Update: {
          code?: string
          direction?: string
          display_order?: number
          font_family?: string | null
          font_family_reading?: string | null
          is_active?: boolean
          name_english?: string
          name_native?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          ai_model: string | null
          ai_provider: string | null
          author_original: string | null
          complexity: string
          cover_image_url: string | null
          created_at: string
          custom_instructions: string | null
          estimated_reading_minutes: number | null
          id: string
          is_active: boolean
          published_at: string | null
          source_url: string | null
          status: string
          subcategory_id: string
          target_language: string
          title_original: string
          title_translated: string | null
          tone_id: string
          total_parts: number
          total_words_original: number
          total_words_translated: number
          updated_at: string
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string | null
          author_original?: string | null
          complexity?: string
          cover_image_url?: string | null
          created_at?: string
          custom_instructions?: string | null
          estimated_reading_minutes?: number | null
          id?: string
          is_active?: boolean
          published_at?: string | null
          source_url?: string | null
          status?: string
          subcategory_id: string
          target_language: string
          title_original: string
          title_translated?: string | null
          tone_id: string
          total_parts?: number
          total_words_original?: number
          total_words_translated?: number
          updated_at?: string
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string | null
          author_original?: string | null
          complexity?: string
          cover_image_url?: string | null
          created_at?: string
          custom_instructions?: string | null
          estimated_reading_minutes?: number | null
          id?: string
          is_active?: boolean
          published_at?: string | null
          source_url?: string | null
          status?: string
          subcategory_id?: string
          target_language?: string
          title_original?: string
          title_translated?: string | null
          tone_id?: string
          total_parts?: number
          total_words_original?: number
          total_words_translated?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_target_language_fkey"
            columns: ["target_language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "stories_tone_id_fkey"
            columns: ["tone_id"]
            isOneToOne: false
            referencedRelation: "tones"
            referencedColumns: ["id"]
          },
        ]
      }
      story_part_versions: {
        Row: {
          complexity: string | null
          created_at: string
          created_by: string
          custom_instructions: string | null
          id: string
          model_used: string | null
          provider_used: string | null
          story_part_id: string
          tone_id: string | null
          translated_text: string
          version_number: number
        }
        Insert: {
          complexity?: string | null
          created_at?: string
          created_by: string
          custom_instructions?: string | null
          id?: string
          model_used?: string | null
          provider_used?: string | null
          story_part_id: string
          tone_id?: string | null
          translated_text: string
          version_number: number
        }
        Update: {
          complexity?: string | null
          created_at?: string
          created_by?: string
          custom_instructions?: string | null
          id?: string
          model_used?: string | null
          provider_used?: string | null
          story_part_id?: string
          tone_id?: string | null
          translated_text?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_part_versions_story_part_id_fkey"
            columns: ["story_part_id"]
            isOneToOne: false
            referencedRelation: "story_parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_part_versions_tone_id_fkey"
            columns: ["tone_id"]
            isOneToOne: false
            referencedRelation: "tones"
            referencedColumns: ["id"]
          },
        ]
      }
      story_parts: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          last_model_used: string | null
          last_provider_used: string | null
          part_label: string | null
          part_number: number
          status: string
          story_id: string
          text_original: string
          text_translated: string | null
          updated_at: string
          word_count_original: number
          word_count_translated: number
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_model_used?: string | null
          last_provider_used?: string | null
          part_label?: string | null
          part_number: number
          status?: string
          story_id: string
          text_original: string
          text_translated?: string | null
          updated_at?: string
          word_count_original?: number
          word_count_translated?: number
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          last_model_used?: string | null
          last_provider_used?: string | null
          part_label?: string | null
          part_number?: number
          status?: string
          story_id?: string
          text_original?: string
          text_translated?: string | null
          updated_at?: string
          word_count_original?: number
          word_count_translated?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_parts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          display_order: number
          icon_emoji: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon_emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          icon_emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tones: {
        Row: {
          created_at: string
          description: string | null
          display_name: string | null
          id: string
          is_active: boolean
          language_code: string
          name: string
          prompt_fragment: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          language_code: string
          name: string
          prompt_fragment: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          language_code?: string
          name?: string
          prompt_fragment?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tones_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
        ]
      }
      translation_jobs: {
        Row: {
          attempt_number: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          provider: string | null
          status: string
          story_part_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          status: string
          story_part_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          provider?: string | null
          status?: string
          story_part_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "translation_jobs_story_part_id_fkey"
            columns: ["story_part_id"]
            isOneToOne: false
            referencedRelation: "story_parts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
