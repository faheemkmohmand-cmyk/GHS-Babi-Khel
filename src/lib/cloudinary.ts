// src/lib/cloudinary.ts
// ✅ FIXED: Uses XMLHttpRequest (more reliable on mobile), auto-compresses images
//    before upload, retries on failure, shows upload progress, and gives REAL
//    error messages. NO Supabase — Cloudinary ONLY.

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

// ─── Configuration ─────────────────────────────────────────────────────────
const MAX_RETRIES         = 3;
const UPLOAD_TIMEOUT_MS   = 60_000;   // 60 seconds (large images on slow mobile)
const RETRY_DELAY_MS      = 2_000;    // 2s between retries
const MAX_IMAGE_DIMENSION = 1920;     // Max width/height after compression
const JPEG_QUALITY        = 0.8;      // 80% JPEG quality (good balance)
const TARGET_MAX_BYTES    = 1_500_000; // Target ~1.5MB after compression

// ─── Image Compression ─────────────────────────────────────────────────────

/**
 * Compress an image file before uploading.
 * - Resizes to max 1920px on the longest side
 * - Converts to JPEG at 80% quality
 * - If still > 1.5MB, reduces quality further
 *
 * This is the #1 fix for mobile uploads: a 5MB phone photo becomes ~500KB,
 * making uploads 10x faster and far less likely to timeout on slow networks.
 */
export async function compressImage(file: File): Promise<File> {
  // Only compress image files
  if (!file.type.startsWith("image/")) return file;

  // For GIFs, don't compress (would lose animation)
  if (file.type === "image/gif") return file;

  // For small files, don't bother compressing
  if (file.size < 200_000) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions (maintain aspect ratio)
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height / width) * MAX_IMAGE_DIMENSION);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width / height) * MAX_IMAGE_DIMENSION);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      // Draw to canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Try progressively lower quality until under target size
      const tryQuality = async (q: number): Promise<Blob | null> => {
        return new Promise((r) => {
          canvas.toBlob(
            (blob) => r(blob),
            "image/jpeg",
            q,
          );
        });
      };

      const finalize = async () => {
        let quality = JPEG_QUALITY;
        let blob = await tryQuality(quality);

        // If still too large, reduce quality further
        while (blob && blob.size > TARGET_MAX_BYTES && quality > 0.2) {
          quality -= 0.15;
          blob = await tryQuality(quality);
        }

        if (!blob) {
          // Canvas failed, return original
          resolve(file);
          return;
        }

        // Only use compressed version if it's actually smaller
        if (blob.size >= file.size) {
          resolve(file);
          return;
        }

        const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });

        console.log(
          `[Cloudinary] Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB ` +
          `(${Math.round((1 - compressedFile.size / file.size) * 100)}% smaller)`,
        );

        resolve(compressedFile);
      };

      finalize();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Can't load image, upload original
      resolve(file);
    };

    img.src = url;
  });
}

// ─── Connectivity Check ────────────────────────────────────────────────────

/**
 * Quick check: can we reach Cloudinary's API?
 * Uses a lightweight HEAD request to the ping endpoint.
 */
