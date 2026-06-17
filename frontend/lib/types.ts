// TypeScript interfaces mirroring Pydantic backend schemas

export interface Person {
  id: string;
  full_name: string;
  aliases: string[];
  designation?: string;
  organization?: string;
  category?: string;
  has_face_embedding?: boolean;
  created_at: string;
  updated_at: string;
  image_count: number;
  organization_links: PersonOrganizationLink[];
}

export interface PersonOrganizationLink {
  organization_id: string;
  designation?: string;
  valid_from?: string;
  valid_to?: string;
}

export interface Organization {
  id: string;
  name: string;
  entity_type?: string;
  parent_organization_id?: string;
  created_at: string;
}

export interface UploadBatch {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "partial_failure";
  total_images: number;
  processed_images: number;
  failed_images: number;
  submitted_by?: string;
  created_at: string;
  completed_at?: string;
}

export interface UploadBatchResponse {
  batch_id: string;
  total_images: number;
  queued_images: number;
  duplicate_images: number;
  rejected_files: string[];
  status: string;
}

export interface BatchStatusResponse {
  batch_id: string;
  status: string;
  total: number;
  processed: number;
  failed: number;
  percent_complete: number;
  estimated_remaining: null;
  created_at: string;
  completed_at?: string;
}

export interface Image {
  id: string;
  batch_id: string;
  original_filename: string;
  storage_path: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  format?: string;
  upload_status: "queued" | "processing" | "completed" | "failed";
  is_duplicate: boolean;
  duplicate_of_id?: string;
  created_at: string;
}

export interface ImagePersonSummary {
  id: string;
  full_name: string;
  designation?: string;
  organization?: string;
  category?: string;
  source?: string;
  person_type?: string;
}

export interface ImageMetadata {
  persons: ImagePersonSummary[];
  semantic_tags: string[];
}

export interface BatchImage {
  id: string;
  original_filename: string;
  storage_path?: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  format?: string;
  upload_status: "queued" | "processing" | "completed" | "failed";
  is_duplicate: boolean;
  duplicate_of_id?: string;
  created_at: string;
  overall_quality_score?: number;
}

export interface ImageListItem {
  id: string;
  batch_id: string;
  original_filename: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  format?: string;
  upload_status: "queued" | "processing" | "completed" | "failed";
  is_duplicate: boolean;
  duplicate_of_id?: string;
  created_at: string;
  overall_quality_score?: number;
  matched_persons: string[];
}

export interface QualityBreakdown {
  sharpness?: number;
  brightness?: number;
  contrast?: number;
  face_visibility?: number;
  composition?: number;
  overall?: number;
}

export interface ShortlistItem {
  rank: number;
  image_id: string;
  original_filename: string;
  storage_path: string;
  selection_reason?: string;
  quality: QualityBreakdown;
  matched_persons: string[];
  variant_ids: string[];
  semantic_tags: string[];
}

export interface ShortlistResponse {
  batch_id: string;
  items: ShortlistItem[];
  total: number;
}

export interface SearchFilters {
  persons?: string[];
  organizations?: string[];
  categories?: string[];
  min_quality_score?: number;
  date_from?: string;
  date_to?: string;
  is_approved?: boolean;
}

export interface SearchResultItem {
  image_id: string;
  score: number;
  storage_path: string;
  original_filename: string;
  overall_quality_score?: number;
  matched_persons: string[];
  batch_id: string;
  upload_date: string;
}

export interface SemanticSearchResponse {
  query: string;
  results: SearchResultItem[];
  total: number;
  fallback_used: boolean;
}

export interface AssetVariant {
  id: string;
  image_id: string;
  variant_type: "transparent_cutout" | "square_gray_bg" | "branded_16_9";
  storage_path?: string;
  width?: number;
  height?: number;
  file_size_bytes?: number;
  generation_status: "pending" | "processing" | "completed" | "failed";
  error_message?: string;
  generated_at?: string;
}

export interface ReviewQueueItem {
  id: string;
  face_detection_id: string;
  image_id: string;
  reason: string;
  status: "pending" | "in_review" | "resolved";
  assigned_to?: string;
  detection_confidence: number;
  ai_guess_person_id?: string;
  ai_guess_person_name?: string;
  ai_similarity_score?: number;
  created_at: string;
}

export interface ReviewQueueListResponse {
  items: ReviewQueueItem[];
  total: number;
  pending_count: number;
  in_review_count: number;
}

export interface HealthStatus {
  service: string;
  status: "ok" | "degraded";
  checks: {
    postgres: string;
    qdrant: string;
    redis: string;
  };
}
