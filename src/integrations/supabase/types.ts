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
      advertisements: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          title?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          about_us: string | null
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          hero_tagline: string | null
          id: number
          maintenance_message: string | null
          maintenance_mode: boolean
          min_stake: number
          popup_ad_active: boolean
          popup_ad_image: string | null
          popup_ad_link: string | null
          popup_ad_size: string
          popup_ad_text: string | null
          terms_content: string | null
          updated_at: string
          why_trust_us: string | null
        }
        Insert: {
          about_us?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          hero_tagline?: string | null
          id?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          min_stake?: number
          popup_ad_active?: boolean
          popup_ad_image?: string | null
          popup_ad_link?: string | null
          popup_ad_size?: string
          popup_ad_text?: string | null
          terms_content?: string | null
          updated_at?: string
          why_trust_us?: string | null
        }
        Update: {
          about_us?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          hero_tagline?: string | null
          id?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          min_stake?: number
          popup_ad_active?: boolean
          popup_ad_image?: string | null
          popup_ad_link?: string | null
          popup_ad_size?: string
          popup_ad_text?: string | null
          terms_content?: string | null
          updated_at?: string
          why_trust_us?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      ban_appeals: {
        Row: {
          admin_response: string | null
          created_at: string
          id: string
          message: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          id?: string
          message: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          id?: string
          message?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      bet_selections: {
        Row: {
          bet_id: string
          created_at: string
          id: string
          locked_odds: number
          market_id: string
          match_id: string | null
          odd_id: string
          result: string | null
          selection_label: string
        }
        Insert: {
          bet_id: string
          created_at?: string
          id?: string
          locked_odds: number
          market_id: string
          match_id?: string | null
          odd_id: string
          result?: string | null
          selection_label: string
        }
        Update: {
          bet_id?: string
          created_at?: string
          id?: string
          locked_odds?: number
          market_id?: string
          match_id?: string | null
          odd_id?: string
          result?: string | null
          selection_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_selections_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_odd_id_fkey"
            columns: ["odd_id"]
            isOneToOne: false
            referencedRelation: "odds"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          booking_code: string
          cashed_out_at: string | null
          cashout_amount: number | null
          created_at: string
          id: string
          potential_payout: number
          settled_at: string | null
          stake: number
          status: Database["public"]["Enums"]["bet_status"]
          total_odds: number
          tracking_id: string
          user_id: string
        }
        Insert: {
          booking_code?: string
          cashed_out_at?: string | null
          cashout_amount?: number | null
          created_at?: string
          id?: string
          potential_payout: number
          settled_at?: string | null
          stake: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_odds: number
          tracking_id?: string
          user_id: string
        }
        Update: {
          booking_code?: string
          cashed_out_at?: string | null
          cashout_amount?: number | null
          created_at?: string
          id?: string
          potential_payout?: number
          settled_at?: string | null
          stake?: number
          status?: Database["public"]["Enums"]["bet_status"]
          total_odds?: number
          tracking_id?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          room: Database["public"]["Enums"]["chat_room"]
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          room: Database["public"]["Enums"]["chat_room"]
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          room?: Database["public"]["Enums"]["chat_room"]
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          banner_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          starts_at: string | null
          title: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          starts_at?: string | null
          title: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          starts_at?: string | null
          title?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          media_type: string
          media_url: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          media_type?: string
          media_url: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          media_type?: string
          media_url?: string
          title?: string
        }
        Relationships: []
      }
      leaderboard_overrides: {
        Row: {
          draws: number
          id: string
          kind: string
          losses: number
          manual_rank: number | null
          name: string
          played: number
          points: number
          top_player: string | null
          updated_at: string
          wins: number
        }
        Insert: {
          draws?: number
          id?: string
          kind: string
          losses?: number
          manual_rank?: number | null
          name: string
          played?: number
          points?: number
          top_player?: string | null
          updated_at?: string
          wins?: number
        }
        Update: {
          draws?: number
          id?: string
          kind?: string
          losses?: number
          manual_rank?: number | null
          name?: string
          played?: number
          points?: number
          top_player?: string | null
          updated_at?: string
          wins?: number
        }
        Relationships: []
      }
      markets: {
        Row: {
          created_at: string
          id: string
          is_open: boolean
          match_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_open?: boolean
          match_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_open?: boolean
          match_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number
          away_team_id: string
          category_id: string | null
          created_at: string
          created_by: string | null
          home_score: number
          home_team_id: string
          id: string
          is_featured: boolean
          location: string | null
          name: string
          start_time: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner_team_id: string | null
        }
        Insert: {
          away_score?: number
          away_team_id: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          home_score?: number
          home_team_id: string
          id?: string
          is_featured?: boolean
          location?: string | null
          name: string
          start_time: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_team_id?: string | null
        }
        Update: {
          away_score?: number
          away_team_id?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          home_score?: number
          home_team_id?: string
          id?: string
          is_featured?: boolean
          location?: string | null
          name?: string
          start_time?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      odds: {
        Row: {
          id: string
          is_winner: boolean | null
          label: string
          market_id: string
          updated_at: string
          value: number
        }
        Insert: {
          id?: string
          is_winner?: boolean | null
          label: string
          market_id: string
          updated_at?: string
          value: number
        }
        Update: {
          id?: string
          is_winner?: boolean | null
          label?: string
          market_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "odds_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          is_substitute: boolean
          name: string
          position: string | null
          team_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_substitute?: boolean
          name: string
          position?: string | null
          team_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          is_substitute?: boolean
          name?: string
          position?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accepted_terms: boolean
          avatar_url: string | null
          ban_reason: string | null
          country: string | null
          created_at: string
          discord_username: string | null
          email: string
          full_name: string
          gang_name: string | null
          gang_type: Database["public"]["Enums"]["gang_type"] | null
          id: string
          is_banned: boolean
          is_muted: boolean
          is_restricted: boolean
          mute_reason: string | null
          phone: string | null
          restrict_reason: string | null
          server: string | null
          token_balance: number
          updated_at: string
        }
        Insert: {
          accepted_terms?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          country?: string | null
          created_at?: string
          discord_username?: string | null
          email: string
          full_name: string
          gang_name?: string | null
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id: string
          is_banned?: boolean
          is_muted?: boolean
          is_restricted?: boolean
          mute_reason?: string | null
          phone?: string | null
          restrict_reason?: string | null
          server?: string | null
          token_balance?: number
          updated_at?: string
        }
        Update: {
          accepted_terms?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          country?: string | null
          created_at?: string
          discord_username?: string | null
          email?: string
          full_name?: string
          gang_name?: string | null
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id?: string
          is_banned?: boolean
          is_muted?: boolean
          is_restricted?: boolean
          mute_reason?: string | null
          phone?: string | null
          restrict_reason?: string | null
          server?: string | null
          token_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      promo_code_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          generated_code: string | null
          id: string
          promo_id: string | null
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          usage_limit: number
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          generated_code?: string | null
          id?: string
          promo_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          usage_limit?: number
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          generated_code?: string | null
          id?: string
          promo_id?: string | null
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          usage_limit?: number
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          amount: number
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          usage_limit: number
          used_count: number
        }
        Insert: {
          amount: number
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          usage_limit?: number
          used_count?: number
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          usage_limit?: number
          used_count?: number
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          amount: number
          created_at: string
          id: string
          promo_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          promo_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          promo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          gang_type: Database["public"]["Enums"]["gang_type"] | null
          id: string
          logo_url: string | null
          name: string
        }
        Insert: {
          created_at?: string
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id?: string
          logo_url?: string | null
          name: string
        }
        Update: {
          created_at?: string
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id?: string
          logo_url?: string | null
          name?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          is_ai: boolean
          ticket_id: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_ai?: boolean
          ticket_id: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_ai?: boolean
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      token_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          proof_image_url: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["token_request_status"]
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          proof_image_url?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["token_request_status"]
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          proof_image_url?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["token_request_status"]
          user_id?: string
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          kind: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          gang_name: string
          id: string
          ingame_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          ticket_ref: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          gang_name: string
          id?: string
          ingame_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          ticket_ref?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          gang_name?: string
          id?: string
          ingame_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          ticket_ref?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_bet: {
        Args: { _bet_id: string; _reason?: string; _refund?: boolean }
        Returns: undefined
      }
      admin_suspend_bet: {
        Args: { _bet_id: string; _reason?: string }
        Returns: undefined
      }
      admin_unsuspend_bet: { Args: { _bet_id: string }; Returns: undefined }
      approve_promo_request: {
        Args: { _id: string; _note?: string }
        Returns: string
      }
      can_use_gang_chat: { Args: { _user_id: string }; Returns: boolean }
      create_withdrawal_request: {
        Args: {
          _amount: number
          _gang: string
          _ingame: string
          _ticket?: string
        }
        Returns: string
      }
      decline_promo_request: {
        Args: { _id: string; _note?: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_mod_or_admin: { Args: { _user_id: string }; Returns: boolean }
      review_withdrawal_request: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      wipe_all_tokens: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role:
        | "viewer"
        | "shooter"
        | "gang_leader"
        | "registered"
        | "moderator"
        | "admin"
        | "sponsor"
      bet_status: "open" | "won" | "lost" | "cashed_out" | "void" | "suspended"
      chat_room: "general" | "gang" | "moderator"
      gang_type: "G" | "F"
      match_status: "scheduled" | "live" | "ended" | "cancelled"
      ticket_status: "open" | "pending" | "resolved" | "closed"
      token_request_status: "pending" | "approved" | "denied"
      withdrawal_status: "pending" | "approved" | "declined"
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
      app_role: [
        "viewer",
        "shooter",
        "gang_leader",
        "registered",
        "moderator",
        "admin",
        "sponsor",
      ],
      bet_status: ["open", "won", "lost", "cashed_out", "void", "suspended"],
      chat_room: ["general", "gang", "moderator"],
      gang_type: ["G", "F"],
      match_status: ["scheduled", "live", "ended", "cancelled"],
      ticket_status: ["open", "pending", "resolved", "closed"],
      token_request_status: ["pending", "approved", "denied"],
      withdrawal_status: ["pending", "approved", "declined"],
    },
  },
} as const
