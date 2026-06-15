"use client";
import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Upload, X, FileImage, AlertCircle } from "lucide-react";
import { uploadBatch } from "@/lib/api";
import { formatBytes, cn } from "@/lib/utils";

const ACCEPTED_TYPES = { "image/jpeg": [], "image/png": [], "image/webp": [] };
const MAX_SIZE = 20 * 1024 * 1024;

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    const newErrors: string[] = [];
    rejected.forEach((r) => {
      newErrors.push(`${r.file.name}: ${r.errors[0]?.message ?? "Invalid file"}`);
    });
    setErrors(newErrors);
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setProgress(0);
    try {
      const response = await uploadBatch(files, undefined, setProgress);
      toast.success(`Batch uploaded! ${response.queued_images} images queued.`);
      if (response.rejected_files.length) {
        toast.error(`${response.rejected_files.length} files rejected.`);
      }
      router.push(`/batches/${response.batch_id}`);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Upload Images</h1>
        <p className="text-gray-400 text-sm mt-1">Upload up to 500 images per batch (JPEG, PNG, WebP — max 20MB each)</p>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
          isDragActive
            ? "border-brand-gold bg-brand-gold/10"
            : "border-surface-border hover:border-brand-gold/50 hover:bg-surface-hover"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
        <p className="text-white font-medium">
          {isDragActive ? "Drop images here" : "Drag & drop images or click to browse"}
        </p>
        <p className="text-gray-500 text-sm mt-1">JPEG, PNG, WebP — up to 20MB each</p>
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-1">
          {errors.map((err, i) => (
            <p key={i} className="text-sm text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {err}
            </p>
          ))}
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-white">{files.length} files selected</h2>
            <button
              onClick={() => setFiles([])}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {files.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-card border border-surface-border"
              >
                <FileImage className="w-4 h-4 text-brand-gold shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Uploading...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-surface-border rounded-full h-2">
            <div
              className="bg-brand-gold h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleUpload}
        disabled={!files.length || uploading}
        className="w-full py-3 rounded-xl bg-brand-gold hover:bg-brand-gold-light text-brand-navy font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? "Uploading..." : `Upload ${files.length} ${files.length === 1 ? "Image" : "Images"}`}
      </button>
    </div>
  );
}
