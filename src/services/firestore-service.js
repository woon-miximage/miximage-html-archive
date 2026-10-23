/**
 * Cloud Firestore Service for MIX-IMAGE HTML Archive
 * Real-time subscriptions (onSnapshot), document CRUD, deduplication query, and favorites.
 */

import {
  getFirebaseInstance,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "./firebase-service.js";

import { getCurrentUser } from "./auth-service.js";

/**
 * Subscribes to real-time updates for all accessible HTML files.
 * Returns an unsubscribe callback for proper cleanup.
 */
export function subscribeHtmlFiles(onSuccess, onError) {
  const { db } = getFirebaseInstance();
  if (!db) {
    if (typeof onError === 'function') onError(new Error("Database not initialized"));
    return () => {};
  }

  const q = query(
    collection(db, "html_files"),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
        });
      });
      onSuccess(items, snapshot.metadata.hasPendingWrites, snapshot.metadata.fromCache);
    },
    (err) => {
      console.error("Firestore onSnapshot error:", err);
      if (typeof onError === 'function') onError(err);
    }
  );
}

/**
 * Checks if a file with the given contentHash already exists in Firestore.
 */
export async function findByContentHash(contentHash) {
  if (!contentHash) return null;
  const { db } = getFirebaseInstance();
  const q = query(
    collection(db, "html_files"),
    where("contentHash", "==", contentHash)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const first = snap.docs[0];
  return { id: first.id, ...first.data() };
}

/**
 * Adds a new HTML file metadata record to Firestore.
 */
export async function createHtmlFileRecord(data) {
  const { db } = getFirebaseInstance();
  const user = getCurrentUser();

  const docRef = doc(collection(db, "html_files"));
  const payload = {
    title: data.title || data.originalFilename || "Untitled HTML",
    description: data.description || "",
    categoryId: data.categoryId || "prompt-pack",
    categoryName: data.categoryName || "Prompt Pack",
    tags: Array.isArray(data.tags) ? data.tags : [],
    originalFilename: data.originalFilename || "file.html",
    htmlStoragePath: data.htmlStoragePath,
    htmlDownloadUrl: data.htmlDownloadUrl || "",
    coverStoragePath: data.coverStoragePath || "",
    coverDownloadUrl: data.coverDownloadUrl || "",
    coverType: data.coverType || "auto",
    previewImages: Array.isArray(data.previewImages) ? data.previewImages : [],
    fileSize: Number(data.fileSize) || 0,
    contentHash: data.contentHash || "",
    notes: data.notes || "",
    visibility: data.visibility || "public",
    favoriteCount: 0,
    createdBy: user?.uid || "anonymous",
    createdByName: user?.displayName || user?.email || "Anonymous",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(docRef, payload);
  await logActivity('create', { fileId: docRef.id, title: payload.title });
  return { id: docRef.id, ...payload };
}

/**
 * Updates an existing HTML file record.
 */
export async function updateHtmlFileRecord(id, updates) {
  const { db } = getFirebaseInstance();
  const docRef = doc(db, "html_files", id);

  const payload = {
    ...updates,
    updatedAt: serverTimestamp()
  };

  delete payload.id;
  delete payload.createdAt;
  delete payload.createdBy;

  await updateDoc(docRef, payload);
  await logActivity('update', { fileId: id, fields: Object.keys(updates) });
}

/**
 * Deletes an HTML file record from Firestore.
 */
export async function deleteHtmlFileRecord(id, title = "") {
  const { db } = getFirebaseInstance();
  const docRef = doc(db, "html_files", id);
  await deleteDoc(docRef);
  await logActivity('delete', { fileId: id, title });
}

/**
 * Subscribes to categories collection.
 */
export function subscribeCategories(onSuccess) {
  const { db } = getFirebaseInstance();
  if (!db) return () => {};

  const q = query(collection(db, "categories"), orderBy("order", "asc"));
  return onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    onSuccess(list);
  }, (err) => {
    console.warn("Category subscription fallback:", err);
  });
}

/**
 * Subscribes to user favorites subcollection: users/{uid}/favorites
 */
export function subscribeUserFavorites(uid, onSuccess) {
  if (!uid) return () => {};
  const { db } = getFirebaseInstance();
  const colRef = collection(db, "users", uid, "favorites");
  return onSnapshot(colRef, (snap) => {
    const favSet = new Set();
    snap.forEach((d) => favSet.add(d.id));
    onSuccess(favSet);
  }, () => onSuccess(new Set()));
}

/**
 * Toggles a file in user's favorites
 */
export async function toggleUserFavorite(uid, fileId, isFavorited) {
  if (!uid || !fileId) return;
  const { db } = getFirebaseInstance();
  const favDoc = doc(db, "users", uid, "favorites", fileId);

  if (isFavorited) {
    await deleteDoc(favDoc);
  } else {
    await setDoc(favDoc, {
      fileId,
      favoritedAt: serverTimestamp()
    });
  }
}

/**
 * Logs an administrative action to activity_logs
 */
export async function logActivity(action, details = {}) {
  try {
    const { db } = getFirebaseInstance();
    const user = getCurrentUser();
    if (!db || !user) return;

    await addDoc(collection(db, "activity_logs"), {
      action,
      userId: user.uid,
      userEmail: user.email || "",
      timestamp: serverTimestamp(),
      details
    });
  } catch (_) {
    // Silent fail for non-blocking logging
  }
}
