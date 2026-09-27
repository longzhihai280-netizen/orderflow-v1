export type Role = "ADMIN" | "EMPLOYEE";
export type Priority = "NORMAL" | "HIGH" | "URGENT";
export type WorkflowStatus = "UNASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type AuxiliaryStatus = "NONE" | "PENDING_CONFIRMATION" | "OUT_OF_STOCK";
export type FileSection = "ORIGINAL" | "PICKING" | "INVOICE" | "TICKET";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: Role;
  active: boolean;
  can_change_priority: boolean;
  can_change_aux_status: boolean;
  created_at: string;
}

export interface OrderSummary {
  id: string;
  order_date: string;
  daily_order_number: number;
  customer_name: string;
  original_text: string | null;
  notes: string | null;
  picking_text: string | null;
  priority: Priority;
  workflow_status: WorkflowStatus;
  auxiliary_status: AuxiliaryStatus;
  accepted_by: string | null;
  accepted_at: string | null;
  accepted_by_username: string | null;
  accepted_by_display_name: string | null;
  created_by: string;
  created_by_username: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  picking_ready: boolean;
  invoice_ready: boolean;
  ticket_ready: boolean;
}

export interface OrderFile {
  id: string;
  order_id: string;
  section_type: FileSection;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  uploader_username?: string;
  uploaded_at: string;
  deleted_at: string | null;
}

export interface ActivityLog {
  id: number;
  order_id: string;
  user_id: string | null;
  actor_username: string | null;
  actor_display_name: string | null;
  action_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface OrderDetailResponse {
  order: OrderSummary;
  files: OrderFile[];
  activity: ActivityLog[];
}

export interface OrderStatistics {
  total: number;
  completed: number;
  unassigned: number;
  in_progress: number;
  pending_confirmation: number;
  out_of_stock: number;
}
