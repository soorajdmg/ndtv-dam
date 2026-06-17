// api
import type {
  AssetVariant,
  BatchImage,
  BatchStatusResponse,
  HealthStatus,
  ImageListItem,
  ImageMetadata,
  Organization,
  Person,
  QualityBreakdown,
  ReviewQueueItem,
  ReviewQueueListResponse,
  SearchFilters,
  SearchResultItem,
  SemanticSearchResponse,
  ShortlistResponse,
  UploadBatchResponse,
} from "./types";

import { getStoredToken } from "./auth";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options ?? {};
  const token = getStoredToken();
  const headers = new Headers(optHeaders as HeadersInit | undefined);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...restOptions,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const getHealth = () => apiFetch<HealthStatus>("/health");

// ─── Upload ───────────────────────────────────────────────────────────────────
export async function uploadBatch(
  files: File[],
  submittedBy?: string,
  onProgress?: (pct: number) => void,
): Promise<UploadBatchResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    if (submittedBy) formData.append("submitted_by", submittedBy);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status === 202 || xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("POST", `${BASE_URL}/api/upload/batch`);
    const uploadToken = getStoredToken();
    if (uploadToken) xhr.setRequestHeader("Authorization", `Bearer ${uploadToken}`);
    xhr.send(formData);
  });
}

// ─── Batch ────────────────────────────────────────────────────────────────────
export const getBatchStatus = (batchId: string) =>
  apiFetch<BatchStatusResponse>(`/api/batch/${batchId}/status`);

export const getBatchShortlist = (batchId: string) =>
  apiFetch<ShortlistResponse>(`/api/batch/${batchId}/shortlist`);

export const getBatchImages = (batchId: string, page = 1, pageSize = 50) =>
  apiFetch<{ items: BatchImage[]; total: number; page: number; page_size: number }>(
    `/api/batch/${batchId}/images?page=${page}&page_size=${pageSize}`
  );

export const listBatches = () =>
  apiFetch<{ items: BatchStatusResponse[]; total: number }>("/api/batches");

// ─── Images ───────────────────────────────────────────────────────────────────
export const listImages = (params?: { page?: number; page_size?: number; status?: string }) => {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.status) qs.set("status", params.status);
  return apiFetch<{ items: ImageListItem[]; total: number; page: number; page_size: number }>(
    `/api/images?${qs}`
  );
};

// ─── Persons ──────────────────────────────────────────────────────────────────
export const listPersons = (params?: {
  search?: string;
  category?: string;
  organization?: string;
  page?: number;
  page_size?: number;
}) => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.category) qs.set("category", params.category);
  if (params?.organization) qs.set("organization", params.organization);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  return apiFetch<{ items: Person[]; total: number; page: number; page_size: number }>(
    `/api/persons?${qs}`
  );
};

export const getPerson = (id: string) => apiFetch<Person>(`/api/persons/${id}`);

