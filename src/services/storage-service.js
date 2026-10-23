/**
 * Cloud Storage Service for MIX-IMAGE HTML Archive
 * Handles resilient, resumable file uploads, progress monitoring, and secure paths.
 */

import {
  getFirebaseInstance,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "./firebase-service.js";

function sanitizeFilename(name) {
  return String(name || 'file.html')
    .replace(/[^\w\.\-\u0E00-\u0E7F]/g, '_')
    .slice(0, 100);
}

/**
 * Uploads an HTML file to Cloud Storage with progress updates
 */
export function uploadHtmlFile(fileId, fileOrBlob, filename, onProgress) {
  return new Promise((resolve, reject) => {
    const { storage } = getFirebaseInstance();
    const cleanName = sanitizeFilename(filename || fileOrBlob.name);
    const storagePath = `html_files/${fileId}/${cleanName}`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      contentType: 'text/html; charset=utf-8',
      customMetadata: {
        fileId,
        originalName: filename || fileOrBlob.name || cleanName
      }
    };

    const uploadTask = uploadBytesResumable(storageRef, fileOrBlob, metadata);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (typeof onProgress === 'function') onProgress(percent, snapshot);
      },
      (error) => {
        console.error("Storage upload error:", error);
        reject(error);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ storagePath, downloadUrl, size: uploadTask.snapshot.totalBytes });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Uploads a cover image to Cloud Storage with progress updates
 */
export function uploadCoverImage(fileId, fileOrBlob, onProgress) {
  return new Promise((resolve, reject) => {
    const { storage } = getFirebaseInstance();
    const isJpeg = fileOrBlob.type === 'image/jpeg' || (fileOrBlob.name && /\.jpe?g$/i.test(fileOrBlob.name));
    const ext = isJpeg ? 'jpg' : 'png';
    const storagePath = `covers/${fileId}/cover.${ext}`;
    const storageRef = ref(storage, storagePath);

    const metadata = {
      contentType: fileOrBlob.type || (isJpeg ? 'image/jpeg' : 'image/png'),
      customMetadata: { fileId }
    };

    const uploadTask = uploadBytesResumable(storageRef, fileOrBlob, metadata);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (typeof onProgress === 'function') onProgress(percent);
      },
      (error) => reject(error),
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ storagePath, downloadUrl });
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

/**
 * Uploads multiple preview screenshots
 */
export async function uploadPreviewScreenshots(fileId, files = [], onProgress) {
  const results = [];
  const { storage } = getFirebaseInstance();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const cleanName = sanitizeFilename(file.name || `screenshot-${i + 1}.png`);
    const storagePath = `previews/${fileId}/${cleanName}`;
    const storageRef = ref(storage, storagePath);

    await new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'image/png'
      });
      uploadTask.on(
        'state_changed',
        (snap) => {
          if (typeof onProgress === 'function') {
            const filePercent = (snap.bytesTransferred / snap.totalBytes) * 100;
            const totalPercent = Math.round(((i + filePercent / 100) / files.length) * 100);
            onProgress(totalPercent);
          }
        },
        reject,
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          results.push({ path: storagePath, url: downloadUrl, caption: cleanName });
          resolve();
        }
      );
    });
  }

  return results;
}

/**
 * Deletes a file from Cloud Storage by its storage path
 */
export async function deleteStoragePath(storagePath) {
  if (!storagePath) return;
  try {
    const { storage } = getFirebaseInstance();
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn("Storage deletion warning (file might not exist):", err.message);
  }
}
