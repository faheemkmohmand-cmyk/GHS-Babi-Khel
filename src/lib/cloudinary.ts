// src/lib/cloudinary.ts
// Cloudinary unsigned upload helper — supports images AND PDFs (raw files)

const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

/**
 * Upload a file to Cloudinary and return its secure URL.
 * Works for images (jpg/png) AND documents (pdf).
 * Uses /auto/upload which handles both resource types.
 */
export async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      "Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env"
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  // Use AbortController for a 60-second timeout (important on slow mobile)
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 60_000);

  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData, signal: controller.signal }
    );
  } catch (fetchErr: any) {
    clearTimeout(timeoutId);
    if (fetchErr?.name === "AbortError") {
      throw new Error("Upload timed out. Check your internet connection and try again.");
    }
    throw new Error("Network error during upload. Please check your connection.");
  } finally {
    clearTimeout(timeoutId);
  }

  // Parse response safely
  let json: any = {};
  try {
    json = await res.json();
  } catch {
    throw new Error("Unexpected response from Cloudinary. Please try again.");
  }

  if (!res.ok) {
    // Cloudinary error object: { error: { message: "..." } }
    throw new Error(json?.error?.message || `Cloudinary upload failed (${res.status})`);
  }

  if (!json.secure_url) {
    throw new Error("Cloudinary did not return a file URL. Please try again.");
  }

  return json.secure_url as string;
}