async function checkCloudinaryReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/ping`,
      { method: "GET", signal: controller.signal },
    );
    clearTimeout(timer);
    // Even a 401 means the API is reachable
    return res.status < 500;
  } catch {
    return false;
  }
}

// ─── Upload via XMLHttpRequest ─────────────────────────────────────────────

export interface UploadProgress {
  loaded: number;   // bytes uploaded
  total: number;    // total bytes
  percent: number;  // 0-100
}

/**
 * Upload to Cloudinary using XMLHttpRequest.
 *
 * WHY XHR instead of fetch():
 * - XHR has built-in upload progress events (fetch doesn't)
 * - XHR works better on mobile browsers with aggressive network proxies
 * - XHR is more battle-tested for file uploads across all browsers
 * - Some Pakistan mobile carriers' proxies handle XHR better than fetch+FormData
 */
function uploadViaXHR(
  file: File,
  folder: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      reject(new Error(
        "Cloudinary is not configured. Please add these environment variables:\n" +
        "• VITE_CLOUDINARY_CLOUD_NAME\n" +
        "• VITE_CLOUDINARY_UPLOAD_PRESET\n\n" +
        "Then redeploy on Vercel (Project Settings → Environment Variables).",
      ));
      return;
    }

    const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
    const xhr = new XMLHttpRequest();

    // Timeout
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    // Progress tracking
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    // Success handler
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);

        if (xhr.status >= 200 && xhr.status < 300 && json.secure_url) {
          resolve(json.secure_url as string);
          return;
        }

        // Cloudinary returned an error
        const errMsg = json?.error?.message || `HTTP ${xhr.status}`;

        if (xhr.status === 400 || xhr.status === 401) {
          reject(new Error(
            `Cloudinary rejected the upload: ${errMsg}\n\n` +
            "This usually means:\n" +
            '• Your upload preset is set to "Signed" instead of "Unsigned"\n' +
            "  Fix: Go to Cloudinary Dashboard → Settings → Upload → Upload Presets\n" +
            '  Find "ghs_school" and change Signing Mode to "Unsigned"\n' +
            "• Or the cloud name / preset name is wrong",
          ));
        } else {
          reject(new Error(`Cloudinary error: ${errMsg}`));
        }
      } catch {
        reject(new Error(
          `Cloudinary returned invalid response (HTTP ${xhr.status}). ` +
          `Please try again.`,
        ));
      }
    };

    // Error handlers
    xhr.onerror = () => {
      reject(new Error(
        "Network error: The upload request failed to reach Cloudinary.\n\n" +
        "This is usually caused by:\n" +
        "• Your mobile carrier blocking uploads to api.cloudinary.com\n" +
        "• A slow/unstable connection (the upload timed out)\n" +
        "• An ad blocker or browser extension interfering\n\n" +
        "Try these fixes:\n" +
        "1. Switch to WiFi instead of mobile data\n" +
        "2. Try a different browser (Chrome recommended)\n" +
        "3. Disable any ad blockers for this site\n" +
        "4. The image will be auto-compressed to make uploads faster",
      ));
    };

    xhr.ontimeout = () => {
      reject(new Error(
        `Upload timed out after ${UPLOAD_TIMEOUT_MS / 1000} seconds. ` +
        "Your connection may be too slow for this file size.\n\n" +
        "The image will be compressed automatically to reduce size. " +
        "If it still fails, try:\n" +
        "1. Use a smaller image\n" +
        "2. Switch to WiFi\n" +
        "3. Try again (the system will retry 3 times automatically)",
      ));
    };

    xhr.onabort = () => {
      reject(new Error("Upload was cancelled."));
    };

    // Build and send request
    xhr.open("POST", uploadUrl);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);
    formData.append("folder", folder);

    xhr.send(formData);
  });
}

// ─── Sleep helper ──────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Upload an image to Cloudinary with:
 * - Automatic image compression (5MB photo → ~500KB)
 * - 3x retry with progressive backoff
 * - Upload progress tracking
 * - Detailed error messages for mobile network issues
 * - Connectivity pre-check
 */
export async function uploadToCloudinary(
  file: File,
  folder: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  // Step 1: Compress the image
  console.log(`[Cloudinary] Original file: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
  const compressedFile = await compressImage(file);
  console.log(`[Cloudinary] Uploading: ${(compressedFile.size / 1024).toFixed(0)}KB to folder "${folder}"`);

  // Step 2: Quick connectivity check (only on first attempt)
  const isReachable = await checkCloudinaryReachable();
  if (!isReachable) {
    console.warn("[Cloudinary] API might be unreachable from this network. Will try anyway...");
    // Don't abort — maybe the ping failed but the upload will work
  }

  // Step 3: Upload with retries
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Cloudinary] Upload attempt ${attempt}/${MAX_RETRIES}...`);
      const url = await uploadViaXHR(compressedFile, folder, onProgress);
      console.log(`[Cloudinary] Upload successful on attempt ${attempt}!`);
      return url;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Cloudinary] Attempt ${attempt} failed: ${err?.message?.substring(0, 100)}`);

      // Don't retry on client errors (wrong preset, etc.) — it won't succeed
      if (err?.message?.includes("Cloudinary rejected")) {
        throw err;
      }

      // Don't retry on abort
      if (err?.message?.includes("cancelled")) {
        throw err;
      }

      // Wait before retrying (progressive backoff)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`[Cloudinary] Retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error("Upload failed after 3 attempts.");
}
