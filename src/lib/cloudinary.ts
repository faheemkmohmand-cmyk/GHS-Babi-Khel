// src/lib/cloudinary.ts
const CLOUD_NAME    = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME    as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

export async function uploadToCloudinary(file: File, folder: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error("Cloudinary not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", folder);

  let res: Response;
  try {
    res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    );
  } catch {
    throw new Error("Network error during upload. Please check your connection.");
  }

  let json: any = {};
  try { json = await res.json(); } catch {
    throw new Error("Unexpected response from Cloudinary. Please try again.");
  }

  if (!res.ok) {
    throw new Error(json?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  if (!json.secure_url) {
    throw new Error("Cloudinary did not return a file URL. Please try again.");
  }

  return json.secure_url as string;
}
