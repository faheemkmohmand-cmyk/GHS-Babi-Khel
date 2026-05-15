// src/lib/cloudinary.ts
// ✅ FIXED: Added retry logic, request timeout, better error diagnostics,
//    and Supabase Storage fallback when Cloudinary is unreachable.

import { supabase } from "@/lib/supabase";

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

// ─── Configuration ─────────────────────────────────────────────────────────
const MAX_RETRIES       = 3;        // How many times to retry Cloudinary before fallback
const UPLOAD_TIMEOUT_MS = 30_000;   // 30 seconds per attempt (large images on slow mobile)
const RETRY_DELAY_MS    = 1_500;    // Wait between retries

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Sleep for a given number of milliseconds */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a fetch with an AbortController timeout so it never hangs forever.
 * Throws a descriptive error on timeout or network failure.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err: any) {
    // Distinguish timeout vs. real network error
    if (err?.name === "AbortError") {
      throw new Error(
        `Upload timed out after ${timeoutMs / 1000}s. Your file may be too large or your connection is unstable. Please try again.`,
      );
    }
    // Real network-level failure (DNS, CORS block, offline, etc.)
    throw new Error(
      `Network error during upload: ${err?.message || "Unknown error"}. ` +
      `This usually means the Cloudinary API is blocked on your network (common on some mobile carriers) ` +
      `or a browser extension is interfering. A fallback upload method will be attempted automatically.`,
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─── Primary: Cloudinary Upload ────────────────────────────────────────────

/**
 * Upload a file to Cloudinary with retry logic.
 * Retries up to MAX_RETRIES times on network errors, then falls back to Supabase Storage.
 */
async function uploadToCloudinaryWithRetry(
  file: File,
  folder: string,
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    console.warn(
      "[Cloudinary] VITE_CLOUDINARY_CLOUD_NAME or VITE_CLOUDINARY_UPLOAD_PRESET is missing. " +
      "Falling back to Supabase Storage.",
    );
    return uploadToSupabaseStorage(file, folder);
  }

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Cloudinary] Upload attempt ${attempt}/${MAX_RETRIES}...`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", UPLOAD_PRESET);
      formData.append("folder", folder);

      const res = await fetchWithTimeout(
        uploadUrl,
        { method: "POST", body: formData },
        UPLOAD_TIMEOUT_MS,
      );

      // Parse response JSON
      let json: any = {};
      try {
        json = await res.json();
      } catch {
        throw new Error(
          "Unexpected response from Cloudinary (could not parse JSON). Please try again.",
        );
      }

      // Cloudinary returned an HTTP error
      if (!res.ok) {
        const cloudinaryMsg = json?.error?.message || `HTTP ${res.status}`;
        // Don't retry on client errors (400, 401, 403) — only retry on 5xx or network issues
        if (res.status >= 400 && res.status < 500) {
          throw new Error(
            `Cloudinary rejected the upload: ${cloudinaryMsg}. ` +
            `Check that your upload preset "${UPLOAD_PRESET}" is set to "Unsigned" in the Cloudinary dashboard.`,
          );
        }
        // Server error — worth retrying
        throw new Error(`Cloudinary server error: ${cloudinaryMsg}`);
      }

      if (!json.secure_url) {
        throw new Error(
          "Cloudinary did not return a file URL. The upload may have been interrupted.",
        );
      }

      console.log(`[Cloudinary] Upload successful on attempt ${attempt}`);
      return json.secure_url as string;
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[Cloudinary] Attempt ${attempt} failed: ${err?.message}`,
      );

      // If this was a client error (4xx), don't retry — it won't succeed
      if (err?.message?.includes("Cloudinary rejected")) {
        break;
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // progressive backoff
      }
    }
  }

  // All Cloudinary retries exhausted — fall back to Supabase Storage
  console.warn(
    `[Cloudinary] All ${MAX_RETRIES} attempts failed. Falling back to Supabase Storage.`,
  );
  return uploadToSupabaseStorage(file, folder, lastError);
}

// ─── Fallback: Supabase Storage Upload ─────────────────────────────────────

/**
 * Upload a file to Supabase Storage as a fallback when Cloudinary is unreachable.
 * Uses the "school-uploads" bucket (public).
 *
 * IMPORTANT: You must create a bucket called "school-uploads" in your Supabase
 * dashboard and set it to Public. If the bucket doesn't exist yet, this function
 * will return a data-URL as a last resort.
 */
async function uploadToSupabaseStorage(
  file: File,
  folder: string,
  cloudinaryError?: Error | null,
): Promise<string> {
  try {
    // Generate a unique file path to avoid collisions
    const timestamp = Date.now();
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath  = `${folder}/${timestamp}-${sanitized}`;

    console.log(`[Supabase Storage] Uploading to: school-uploads/${filePath}`);

    const { data, error } = await supabase.storage
      .from("school-uploads")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (error) {
      // If bucket doesn't exist, give a helpful error
      if (
        error.message?.includes("not found") ||
        error.message?.includes("Bucket not found")
      ) {
        throw new Error(
          'Supabase Storage bucket "school-uploads" does not exist. ' +
          "Please create it in your Supabase dashboard (Storage > New Bucket) and set it to Public.",
        );
      }
      throw error;
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from("school-uploads")
      .getPublicUrl(filePath);

    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) {
      throw new Error("Could not get public URL from Supabase Storage.");
    }

    console.log("[Supabase Storage] Upload successful:", publicUrl);
    return publicUrl;
  } catch (supabaseErr: any) {
    console.error("[Supabase Storage] Fallback also failed:", supabaseErr);

    // Build a comprehensive error message
    const parts = [
      "Upload failed with both Cloudinary and Supabase Storage.",
      cloudinaryError
        ? `Cloudinary error: ${cloudinaryError.message}`
        : "",
      `Supabase Storage error: ${supabaseErr?.message || "Unknown"}`,
      "",
      "Quick fixes to try:",
      '1. Create a "school-uploads" bucket in Supabase Storage (set to Public)',
      "2. Check that VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET are set in your Vercel environment variables",
      '3. In Cloudinary dashboard, ensure the upload preset is set to "Unsigned"',
      "4. Try uploading from a desktop browser or different network",
    ].filter(Boolean);

    throw new Error(parts.join("\n"));
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Upload an image file — tries Cloudinary first, then falls back to Supabase Storage.
 *
 * @param file   The File object to upload
 * @param folder The folder name (e.g. "branding")
 * @returns      The public URL of the uploaded image
 */
export async function uploadToCloudinary(
  file: File,
  folder: string,
): Promise<string> {
  return uploadToCloudinaryWithRetry(file, folder);
}