export const createPerson = (data: {
  full_name: string;
  aliases?: string[];
  designation?: string;
  organization?: string;
  category?: string;
  source?: string;
  person_type?: string;
}) =>
  apiFetch<Person>("/api/persons", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const linkPersonToImage = (imageId: string, personId: string) =>
  apiFetch<{ image_id: string; person_id: string; status: string }>(
    `/api/images/${imageId}/persons`,
    {
      method: "POST",
      body: JSON.stringify({ person_id: personId }),
    }
  );

export const updatePerson = (id: string, data: Partial<Person>) =>
  apiFetch<Person>(`/api/persons/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deletePerson = (id: string) =>
  apiFetch<void>(`/api/persons/${id}`, { method: "DELETE" });

export const mergePersons = (sourceId: string, targetId: string) =>
  apiFetch<{ message: string; target_id: string }>("/api/persons/merge", {
    method: "POST",
    body: JSON.stringify({ source_person_id: sourceId, target_person_id: targetId }),
  });

export const reassignPersonInImage = (imageId: string, oldPersonId: string, newPersonId: string) =>
  apiFetch<{ image_id: string; old_person_id: string; new_person_id: string; status: string }>(
    `/api/images/${imageId}/reassign-person`,
    {
      method: "POST",
      body: JSON.stringify({ old_person_id: oldPersonId, new_person_id: newPersonId }),
    }
  );

export const uploadReferencePhoto = async (
  personId: string,
  file: File,
): Promise<{ message: string; person_id: string; detection_confidence: number; faces_detected: number }> => {
  const formData = new FormData();
  formData.append("file", file);
  const refToken = getStoredToken();
  const res = await fetch(`${BASE_URL}/api/persons/${personId}/reference-photo`, {
    method: "POST",
    headers: refToken ? { Authorization: `Bearer ${refToken}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
};

// ─── Organizations ────────────────────────────────────────────────────────────
export const listOrganizations = () => apiFetch<Organization[]>("/api/organizations");

export const getOrganization = (id: string) => apiFetch<Organization>(`/api/organizations/${id}`);

export const createOrganization = (data: {
  name: string;
  entity_type?: string;
  parent_organization_id?: string;
}) =>
  apiFetch<Organization>("/api/organizations", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateOrganization = (
  id: string,
  data: { name?: string; entity_type?: string; parent_organization_id?: string | null },
) =>
  apiFetch<Organization>(`/api/organizations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const deleteOrganization = (id: string) =>
  apiFetch<void>(`/api/organizations/${id}`, { method: "DELETE" });

export const listPersonsByOrg = (orgId: string, page = 1, pageSize = 20) =>
  apiFetch<{ items: import("./types").Person[]; total: number; page: number; page_size: number }>(
    `/api/organizations/${orgId}/persons?page=${page}&page_size=${pageSize}`
  );

// ─── Search ───────────────────────────────────────────────────────────────────
export const semanticSearch = (query: string, filters: SearchFilters = {}, top_k = 20) =>
  apiFetch<SemanticSearchResponse>("/api/search/semantic", {
    method: "POST",
    body: JSON.stringify({ query_text: query, filters, top_k }),
  });

export const findSimilar = (imageId: string, top_k = 10) =>
  apiFetch<SemanticSearchResponse>("/api/search/similar", {
    method: "POST",
    body: JSON.stringify({ image_id: imageId, top_k }),
  });

export const searchByPerson = (personId: string, page = 1, pageSize = 20) =>
  apiFetch<SemanticSearchResponse>(
    `/api/search/by-person/${personId}?page=${page}&page_size=${pageSize}`
  );

// ─── Assets / Variants ───────────────────────────────────────────────────────
export const getImageVariants = (imageId: string) =>
  apiFetch<AssetVariant[]>(`/api/images/${imageId}/variants`);

export const getImageQuality = (imageId: string) =>
  apiFetch<QualityBreakdown>(`/api/images/${imageId}/quality`);

export const getImageMetadata = (imageId: string) =>
  apiFetch<ImageMetadata>(`/api/images/${imageId}/metadata`);

export const generateImageVariants = (imageId: string) =>
  apiFetch<{ image_id: string; status: string }>(`/api/images/${imageId}/generate-variants`, {
    method: "POST",
  });

export const getVariantDownloadUrl = (variantId: string) =>
  `${BASE_URL}/api/assets/${variantId}/download`;

export const getFaceCropUrl = (detectionId: string) =>
  `${BASE_URL}/api/face-detections/${detectionId}/crop`;

// ─── Review Queue ─────────────────────────────────────────────────────────────
export const getReviewQueue = (page = 1, pageSize = 20, reason?: string) => {
  const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (reason) qs.set("reason", reason);
  return apiFetch<ReviewQueueListResponse>(`/api/review/queue?${qs}`);
};

export const claimReview = (reviewId: string, reviewer: string) =>
  apiFetch<{ review_id: string; status: string; assigned_to: string }>(
    `/api/review/queue/${reviewId}/claim?reviewer=${encodeURIComponent(reviewer)}`,
    { method: "POST" }
  );

export const resolveReview = (
  reviewId: string,
  action: "confirm" | "correct" | "reject",
  personId?: string,
  notes?: string
) =>
  apiFetch<{ review_id: string; status: string; action: string }>(
    `/api/review/queue/${reviewId}/resolve`,
    {
      method: "POST",
      body: JSON.stringify({ action, person_id: personId, notes }),
    }
  );

export const bulkResolveReview = (reviewIds: string[], action: "confirm" | "reject") =>
  apiFetch<{ resolved: number }>("/api/review/bulk-resolve", {
    method: "POST",
    body: JSON.stringify({ review_ids: reviewIds, action }),
  });

// ─── Admin ────────────────────────────────────────────────────────────────────
export const reprocessImage = (imageId: string, stages = "face,clip,variants") =>
  apiFetch<{ image_id: string; enqueued_stages: string[] }>(
    `/api/admin/reprocess-image/${imageId}?stages=${stages}`,
    { method: "POST" }
  );
