/**
 * Migration & Import Service for MIX-IMAGE HTML Archive
 * Supports legacy JSON backups and loose HTML file packages.
 * Implements cryptographic SHA-256 deduplication, progress reporting, and idempotency.
 */

import { computeContentHash } from "./crypto-service.js";
import { uploadHtmlFile, uploadCoverImage } from "./storage-service.js";
import { createHtmlFileRecord, findByContentHash } from "./firestore-service.js";
import { getCurrentUser } from "./auth-service.js";

function parseHtmlMetadata(htmlString, fallbackName) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const title = (
      doc.querySelector("title")?.textContent ||
      doc.querySelector("h1")?.textContent ||
      fallbackName.replace(/\.html?$/i, "")
    ).trim();
    const description = (
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
      ""
    ).trim();
    return { title, description };
  } catch (_) {
    return { title: fallbackName.replace(/\.html?$/i, ""), description: "" };
  }
}

function inferCategoryFromText(filename, htmlContent) {
  const combined = (filename + " " + htmlContent.slice(0, 8000)).toLowerCase();
  if (/prompt|พรอมต์|gpt image|chibi|ชิบิ|street|drift/.test(combined)) {
    return { id: "prompt-pack", name: "Prompt Pack" };
  }
  if (/canvas|กรอบรูป|งานพิมพ์|ภาพหน้างานศพ|design|editor|draw/.test(combined)) {
    return { id: "design-tools", name: "เครื่องมือออกแบบ" };
  }
  if (/app|dashboard|ui|ux|calc|tool|studio|calculator/.test(combined)) {
    return { id: "web-apps", name: "เว็บแอป" };
  }
  return { id: "templates", name: "เทมเพลต" };
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

/**
 * Migrates a legacy MIX-IMAGE JSON backup into Cloud Firestore and Cloud Storage.
 */
export async function migrateLegacyJsonBackup(backupData, onProgress) {
  const report = {
    startedAt: new Date().toISOString(),
    total: 0,
    imported: [],
    skippedDuplicates: [],
    failed: [],
    completedAt: null
  };

  let entries = [];
  if (typeof backupData === "string") {
    try {
      const parsed = JSON.parse(backupData);
      entries = parsed.entries || [];
    } catch (e) {
      throw new Error("Invalid JSON backup file format: " + e.message);
    }
  } else if (backupData && Array.isArray(backupData.entries)) {
    entries = backupData.entries;
  } else if (Array.isArray(backupData)) {
    entries = backupData;
  } else {
    throw new Error("Invalid backup structure: missing 'entries' array");
  }

  report.total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const filename = entry.fileName || entry.title || `file-${i + 1}.html`;
    const stepLabel = `[${i + 1}/${entries.length}] ${filename}`;

    try {
      if (typeof onProgress === "function") {
        onProgress({
          index: i + 1,
          total: entries.length,
          filename,
          percent: Math.round(((i) / entries.length) * 100),
          status: `กำลังประมวลผล ${filename}...`
        });
      }

      const body = entry.body || "";
      if (!body) {
        report.failed.push({
          filename,
          reason: "Empty or missing HTML body content"
        });
        continue;
      }

      // 1. Calculate SHA-256 content hash
      const contentHash = await computeContentHash(body);

      // 2. Check for existing duplicate in Firestore
      const existing = await findByContentHash(contentHash);
      if (existing) {
        report.skippedDuplicates.push({
          filename,
          existingId: existing.id,
          existingTitle: existing.title,
          contentHash
        });
        continue;
      }

      // 3. Prepare HTML blob & upload to Cloud Storage
      const fileId = "doc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      const htmlBlob = new Blob([body], { type: "text/html;charset=utf-8" });
      const htmlUpload = await uploadHtmlFile(fileId, htmlBlob, filename);

      // 4. Handle cover image if present
      let coverUpload = null;
      if (entry.cover && entry.cover.startsWith("data:image/")) {
        try {
          const coverBlob = dataUrlToBlob(entry.cover);
          coverUpload = await uploadCoverImage(fileId, coverBlob);
        } catch (coverErr) {
          console.warn("Could not upload cover image:", coverErr);
        }
      }

      // 5. Category detection
      const catInfo = entry.category 
        ? { id: entry.category.toLowerCase().replace(/\s+/g, '-'), name: entry.category }
        : inferCategoryFromText(filename, body);

      // 6. Create Firestore metadata record
      const record = await createHtmlFileRecord({
        title: entry.title || filename,
        description: entry.description || "",
        categoryId: catInfo.id,
        categoryName: catInfo.name,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        originalFilename: filename,
        htmlStoragePath: htmlUpload.storagePath,
        htmlDownloadUrl: htmlUpload.downloadUrl,
        coverStoragePath: coverUpload?.storagePath || "",
        coverDownloadUrl: coverUpload?.downloadUrl || "",
        coverType: entry.coverType || (coverUpload ? "custom" : "auto"),
        fileSize: htmlUpload.size || htmlBlob.size,
        contentHash,
        notes: entry.notes || ""
      });

      report.imported.push({
        id: record.id,
        filename,
        title: record.title,
        size: record.fileSize,
        contentHash
      });

    } catch (err) {
      console.error(`Migration error on ${filename}:`, err);
      report.failed.push({
        filename,
        reason: err.message || String(err)
      });
    }
  }

  report.completedAt = new Date().toISOString();
  if (typeof onProgress === "function") {
    onProgress({
      index: entries.length,
      total: entries.length,
      percent: 100,
      status: `เสร็จสิ้น: นำเข้าสำเร็จ ${report.imported.length}, ข้ามไฟล์ซ้ำ ${report.skippedDuplicates.length}, ล้มเหลว ${report.failed.length}`
    });
  }

  return report;
}

