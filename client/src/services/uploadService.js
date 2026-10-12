
import axios from 'axios';

/**
 * Uploads ONE image straight from the browser to Cloudinary, using the signature the backend created.
 * (Plain axios on purpose: this request goes to Cloudinary, not to our API, and must not carry our admin token.)
 * onProgress(0-100) is called while the file is being sent.
 * → { url, publicId, width, height }
 */
export async function uploadToCloudinary(file, signature, onProgress) {
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', signature.timestamp);
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('allowed_formats', signature.allowedFormats);

  try {
    const { data } = await axios.post(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, form, {
      timeout: 120000,
      onUploadProgress: (e) => { if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100)); },
    });
    return { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height };
  } catch (err) {
    throw new Error(err.response?.data?.error?.message || 'The upload failed. Check your connection and try again.');
  }
}
