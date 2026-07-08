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
      discord_verifications: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          discord_id: string
          expires_at: string
          id: string
          ip: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          discord_id: string
          expires_at: string
          id?: string
          ip?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          discord_id?: string
          expires_at?: string
          id?: string
          ip?: string | null
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          category: Database["public"]["Enums"]["food_category"]
          created_at: string
          description: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          owner_id: string | null
          price_bs: number
          stock: number
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["food_category"]
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          owner_id?: string | null
          price_bs: number
          stock?: number
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["food_category"]
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          owner_id?: string | null
          price_bs?: number
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          item_name: string
          menu_item_id: string
          order_id: string
          quantity: number
          unit_price_bs: number
        }
        Insert: {
          id?: string
          item_name: string
          menu_item_id: string
          order_id: string
          quantity: number
          unit_price_bs: number
        }
        Update: {
          id?: string
          item_name?: string
          menu_item_id?: string
          order_id?: string
          quantity?: number
          unit_price_bs?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          discord_username: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_bs: number
          updated_at: string
          verified_discord_id: string | null
        }
        Insert: {
          created_at?: string
          discord_username: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_bs?: number
          updated_at?: string
          verified_discord_id?: string | null
        }
        Update: {
          created_at?: string
          discord_username?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_bs?: number
          updated_at?: string
          verified_discord_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verified_users: {
        Row: {
          avatar_url: string | null
          discord_id: string
          first_verified_at: string
          last_seen_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          discord_id: string
          first_verified_at?: string
          last_seen_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          discord_id?: string
          first_verified_at?: string
          last_seen_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_order_public: {
        Args: { _order_id: string }
        Returns: {
          created_at: string
          discord_username: string
          id: string
          items: Json
          note: string
          status: Database["public"]["Enums"]["order_status"]
          total_bs: number
        }[]
      }
      get_orders_for_discord: {
        Args: { _discord_id: string }
        Returns: {
          created_at: string
          discord_username: string
          id: string
          item_count: number
          status: Database["public"]["Enums"]["order_status"]
          total_bs: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      place_order:
        | {
            Args: { _discord_username: string; _items: Json; _note: string }
            Returns: string
          }
        | {
            Args: {
              _discord_username: string
              _items: Json
              _note: string
              _verified_discord_id?: string
            }
            Returns: string
          }
    }
    Enums: {
      app_role: "admin" | "chef"
      food_category: "non_seasonal" | "seasonal"
      order_status:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
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
    Enums: {
      app_role: ["admin", "chef"],
      food_category: ["non_seasonal", "seasonal"],
      order_status: ["pending", "preparing", "ready", "delivered", "cancelled"],
    },
  },
} as const