/**
 * Migrates a batch of loose HTML File objects into Cloud Storage and Firestore.
 */
export async function migrateHtmlFileList(fileList, defaultCategory, onProgress) {
  const report = {
    startedAt: new Date().toISOString(),
    total: fileList.length,
    imported: [],
    skippedDuplicates: [],
    failed: [],
    completedAt: null
  };

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const filename = file.name;

    try {
      if (typeof onProgress === "function") {
        onProgress({
          index: i + 1,
          total: fileList.length,
          filename,
          percent: Math.round(((i) / fileList.length) * 100),
          status: `กำลังอ่านและแฮชไฟล์ ${filename}...`
        });
      }

      const body = await file.text();
      const contentHash = await computeContentHash(body);

      // Check duplicates
      const existing = await findByContentHash(contentHash);
      if (existing) {
        report.skippedDuplicates.push({
          filename,
          existingId: existing.id,
          existingTitle: existing.title,
          contentHash
        });
        continue;
      }

      // Metadata extraction
      const meta = parseHtmlMetadata(body, filename);
      const catInfo = defaultCategory && defaultCategory.name
        ? defaultCategory
        : inferCategoryFromText(filename, body);

      const fileId = "doc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      const htmlUpload = await uploadHtmlFile(fileId, file, filename);

      const record = await createHtmlFileRecord({
        title: meta.title || filename,
        description: meta.description || "",
        categoryId: catInfo.id,
        categoryName: catInfo.name,
        tags: [catInfo.name],
        originalFilename: filename,
        htmlStoragePath: htmlUpload.storagePath,
        htmlDownloadUrl: htmlUpload.downloadUrl,
        coverStoragePath: "",
        coverDownloadUrl: "",
        coverType: "auto",
        fileSize: file.size,
        contentHash,
        notes: `นำเข้าจากไฟล์เดสก์ท็อป: ${filename}`
      });

      report.imported.push({
        id: record.id,
        filename,
        title: record.title,
        size: file.size,
        contentHash
      });

    } catch (err) {
      report.failed.push({
        filename,
        reason: err.message || String(err)
      });
    }
  }

  report.completedAt = new Date().toISOString();
  return report;
}
