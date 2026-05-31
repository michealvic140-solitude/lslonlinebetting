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
          admin_ai_enabled: boolean
          admin_ai_model: string
          challenge_reward_multiplier: number
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          daily_login_base_reward: number
          daily_login_bonus_per_day: number
          daily_login_enabled: boolean
          daily_login_max_streak: number
          emblem_auto_approve: boolean
          exposure_warn_pct: number
          force_reload_at: string | null
          friends_enabled: boolean
          gift_daily_limit: number
          gift_enabled: boolean
          gift_fee_pct: number
          gift_max_per_tx: number
          gift_min_amount: number
          hero_tagline: string | null
          house_low_balance: number
          id: number
          maintenance_message: string | null
          maintenance_mode: boolean
          max_payout: number
          max_selections_per_ticket: number
          min_selections_per_ticket: number
          min_stake: number
          min_withdrawal: number
          popup_ad_active: boolean
          popup_ad_image: string | null
          popup_ad_link: string | null
          popup_ad_size: string
          popup_ad_text: string | null
          push_endpoint_url: string | null
          referral_bonus_referee: number
          referral_bonus_referrer: number
          spin_cooldown_hours: number
          spin_enabled: boolean
          spin_max_reward: number
          spin_min_reward: number
          terms_content: string | null
          updated_at: string
          vapid_public_key: string | null
          vapid_subject: string | null
          vip_enabled: boolean
          vip_token_multipliers: Json
          virtual_animation_seconds: number
          virtual_concurrent_rounds: number
          virtual_cycle_last_tick: string | null
          virtual_cycle_running: boolean
          virtual_lock_window_seconds: number
          virtual_matches_per_round: number
          virtual_max_payout: number | null
          virtual_max_score: number
          virtual_max_selections: number
          virtual_max_stake: number
          virtual_min_selections: number
          virtual_min_stake: number
          virtual_payout_multiplier: number
          virtual_round_duration_seconds: number
          virtual_win_bonus_tokens: number
          virtual_xp_per_win: number
          why_trust_us: string | null
          xp_per_bet: number
          xp_per_login: number
          xp_per_referral: number
          xp_per_win: number
        }
        Insert: {
          about_us?: string | null
          admin_ai_enabled?: boolean
          admin_ai_model?: string
          challenge_reward_multiplier?: number
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          daily_login_base_reward?: number
          daily_login_bonus_per_day?: number
          daily_login_enabled?: boolean
          daily_login_max_streak?: number
          emblem_auto_approve?: boolean
          exposure_warn_pct?: number
          force_reload_at?: string | null
          friends_enabled?: boolean
          gift_daily_limit?: number
          gift_enabled?: boolean
          gift_fee_pct?: number
          gift_max_per_tx?: number
          gift_min_amount?: number
          hero_tagline?: string | null
          house_low_balance?: number
          id?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          max_payout?: number
          max_selections_per_ticket?: number
          min_selections_per_ticket?: number
          min_stake?: number
          min_withdrawal?: number
          popup_ad_active?: boolean
          popup_ad_image?: string | null
          popup_ad_link?: string | null
          popup_ad_size?: string
          popup_ad_text?: string | null
          push_endpoint_url?: string | null
          referral_bonus_referee?: number
          referral_bonus_referrer?: number
          spin_cooldown_hours?: number
          spin_enabled?: boolean
          spin_max_reward?: number
          spin_min_reward?: number
          terms_content?: string | null
          updated_at?: string
          vapid_public_key?: string | null
          vapid_subject?: string | null
          vip_enabled?: boolean
          vip_token_multipliers?: Json
          virtual_animation_seconds?: number
          virtual_concurrent_rounds?: number
          virtual_cycle_last_tick?: string | null
          virtual_cycle_running?: boolean
          virtual_lock_window_seconds?: number
          virtual_matches_per_round?: number
          virtual_max_payout?: number | null
          virtual_max_score?: number
          virtual_max_selections?: number
          virtual_max_stake?: number
          virtual_min_selections?: number
          virtual_min_stake?: number
          virtual_payout_multiplier?: number
          virtual_round_duration_seconds?: number
          virtual_win_bonus_tokens?: number
          virtual_xp_per_win?: number
          why_trust_us?: string | null
          xp_per_bet?: number
          xp_per_login?: number
          xp_per_referral?: number
          xp_per_win?: number
        }
        Update: {
          about_us?: string | null
          admin_ai_enabled?: boolean
          admin_ai_model?: string
          challenge_reward_multiplier?: number
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          daily_login_base_reward?: number
          daily_login_bonus_per_day?: number
          daily_login_enabled?: boolean
          daily_login_max_streak?: number
          emblem_auto_approve?: boolean
          exposure_warn_pct?: number
          force_reload_at?: string | null
          friends_enabled?: boolean
          gift_daily_limit?: number
          gift_enabled?: boolean
          gift_fee_pct?: number
          gift_max_per_tx?: number
          gift_min_amount?: number
          hero_tagline?: string | null
          house_low_balance?: number
          id?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          max_payout?: number
          max_selections_per_ticket?: number
          min_selections_per_ticket?: number
          min_stake?: number
          min_withdrawal?: number
          popup_ad_active?: boolean
          popup_ad_image?: string | null
          popup_ad_link?: string | null
          popup_ad_size?: string
          popup_ad_text?: string | null
          push_endpoint_url?: string | null
          referral_bonus_referee?: number
          referral_bonus_referrer?: number
          spin_cooldown_hours?: number
          spin_enabled?: boolean
          spin_max_reward?: number
          spin_min_reward?: number
          terms_content?: string | null
          updated_at?: string
          vapid_public_key?: string | null
          vapid_subject?: string | null
          vip_enabled?: boolean
          vip_token_multipliers?: Json
          virtual_animation_seconds?: number
          virtual_concurrent_rounds?: number
          virtual_cycle_last_tick?: string | null
          virtual_cycle_running?: boolean
          virtual_lock_window_seconds?: number
          virtual_matches_per_round?: number
          virtual_max_payout?: number | null
          virtual_max_score?: number
          virtual_max_selections?: number
          virtual_max_stake?: number
          virtual_min_selections?: number
          virtual_min_stake?: number
          virtual_payout_multiplier?: number
          virtual_round_duration_seconds?: number
          virtual_win_bonus_tokens?: number
          virtual_xp_per_win?: number
          why_trust_us?: string | null
          xp_per_bet?: number
          xp_per_login?: number
          xp_per_referral?: number
          xp_per_win?: number
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
        Relationships: [
          {
            foreignKeyName: "ban_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "bet_selections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_real_matches"
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
        Relationships: [
          {
            foreignKeyName: "bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          link: string | null
          segment: string
          sent_count: number
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          segment?: string
          sent_count?: number
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          link?: string | null
          segment?: string
          sent_count?: number
          title?: string
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
      challenges: {
        Row: {
          action_key: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: string
          reward_tokens: number
          starts_at: string | null
          target_count: number
          title: string
        }
        Insert: {
          action_key?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: string
          reward_tokens?: number
          starts_at?: string | null
          target_count?: number
          title: string
        }
        Update: {
          action_key?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          reward_tokens?: number
          starts_at?: string | null
          target_count?: number
          title?: string
        }
        Relationships: []
      }
      chat_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          image_url: string | null
          reply_to_id: string | null
          room: Database["public"]["Enums"]["chat_room"]
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          room: Database["public"]["Enums"]["chat_room"]
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          image_url?: string | null
          reply_to_id?: string | null
          room?: Database["public"]["Enums"]["chat_room"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      friends: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
          id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
          id?: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
          id?: string
        }
        Relationships: []
      }
      gang_emblems: {
        Row: {
          created_at: string
          id: string
          image_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      gifts: {
        Row: {
          amount: number
          created_at: string
          fee: number
          id: string
          recipient_id: string
          sender_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee?: number
          id?: string
          recipient_id: string
          sender_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee?: number
          id?: string
          recipient_id?: string
          sender_id?: string
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
      house_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          balance_after: number
          bet_id: string | null
          created_at: string
          id: string
          kind: string
          reason: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount: number
          balance_after: number
          bet_id?: string | null
          created_at?: string
          id?: string
          kind: string
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number
          balance_after?: number
          bet_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      house_wallet: {
        Row: {
          balance: number
          id: number
          pause_reason: string | null
          payouts_paused: boolean
          total_in: number
          total_out: number
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: number
          pause_reason?: string | null
          payouts_paused?: boolean
          total_in?: number
          total_out?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: number
          pause_reason?: string | null
          payouts_paused?: boolean
          total_in?: number
          total_out?: number
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_overrides: {
        Row: {
          draws: number
          id: string
          is_hidden: boolean
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
          is_hidden?: boolean
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
          is_hidden?: boolean
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
          {
            foreignKeyName: "markets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_real_matches"
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
          is_archived: boolean
          is_featured: boolean
          is_virtual: boolean
          location: string | null
          lock_time: string | null
          locked_at: string | null
          locked_by: string | null
          name: string
          settled_at: string | null
          settled_by: string | null
          start_time: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          virtual_first_blood_team_id: string | null
          virtual_round_batch_id: string | null
          virtual_round_id: string | null
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
          is_archived?: boolean
          is_featured?: boolean
          is_virtual?: boolean
          location?: string | null
          lock_time?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name: string
          settled_at?: string | null
          settled_by?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          virtual_first_blood_team_id?: string | null
          virtual_round_batch_id?: string | null
          virtual_round_id?: string | null
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
          is_archived?: boolean
          is_featured?: boolean
          is_virtual?: boolean
          location?: string | null
          lock_time?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name?: string
          settled_at?: string | null
          settled_by?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          virtual_first_blood_team_id?: string | null
          virtual_round_batch_id?: string | null
          virtual_round_id?: string | null
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
      notification_prefs: {
        Row: {
          bet_results: boolean
          chat_mentions: boolean
          daily_streak: boolean
          match_starting: boolean
          promotions: boolean
          push_enabled: boolean
          referrals: boolean
          rewards: boolean
          ticket_replies: boolean
          updated_at: string
          user_id: string
          vip_tier_up: boolean
          withdrawals: boolean
        }
        Insert: {
          bet_results?: boolean
          chat_mentions?: boolean
          daily_streak?: boolean
          match_starting?: boolean
          promotions?: boolean
          push_enabled?: boolean
          referrals?: boolean
          rewards?: boolean
          ticket_replies?: boolean
          updated_at?: string
          user_id: string
          vip_tier_up?: boolean
          withdrawals?: boolean
        }
        Update: {
          bet_results?: boolean
          chat_mentions?: boolean
          daily_streak?: boolean
          match_starting?: boolean
          promotions?: boolean
          push_enabled?: boolean
          referrals?: boolean
          rewards?: boolean
          ticket_replies?: boolean
          updated_at?: string
          user_id?: string
          vip_tier_up?: boolean
          withdrawals?: boolean
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          chat_color: string | null
          country: string | null
          created_at: string
          discord_full_name: string | null
          discord_username: string | null
          email: string
          emblem_status: string | null
          force_logout_at: string | null
          full_name: string
          gang_emblem_url: string | null
          gang_name: string | null
          gang_type: Database["public"]["Enums"]["gang_type"] | null
          id: string
          ingame_name: string | null
          is_banned: boolean
          is_muted: boolean
          is_restricted: boolean
          last_login_date: string | null
          longest_streak: number
          mute_reason: string | null
          phone: string | null
          profile_banner_url: string | null
          profile_title: string | null
          referral_code: string | null
          referred_by: string | null
          restrict_reason: string | null
          server: string | null
          showcase_achievement_ids: string[]
          streak_days: number
          token_balance: number
          updated_at: string
          vip_tier: string
          xp: number
        }
        Insert: {
          accepted_terms?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          chat_color?: string | null
          country?: string | null
          created_at?: string
          discord_full_name?: string | null
          discord_username?: string | null
          email: string
          emblem_status?: string | null
          force_logout_at?: string | null
          full_name: string
          gang_emblem_url?: string | null
          gang_name?: string | null
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id: string
          ingame_name?: string | null
          is_banned?: boolean
          is_muted?: boolean
          is_restricted?: boolean
          last_login_date?: string | null
          longest_streak?: number
          mute_reason?: string | null
          phone?: string | null
          profile_banner_url?: string | null
          profile_title?: string | null
          referral_code?: string | null
          referred_by?: string | null
          restrict_reason?: string | null
          server?: string | null
          showcase_achievement_ids?: string[]
          streak_days?: number
          token_balance?: number
          updated_at?: string
          vip_tier?: string
          xp?: number
        }
        Update: {
          accepted_terms?: boolean
          avatar_url?: string | null
          ban_reason?: string | null
          chat_color?: string | null
          country?: string | null
          created_at?: string
          discord_full_name?: string | null
          discord_username?: string | null
          email?: string
          emblem_status?: string | null
          force_logout_at?: string | null
          full_name?: string
          gang_emblem_url?: string | null
          gang_name?: string | null
          gang_type?: Database["public"]["Enums"]["gang_type"] | null
          id?: string
          ingame_name?: string | null
          is_banned?: boolean
          is_muted?: boolean
          is_restricted?: boolean
          last_login_date?: string | null
          longest_streak?: number
          mute_reason?: string | null
          phone?: string | null
          profile_banner_url?: string | null
          profile_title?: string | null
          referral_code?: string | null
          referred_by?: string | null
          restrict_reason?: string | null
          server?: string | null
          showcase_achievement_ids?: string[]
          streak_days?: number
          token_balance?: number
          updated_at?: string
          vip_tier?: string
          xp?: number
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
        Relationships: [
          {
            foreignKeyName: "promo_code_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          max_uses: number | null
          target_user_ids: string[] | null
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
          max_uses?: number | null
          target_user_ids?: string[] | null
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
          max_uses?: number | null
          target_user_ids?: string[] | null
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
            referencedRelation: "promo_code_usage_log"
            referencedColumns: ["promo_id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referee_bonus: number
          referee_id: string
          referrer_bonus: number
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referee_bonus?: number
          referee_id: string
          referrer_bonus?: number
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referee_bonus?: number
          referee_id?: string
          referrer_bonus?: number
          referrer_id?: string
        }
        Relationships: []
      }
      season_points: {
        Row: {
          correct_scores: number
          id: string
          points: number
          season_id: string
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          correct_scores?: number
          id?: string
          points?: number
          season_id: string
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          correct_scores?: number
          id?: string
          points?: number
          season_id?: string
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "season_points_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          name: string
          reward_structure: Json | null
          starts_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          reward_structure?: Json | null
          starts_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          reward_structure?: Json | null
          starts_at?: string
        }
        Relationships: []
      }
      spins: {
        Row: {
          amount: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      spotlights: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          headline: string
          id: string
          is_active: boolean
          message: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          headline: string
          id?: string
          is_active?: boolean
          message?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          headline?: string
          id?: string
          is_active?: boolean
          message?: string | null
          user_id?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "ticket_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        Relationships: [
          {
            foreignKeyName: "token_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          awarded_at: string
          code: string
          description: string | null
          icon: string | null
          id: string
          title: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          code: string
          description?: string | null
          icon?: string | null
          id?: string
          title: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          code?: string
          description?: string | null
          icon?: string | null
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_challenge_progress: {
        Row: {
          challenge_id: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          period_key: string
          progress: number
          user_id: string
        }
        Insert: {
          challenge_id: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          period_key?: string
          progress?: number
          user_id: string
        }
        Update: {
          challenge_id?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          period_key?: string
          progress?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          last_seen: string
          route: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          last_seen?: string
          route?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          last_seen?: string
          route?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          reward_tokens: number
          status: string
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_tokens?: number
          status?: string
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reward_tokens?: number
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_house_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          balance_after: number
          bet_id: string | null
          created_at: string
          id: string
          kind: string
          match_id: string | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount: number
          balance_after: number
          bet_id?: string | null
          created_at?: string
          id?: string
          kind: string
          match_id?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number
          balance_after?: number
          bet_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          match_id?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      virtual_house_wallet: {
        Row: {
          balance: number
          id: number
          total_in: number
          total_out: number
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: number
          total_in?: number
          total_out?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: number
          total_in?: number
          total_out?: number
          updated_at?: string
        }
        Relationships: []
      }
      virtual_payout_requests: {
        Row: {
          amount: number
          bet_id: string
          claimed_at: string | null
          created_at: string
          decline_reason: string | null
          id: string
          match_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          bet_id: string
          claimed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          match_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stake: number
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          bet_id?: string
          claimed_at?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          match_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          stake?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
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
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      hot_bets_v1: {
        Row: {
          avg_odds: number | null
          bets_count: number | null
          last_bet_at: string | null
          market_name: string | null
          match_id: string | null
          match_name: string | null
          selection_label: string | null
          total_stake: number | null
          users_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bet_selections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bet_selections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_real_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage_log: {
        Row: {
          amount: number | null
          code: string | null
          created_by: string | null
          expires_at: string | null
          generated_at: string | null
          generated_by_email: string | null
          generated_by_name: string | null
          is_active: boolean | null
          max_uses: number | null
          promo_id: string | null
          redemption_id: string | null
          target_user_ids: string[] | null
          usage_limit: number | null
          used_at: string | null
          used_by: string | null
          used_by_email: string | null
          used_by_gang_name: string | null
          used_by_name: string | null
          used_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage_v2: {
        Row: {
          code: string | null
          code_amount: number | null
          email: string | null
          full_name: string | null
          gang_name: string | null
          ingame_name: string | null
          promo_id: string | null
          redeemed_amount: number | null
          redeemed_at: string | null
          redemption_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_code_usage_log"
            referencedColumns: ["promo_id"]
          },
          {
            foreignKeyName: "promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_real_matches: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          home_score: number | null
          home_team_id: string | null
          id: string | null
          is_archived: boolean | null
          is_featured: boolean | null
          is_virtual: boolean | null
          location: string | null
          lock_time: string | null
          locked_at: string | null
          locked_by: string | null
          name: string | null
          settled_at: string | null
          settled_by: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["match_status"] | null
          updated_at: string | null
          virtual_first_blood_team_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string | null
          is_archived?: boolean | null
          is_featured?: boolean | null
          is_virtual?: boolean | null
          location?: string | null
          lock_time?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name?: string | null
          settled_at?: string | null
          settled_by?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"] | null
          updated_at?: string | null
          virtual_first_blood_team_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          home_score?: number | null
          home_team_id?: string | null
          id?: string | null
          is_archived?: boolean | null
          is_featured?: boolean | null
          is_virtual?: boolean | null
          location?: string | null
          lock_time?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name?: string | null
          settled_at?: string | null
          settled_by?: string | null
          start_time?: string | null
          status?: Database["public"]["Enums"]["match_status"] | null
          updated_at?: string | null
          virtual_first_blood_team_id?: string | null
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
    }
    Functions: {
      admin_adjust_xp: {
        Args: { _delta: number; _reason?: string; _user_id: string }
        Returns: Json
      }
      admin_award_achievement: {
        Args: {
          _code: string
          _description?: string
          _icon?: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      admin_broadcast: {
        Args: { _body: string; _link: string; _segment: string; _title: string }
        Returns: Json
      }
      admin_delete_bet: {
        Args: { _bet_id: string; _reason?: string; _refund?: boolean }
        Returns: undefined
      }
      admin_exposure_per_match: {
        Args: never
        Returns: {
          bet_count: number
          exposure: number
          match_id: string
          match_name: string
        }[]
      }
      admin_kick_user: {
        Args: { _reason?: string; _user_id: string }
        Returns: Json
      }
      admin_lock_virtual_round: { Args: { _match_id: string }; Returns: Json }
      admin_log_action: {
        Args: {
          _action: string
          _metadata?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: Json
      }
      admin_mark_task_completed: {
        Args: { _task_id: string }
        Returns: undefined
      }
      admin_pnl_summary: { Args: { _days?: number }; Returns: Json }
      admin_refund_bet: {
        Args: { _bet_id: string; _reason?: string }
        Returns: undefined
      }
      admin_review_virtual_payout: {
        Args: { _approve: boolean; _id: string; _reason?: string }
        Returns: Json
      }
      admin_risk_summary: { Args: never; Returns: Json }
      admin_set_virtual_cycle: { Args: { _running: boolean }; Returns: Json }
      admin_suspend_bet: {
        Args: { _bet_id: string; _reason?: string }
        Returns: undefined
      }
      admin_unsuspend_bet: { Args: { _bet_id: string }; Returns: undefined }
      admin_void_bet: {
        Args: { _bet_id: string; _reason?: string; _refund?: boolean }
        Returns: undefined
      }
      apply_referral_code: { Args: { _code: string }; Returns: Json }
      approve_promo_request: {
        Args: { _id: string; _note?: string }
        Returns: string
      }
      auto_resolve_virtual_round: { Args: { _match_id: string }; Returns: Json }
      can_use_gang_chat: { Args: { _user_id: string }; Returns: boolean }
      claim_challenge: { Args: { _progress_id: string }; Returns: Json }
      claim_daily_login: { Args: never; Returns: Json }
      claim_task: { Args: { _task_id: string }; Returns: Json }
      claim_virtual_payout: { Args: { _id: string }; Returns: Json }
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
      house_manual_adjust: {
        Args: { _amount: number; _reason: string }
        Returns: Json
      }
      house_set_paused: {
        Args: { _paused: boolean; _reason?: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_mod_or_admin: { Args: { _user_id: string }; Returns: boolean }
      place_virtual_bet: {
        Args: { _match_id: string; _odd_id: string; _stake: number }
        Returns: Json
      }
      place_virtual_ticket: {
        Args: { _selections: Json; _stake: number }
        Returns: Json
      }
      recalc_vip_tier: { Args: { _user_id: string }; Returns: string }
      redeem_promo_code: { Args: { _code: string }; Returns: Json }
      resolve_virtual_round: {
        Args: {
          _away_score?: number
          _first_blood_team_id?: string
          _home_score?: number
          _match_id: string
        }
        Returns: Json
      }
      review_gang_emblem: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      review_withdrawal_request: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      server_now: { Args: never; Returns: string }
      settle_pay_winning_bet: { Args: { _bet_id: string }; Returns: Json }
      user_cashout_bet: { Args: { _bet_id: string }; Returns: Json }
      verify_xp_consistency: { Args: { _user_id?: string }; Returns: Json }
      virtual_half_score_for_match: {
        Args: { _match_id: string; _max_score?: number }
        Returns: {
          away_score: number
          home_score: number
        }[]
      }
      virtual_score_for_match: {
        Args: { _match_id: string }
        Returns: {
          away_score: number
          first_blood_team_id: string
          home_score: number
        }[]
      }
      virtual_seed_rand: {
        Args: { _i: number; _seed: string }
        Returns: number
      }
      virtual_tick: { Args: never; Returns: Json }
      virtual_wallet_admin_adjust: {
        Args: { _amount: number; _reason: string }
        Returns: Json
      }
      virtual_wallet_credit: {
        Args: {
          _amount: number
          _bet: string
          _kind: string
          _match: string
          _reason: string
          _user: string
        }
        Returns: number
      }
      virtual_wallet_debit: {
        Args: {
          _amount: number
          _bet: string
          _kind: string
          _match: string
          _reason: string
          _user: string
        }
        Returns: number
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
      bet_status:
        | "open"
        | "won"
        | "lost"
        | "cashed_out"
        | "void"
        | "suspended"
        | "refunded"
      chat_room: "general" | "gang" | "moderator"
      gang_type: "G" | "F"
      match_status: "scheduled" | "live" | "ended" | "cancelled"
      ticket_status: "open" | "in_progress" | "pending" | "resolved" | "closed"
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
      bet_status: [
        "open",
        "won",
        "lost",
        "cashed_out",
        "void",
        "suspended",
        "refunded",
      ],
      chat_room: ["general", "gang", "moderator"],
      gang_type: ["G", "F"],
      match_status: ["scheduled", "live", "ended", "cancelled"],
      ticket_status: ["open", "in_progress", "pending", "resolved", "closed"],
      token_request_status: ["pending", "approved", "denied"],
      withdrawal_status: ["pending", "approved", "declined"],
    },
  },
} as const
