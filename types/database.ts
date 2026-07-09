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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          detail: Json | null
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          detail?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "activity_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_logs: {
        Row: {
          acted_at: string | null
          action: string
          approver_id: string
          booking_id: string
          id: string
          note: string | null
          step: number
        }
        Insert: {
          acted_at?: string | null
          action: string
          approver_id: string
          booking_id: string
          id?: string
          note?: string | null
          step: number
        }
        Update: {
          acted_at?: string | null
          action?: string
          approver_id?: string
          booking_id?: string
          id?: string
          note?: string | null
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_logs_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "approval_logs_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "pending_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_tokens: {
        Row: {
          approver_id: string
          booking_id: string
          created_at: string | null
          expires_at: string
          id: string
          is_used: boolean
          step: number
        }
        Insert: {
          approver_id: string
          booking_id: string
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          step: number
        }
        Update: {
          approver_id?: string
          booking_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_tokens_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "approval_tokens_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "pending_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_slots: {
        Row: {
          booking_id: string
          end_time: string
          id: string
          room_id: string | null
          start_time: string
        }
        Insert: {
          booking_id: string
          end_time: string
          id?: string
          room_id?: string | null
          start_time: string
        }
        Update: {
          booking_id?: string
          end_time?: string
          id?: string
          room_id?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "pending_approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          activity: string
          attendees: number
          cancellation_reason: string | null
          created_at: string | null
          current_step: number
          end_time: string
          final_status: string
          gcal_event_id: string | null
          id: string
          ref_id: string | null
          requester_id: string
          room_id: string
          start_time: string
          title: string
        }
        Insert: {
          activity: string
          attendees: number
          cancellation_reason?: string | null
          created_at?: string | null
          current_step?: number
          end_time: string
          final_status?: string
          gcal_event_id?: string | null
          id?: string
          ref_id?: string | null
          requester_id: string
          room_id: string
          start_time: string
          title: string
        }
        Update: {
          activity?: string
          attendees?: number
          cancellation_reason?: string | null
          created_at?: string | null
          current_step?: number
          end_time?: string
          final_status?: string
          gcal_event_id?: string | null
          id?: string
          ref_id?: string | null
          requester_id?: string
          room_id?: string
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "bookings_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "room_utilization_monthly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_logs: {
        Row: {
          booking_id: string
          cancelled_at: string | null
          cancelled_by: string
          id: string
          prev_status: string
          reason: string
          role: string
        }
        Insert: {
          booking_id: string
          cancelled_at?: string | null
          cancelled_by: string
          id?: string
          prev_status: string
          reason: string
          role: string
        }
        Update: {
          booking_id?: string
          cancelled_at?: string | null
          cancelled_by?: string
          id?: string
          prev_status?: string
          reason?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "pending_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_logs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "cancellation_logs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_type: string
          consented_at: string
          id: string
          policy_version: string
          user_id: string
        }
        Insert: {
          consent_type: string
          consented_at?: string
          id?: string
          policy_version?: string
          user_id: string
        }
        Update: {
          consent_type?: string
          consented_at?: string
          id?: string
          policy_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "consent_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health: {
        Row: {
          created_at: string | null
          error_detail: string | null
          id: string
          payload: Json | null
          service: string
          status: string
        }
        Insert: {
          created_at?: string | null
          error_detail?: string | null
          id?: string
          payload?: Json | null
          service: string
          status: string
        }
        Update: {
          created_at?: string | null
          error_detail?: string | null
          id?: string
          payload?: Json | null
          service?: string
          status?: string
        }
        Relationships: []
      }
      line_link_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_used: boolean
          otp: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          otp: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          otp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_link_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "line_link_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          event_key: string
          id: string
          is_read: boolean
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          event_key: string
          id?: string
          is_read?: boolean
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          event_key?: string
          id?: string
          is_read?: boolean
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          capacity: number
          created_at: string | null
          equipment: Json
          id: string
          name: string
          status: string
        }
        Insert: {
          capacity: number
          created_at?: string | null
          equipment?: Json
          id?: string
          name: string
          status?: string
        }
        Update: {
          capacity?: number
          created_at?: string | null
          equipment?: Json
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      secret_rotation_log: {
        Row: {
          id: string
          reason: string
          rotated_at: string | null
          rotated_by: string | null
          secret_name: string
        }
        Insert: {
          id?: string
          reason: string
          rotated_at?: string | null
          rotated_by?: string | null
          secret_name: string
        }
        Update: {
          id?: string
          reason?: string
          rotated_at?: string | null
          rotated_by?: string | null
          secret_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "secret_rotation_log_rotated_by_fkey"
            columns: ["rotated_by"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "secret_rotation_log_rotated_by_fkey"
            columns: ["rotated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          activity_log_retention_months: number
          admin_id: string | null
          approver1_id: string | null
          approver2_id: string | null
          discord_enabled: boolean
          holidays: Json
          id: string
          integration_log_retention_months: number
          line_enabled: boolean
          line_token_retention_days: number
          notification_settings: Json
          office_end_hour: number
          office_start_hour: number
          setup_completed: boolean
          updated_at: string | null
          welpru_enabled: boolean
        }
        Insert: {
          activity_log_retention_months?: number
          admin_id?: string | null
          approver1_id?: string | null
          approver2_id?: string | null
          discord_enabled?: boolean
          holidays?: Json
          id?: string
          integration_log_retention_months?: number
          line_enabled?: boolean
          line_token_retention_days?: number
          notification_settings?: Json
          office_end_hour?: number
          office_start_hour?: number
          setup_completed?: boolean
          updated_at?: string | null
          welpru_enabled?: boolean
        }
        Update: {
          activity_log_retention_months?: number
          admin_id?: string | null
          approver1_id?: string | null
          approver2_id?: string | null
          discord_enabled?: boolean
          holidays?: Json
          id?: string
          integration_log_retention_months?: number
          line_enabled?: boolean
          line_token_retention_days?: number
          notification_settings?: Json
          office_end_hour?: number
          office_start_hour?: number
          setup_completed?: boolean
          updated_at?: string | null
          welpru_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "system_config_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "system_config_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_config_approver1_id_fkey"
            columns: ["approver1_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "system_config_approver1_id_fkey"
            columns: ["approver1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_config_approver2_id_fkey"
            columns: ["approver2_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "system_config_approver2_id_fkey"
            columns: ["approver2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          department: string | null
          email: string
          full_name: string
          id: string
          line_user_id: string | null
          phone: string | null
          role: string
          staff_id: string | null
          welpru_verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email: string
          full_name: string
          id: string
          line_user_id?: string | null
          phone?: string | null
          role?: string
          staff_id?: string | null
          welpru_verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          line_user_id?: string | null
          phone?: string | null
          role?: string
          staff_id?: string | null
          welpru_verified_at?: string | null
        }
        Relationships: []
      }
      welpru_link_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          is_used: boolean
          staff_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          staff_id: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean
          staff_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "welpru_link_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "booking_detail"
            referencedColumns: ["requester_id"]
          },
          {
            foreignKeyName: "welpru_link_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      booking_detail: {
        Row: {
          activity: string | null
          attendees: number | null
          cancellation_reason: string | null
          created_at: string | null
          current_step: number | null
          end_time: string | null
          final_status: string | null
          gcal_event_id: string | null
          id: string | null
          ref_id: string | null
          requester_department: string | null
          requester_email: string | null
          requester_id: string | null
          requester_line_id: string | null
          requester_name: string | null
          room_capacity: number | null
          room_equipment: Json | null
          room_id: string | null
          room_name: string | null
          start_time: string | null
          title: string | null
        }
        Relationships: []
      }
      department_booking_summary: {
        Row: {
          approved_count: number | null
          department: string | null
          rejected_cancelled_count: number | null
          total_bookings: number | null
          total_hours: number | null
        }
        Relationships: []
      }
      integration_monthly_usage: {
        Row: {
          failed_count: number | null
          last_called_at: string | null
          service: string | null
          success_count: number | null
          total_calls: number | null
        }
        Relationships: []
      }
      pending_approvals: {
        Row: {
          activity: string | null
          attendees: number | null
          created_at: string | null
          current_step: number | null
          end_time: string | null
          final_status: string | null
          id: string | null
          ref_id: string | null
          requester_email: string | null
          requester_line_id: string | null
          requester_name: string | null
          room_name: string | null
          start_time: string | null
          steps_done: number | null
          title: string | null
          waiting_minutes: number | null
        }
        Relationships: []
      }
      room_utilization_monthly: {
        Row: {
          booking_count: number | null
          capacity: number | null
          id: string | null
          name: string | null
          used_hours: number | null
        }
        Relationships: []
      }
      staff_activity_timeline: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          detail: string | null
          event_type: string | null
          id: string | null
          occurred_at: string | null
          related_id: string | null
          related_ref: string | null
          sub_type: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      anonymize_user_on_delete_request: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      auth_role: { Args: never; Returns: string }
      check_slot_available: {
        Args: { p_end: string; p_room_id: string; p_start: string }
        Returns: boolean
      }
      cleanup_old_logs: { Args: never; Returns: undefined }
      requester_check: { Args: { p_booking_id: string }; Returns: boolean }
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
