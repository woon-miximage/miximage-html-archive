/**
 * MIX-IMAGE HTML Archive — Real-Time Cloud Edition Application
 * Modular architecture connecting UI to Firebase Firestore, Storage, Auth, and Sandbox.
 */

import { getFirebaseInstance } from "./services/firebase-service.js";
import { 
  initAuth, 
  subscribeAuth, 
  loginWithEmail, 
  loginWithGoogle, 
  loginAnonymously,
  logoutUser, 
  getCurrentUser, 
  getCurrentUserProfile 
} from "./services/auth-service.js";
import {
  subscribeHtmlFiles,
  createHtmlFileRecord,
  updateHtmlFileRecord,
  deleteHtmlFileRecord,
  subscribeUserFavorites,
  toggleUserFavorite,
  findByContentHash
} from "./services/firestore-service.js";
import { 
  uploadHtmlFile, 
  uploadCoverImage, 
  deleteStoragePath 
} from "./services/storage-service.js";
import { computeContentHash } from "./services/crypto-service.js";
import { migrateLegacyJsonBackup, migrateHtmlFileList } from "./services/migration-service.js";
import { SEED_SAMPLES } from "./data/seed-samples.js";
import { firebaseConfig, isConfigured, saveFirebaseConfig, resetFirebaseConfig } from "../firebase-config.js";

// --- State ---
let entries = [];
let userFavorites = new Set();
let currentView = 'all'; // 'all' | 'favorites'
let currentCategory = 'all';
let searchTerm = '';
let onlyCustomCover = false;
let currentSort = 'newest';
let editingId = null;
let previewEntry = null;
let unsubscribeFirestore = null;
let unsubscribeFavorites = null;

// --- DOM Selectors ---
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// --- Utilities ---
function htmlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function xmlText(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function fmtSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 1024 * 80 ? 1 : 0) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function dateShort(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// Dynamic SVG Cover Generator (Fallback when no custom image provided)
function makeSvgCover(title, category, coverType) {
  let c1 = '#8158ee', c2 = '#58bce9', emoji = '▤', label = 'HTML TOOL';
  const combined = (title + ' ' + (category || '')).toLowerCase();

  if (coverType === 'street' || /street|drift|ride/i.test(combined)) {
    c1 = '#ff2c87'; c2 = '#00ddeb'; emoji = '✦'; label = 'STREET • RIDE • DRIFT';
  } else if (coverType === 'memorial' || /ศพ|กรอบรูป|อนุสรณ์/.test(combined)) {
    c1 = '#b38639'; c2 = '#f5d7a0'; emoji = '✿'; label = 'MEMORIAL DESIGN TOOL';
  } else if (coverType === 'chibi' || /chibi|ชิบิ|พรอมต์|gpt image/i.test(combined)) {
    c1 = '#3287e9'; c2 = '#b38afa'; emoji = '✧'; label = 'PROMPT COLLECTION';
  } else if (/เว็บ|app|ui|ux|calc/i.test(combined)) {
    c1 = '#159edc'; c2 = '#65d2b5'; emoji = '⌘'; label = 'WEB APP / UI KIT';
  }

  const t = xmlText(String(title || 'HTML FILE').slice(0, 36));
  const sub = xmlText(category || 'HTML ARCHIVE');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="960" height="540" fill="#111a2e"/>
    <rect x="0" y="0" width="960" height="540" fill="url(#g)" opacity=".9"/>
    <circle cx="790" cy="85" r="260" fill="url(#glow)"/>
    <circle cx="825" cy="105" r="150" fill="#ffffff" fill-opacity=".11"/>
    <circle cx="870" cy="74" r="92" stroke="#fff" stroke-opacity=".25" stroke-width="2" fill="none"/>
    <circle cx="870" cy="74" r="120" stroke="#fff" stroke-opacity=".15" stroke-width="2" fill="none"/>
    <rect x="47" y="46" width="220" height="34" rx="17" fill="#fff" fill-opacity=".93"/>
    <text x="157" y="68" font-family="Arial,sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="#233452">${xmlText(label)}</text>
    <text x="50" y="210" font-family="Arial,sans-serif" font-size="92" font-weight="800" fill="#fff" opacity=".16">${emoji}</text>
    <text x="50" y="303" font-family="Arial,sans-serif" font-size="38" font-weight="800" fill="#fff">${t}</text>
    <text x="52" y="352" font-family="Arial,sans-serif" font-size="21" fill="#fff" fill-opacity=".9">${sub}</text>
    <path d="M52 402 H340" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>
    <text x="52" y="449" font-family="Arial,sans-serif" font-size="15" letter-spacing="4" fill="#fff" fill-opacity=".8">MIX-IMAGE · CLOUD ARCHIVE</text>
    <rect x="700" y="300" width="200" height="150" rx="22" fill="#fff" fill-opacity=".13" stroke="#fff" stroke-opacity=".25"/>
    <rect x="724" y="326" width="152" height="98" rx="12" fill="#fff" fill-opacity=".9"/>
    <path d="M742 350 H850 M742 366 H833 M742 382 H859 M742 398 H810" stroke="${c1}" stroke-width="7" stroke-linecap="round" opacity=".65"/>
  </svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function getCoverUrl(entry) {
  if (entry.coverDownloadUrl) return entry.coverDownloadUrl;
  return makeSvgCover(entry.title, entry.categoryName, entry.coverType);
}

// --- Category Helpers ---
function getCategories() {
  const cats = [...new Set(entries.map(e => e.categoryName || 'อื่น ๆ'))];
  return cats.sort((a, b) => a.localeCompare(b, 'th'));
}

const catIcons = {
  'Prompt Pack': '✧',
  'เครื่องมือออกแบบ': '✎',
  'เว็บแอป': '⌘',
  'เทมเพลต': '▧',
  'อื่น ๆ': '•'
};

// --- Duplicate Hash Detector ---
function getDuplicateHashIds() {
  const hashMap = new Map();
  const dups = new Set();
  for (const e of entries) {
    if (!e.contentHash) continue;
    if (hashMap.has(e.contentHash)) {
      dups.add(e.id);
      dups.add(hashMap.get(e.contentHash));
    } else {
      hashMap.set(e.contentHash, e.id);
    }
  }
  return dups;
}

// --- Render Dashboard ---
function render() {
  renderStats();
  renderCategories();
  renderSideCats();
  renderGrid();

  // Active navigation button
  $$('.nav button[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === currentView);
  });

  $('#listTitle').textContent = currentView === 'favorites'
    ? 'รายการโปรด'
    : currentCategory !== 'all' ? currentCategory : 'คลัง HTML ทั้งหมด';

  $('#listSub').textContent = currentView === 'favorites'
    ? 'ไฟล์ที่ทำเครื่องหมายดาวไว้บนคลาวด์'
    : currentCategory !== 'all' ? `ไฟล์ในหมวดหมู่ “${currentCategory}”` : 'เปิดดูรายละเอียด แล้วดาวน์โหลดไฟล์ไปใช้ได้ทันที';

  $('#customCoverFilter').classList.toggle('active', onlyCustomCover);
}

function renderStats() {
  const cats = getCategories();
  const favCount = userFavorites.size;
  const totalBytes = entries.reduce((acc, e) => acc + (Number(e.fileSize) || 0), 0);

  $('#statTotal').textContent = entries.length;
  $('#statCats').textContent = cats.length;
  $('#statFav').textContent = favCount;
  $('#statSize').textContent = fmtSize(totalBytes);
}

function renderCategories() {
  const cats = getCategories();
  const list = [
    { name: 'ทั้งหมด', key: 'all', icon: '✧', count: entries.length },
    ...cats.map((c, i) => ({
      name: c,
      key: c,
      icon: catIcons[c] || ['▤', '◈', '✦', '⌘'][i % 4],
      count: entries.filter(e => (e.categoryName || 'อื่น ๆ') === c).length
    }))
  ];

  $('#categories').innerHTML = list.map(c => `
    <button class="category ${currentCategory === c.key ? 'active' : ''}" data-cat="${htmlEsc(c.key)}">
      <span class="cicon">${c.icon}</span>
      <strong title="${htmlEsc(c.name)}">${htmlEsc(c.name)}</strong>
      <small>${c.count} ไฟล์</small>
    </button>
  `).join('');

  $$('[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      currentCategory = b.dataset.cat;
      currentView = 'all';
      render();
    });
  });
}

function renderSideCats() {
  const cats = getCategories();
  $('#sideCats').innerHTML = cats.map(c => `
    <button data-sidecat="${htmlEsc(c)}">
      <span>${htmlEsc(c)}</span>
      <span class="countpill">${entries.filter(e => (e.categoryName || 'อื่น ๆ') === c).length}</span>
    </button>
  `).join('');

  $$('[data-sidecat]').forEach(b => {
    b.addEventListener('click', () => {
      currentCategory = b.dataset.sidecat;
      currentView = 'all';
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

function getFilteredList() {
  let list = [...entries];

  if (currentView === 'favorites') {
    list = list.filter(e => userFavorites.has(e.id));
  }
  if (currentCategory !== 'all') {
    list = list.filter(e => (e.categoryName || 'อื่น ๆ') === currentCategory);
  }
  if (onlyCustomCover) {
    list = list.filter(e => Boolean(e.coverDownloadUrl));
  }
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(e => {
      const haystack = [
        e.title,
        e.originalFilename,
        e.description,
        e.categoryName,
        e.notes,
        ...(e.tags || [])
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  // Sorting
  list.sort((a, b) => {
    if (currentSort === 'newest') {
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    }
    if (currentSort === 'oldest') {
      return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
    }
    if (currentSort === 'name') {
      return (a.title || '').localeCompare(b.title || '', 'th');
    }
    if (currentSort === 'size') {
      return (Number(b.fileSize) || 0) - (Number(a.fileSize) || 0);
    }
    return 0;
  });

  return list;
}

function renderGrid() {
  const list = getFilteredList();
  const dups = getDuplicateHashIds();
  $('#shownCount').textContent = `แสดง ${list.length} / ${entries.length} ไฟล์`;

  if (!list.length) {
    $('#grid').innerHTML = `
      <div class="empty">
        <div class="big">⌕</div>
        <h3>ยังไม่พบไฟล์ที่ค้นหาในคลังคลาวด์</h3>
        <p>คุณสามารถติดตั้งไฟล์ตัวอย่าง 4 รายการเพื่อเริ่มต้นใช้งาน หรืออัปโหลดไฟล์ HTML ใหม่ของคุณ</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px;">
          <button class="primary" id="emptySeed">⚡ ติดตั้งไฟล์ตัวอย่างเริ่มต้น 4 รายการ</button>
          <button class="secondary" id="emptyAdd">＋ เพิ่มไฟล์ HTML เอง</button>
        </div>
      </div>
    `;
    $('#emptySeed')?.addEventListener('click', seedInitialSamples);
    $('#emptyAdd')?.addEventListener('click', () => openEditorModal());
    return;
  }

  $('#grid').innerHTML = list.map(e => {
    const isFav = userFavorites.has(e.id);
    const coverUrl = getCoverUrl(e);
    const hasCustomCover = Boolean(e.coverDownloadUrl);
    const isDuplicate = dups.has(e.id);
    const tagsHtml = (e.tags || []).slice(0, 4).map(t => `<span class="tag">${htmlEsc(t)}</span>`).join('');

    return `
      <article class="file-card" data-id="${htmlEsc(e.id)}">
        <div class="cover">
          <img src="${coverUrl}" alt="ภาพปก ${htmlEsc(e.title)}" loading="lazy">
          <span class="cover-tag">${htmlEsc(e.categoryName || 'อื่น ๆ')}</span>
          <button class="fav ${isFav ? 'on' : ''}" data-fav="${htmlEsc(e.id)}" title="${isFav ? 'นำออกจากรายการโปรด' : 'เพิ่มในรายการโปรด'}" aria-label="รายการโปรด">
            ${isFav ? '★' : '☆'}
          </button>
        </div>
        <div class="file-info">
          <div class="file-meta">
            <span class="badge">${htmlEsc(e.categoryName || 'อื่น ๆ')}</span>
            ${hasCustomCover ? '<span class="badge green">ภาพปกกำหนดเอง</span>' : ''}
            ${isDuplicate ? '<span class="badge orange" title="พบไฟล์ที่มี SHA-256 เหมือนกัน">ไฟล์ซ้ำ</span>' : ''}
            ${e.visibility === 'private' ? '<span class="badge">🔒 ส่วนตัว</span>' : ''}
          </div>
          <div class="file-title">${htmlEsc(e.title || e.originalFilename)}</div>
          <div class="file-desc">${htmlEsc(e.description || 'ยังไม่มีคำอธิบาย — สามารถกดแก้ไขเพื่อใส่คำแนะนำหรือจุดเด่น')}</div>
          <div class="tags">${tagsHtml || '<span class="tag">ไม่มีแท็ก</span>'}</div>
          <div class="filename">▤ ${htmlEsc(e.originalFilename)} · ${fmtSize(e.fileSize)}</div>
          <div class="card-actions">
            <button class="view" data-action="preview" data-id="${htmlEsc(e.id)}">ดูตัวอย่าง ↗</button>
            <button data-action="download" data-id="${htmlEsc(e.id)}">ดาวน์โหลด ↓</button>
            <button data-action="edit" data-id="${htmlEsc(e.id)}" title="แก้ไขข้อมูล">✎</button>
            <button class="delete" data-action="delete" data-id="${htmlEsc(e.id)}" title="ลบไฟล์">⌫</button>
          </div>
          <div class="date-row">
            <span>แก้ไข ${dateShort(e.updatedAt || e.createdAt)}</span>
            <span>${e.notes ? 'มีโน้ต' : ''}</span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach card listeners
  $$('[data-fav]').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleToggleFavorite(b.dataset.fav);
    });
  });

  $$('[data-action]').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleCardAction(b.dataset.action, b.dataset.id);
    });
  });
}

// --- Action Handlers ---
async function handleToggleFavorite(fileId) {
  const user = getCurrentUser();
  if (!user) {
    toast('กรุณาเข้าสู่ระบบเพื่อบันทึกรายการโปรด');
    openAuthModal();
    return;
  }
  const isFav = userFavorites.has(fileId);
  try {
    await toggleUserFavorite(user.uid, fileId, isFav);
    if (isFav) {
      userFavorites.delete(fileId);
      toast('นำออกจากรายการโปรดแล้ว');
    } else {
      userFavorites.add(fileId);
      toast('บันทึกลงรายการโปรดแล้ว');
    }
    render();
  } catch (err) {
    toast('ไม่สามารถอัปเดตรายการโปรด: ' + err.message);
  }
}

async function handleCardAction(action, fileId) {
  const entry = entries.find(x => x.id === fileId);
  if (!entry) return;

  if (action === 'preview') {
    openPreviewModal(entry);
  } else if (action === 'download') {
    downloadOriginalFile(entry);
  } else if (action === 'edit') {
    openEditorModal(entry);
  } else if (action === 'delete') {
    if (!confirm(`คุณต้องการลบ “${entry.title || entry.originalFilename}” ออกจากคลังคลาวด์ใช่หรือไม่?`)) return;
    try {
      await deleteHtmlFileRecord(fileId, entry.title);
      if (entry.htmlStoragePath) await deleteStoragePath(entry.htmlStoragePath);
      if (entry.coverStoragePath) await deleteStoragePath(entry.coverStoragePath);
      toast('ลบไฟล์ออกจากคลังเรียบร้อยแล้ว');
    } catch (err) {
      toast('ลบไม่สำเร็จ: ' + err.message);
    }
  }
}

// --- Isolated Sandboxed Preview Modal ---
async function openPreviewModal(entry) {
  previewEntry = entry;
  $('#previewTitle').textContent = entry.title || entry.originalFilename;
  $('#previewDesc').textContent = entry.description || 'รันในแซนด์บ็อกซ์แยก (Isolated CSP Guard)';
  $('#previewFilename').textContent = `${entry.originalFilename} · ${fmtSize(entry.fileSize)}`;

  const frame = $('#previewFrame');
  frame.removeAttribute('srcdoc');

  try {
    let htmlContent = '';
    if (entry.htmlDownloadUrl) {
      const resp = await fetch(entry.htmlDownloadUrl);
      htmlContent = await resp.text();
    } else {
      htmlContent = '<h1>ไม่พบเนื้อหาไฟล์</h1>';
    }

    // Strict Sandbox Guard: Inject restrictive Content Security Policy into preview HTML
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; object-src 'none';">`;
    const guardedHtml = htmlContent.includes('<head>')
      ? htmlContent.replace('<head>', `<head>${cspMeta}`)
      : cspMeta + htmlContent;

    frame.srcdoc = guardedHtml;
    $('#previewWrap').classList.add('show');
    document.body.style.overflow = 'hidden';
  } catch (err) {
    toast('ไม่สามารถโหลดพรีวิว: ' + err.message);
  }
}

function openIsolatedTab() {
  if (!previewEntry) return;
  const frame = $('#previewFrame');
  const guardedHtml = frame.srcdoc || '<h1>No Content</h1>';
  const blob = new Blob([guardedHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function downloadOriginalFile(entry) {
  if (!entry) return;
  if (entry.htmlDownloadUrl) {
    const a = document.createElement('a');
    a.href = entry.htmlDownloadUrl;
    a.download = entry.originalFilename || 'archive.html';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('กำลังเริ่มดาวน์โหลดไฟล์ต้นฉบับ...');
  }
}

// --- Upload & Editor Modal ---
let selectedHtmlFile = null;
let selectedCoverBlob = null;

function openEditorModal(entry = null) {
  editingId = entry?.id || null;
  selectedHtmlFile = null;
  selectedCoverBlob = null;

  $('#editForm').reset();
  $('#coverPreview').hidden = true;
  $('#coverPreview').removeAttribute('src');
  $('#uploadProgressWrap').hidden = true;
  $('#uploadProgressFill').style.width = '0%';

  if (entry) {
    $('#editTitle').textContent = 'แก้ไขรายละเอียดไฟล์บนคลาวด์';
    $('#saveBtn').textContent = 'บันทึกการแก้ไข';
    $('#fileUploadField').hidden = true;
    $('#titleInput').value = entry.title || '';
    $('#categoryInput').value = entry.categoryName || '';
    $('#descInput').value = entry.description || '';
    $('#tagsInput').value = (entry.tags || []).join(', ');
    $('#notesInput').value = entry.notes || '';
    $('#visibilitySelect').value = entry.visibility || 'public';

    if (entry.coverDownloadUrl) {
      $('#coverPreview').src = entry.coverDownloadUrl;
      $('#coverPreview').hidden = false;
    }
  } else {
    $('#editTitle').textContent = 'เพิ่มไฟล์ HTML สู่คลาวด์';
    $('#saveBtn').textContent = 'บันทึกลงคลาวด์';
    $('#fileUploadField').hidden = false;
    $('#fileSelectInfo').textContent = 'ระบบจะดึงชื่อจาก <title> และคำอธิบายจาก meta description ให้อัตโนมัติ';
  }

  $('#editWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

$('#htmlFiles').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  selectedHtmlFile = file;
  $('#fileSelectInfo').textContent = `เลือกไฟล์: ${file.name} (${fmtSize(file.size)})`;

  // Pre-parse title and description from HTML
  try {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const autoTitle = (doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || file.name.replace(/\.html?$/i, '')).trim();
    const autoDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    if (!$('#titleInput').value) $('#titleInput').value = autoTitle;
    if (!$('#descInput').value && autoDesc) $('#descInput').value = autoDesc;
    if (!$('#categoryInput').value) {
      if (/prompt|พรอมต์|gpt image|chibi/i.test(autoTitle + ' ' + text.slice(0, 5000))) {
        $('#categoryInput').value = 'Prompt Pack';
      } else if (/canvas|กรอบรูป|งานพิมพ์|ภาพหน้างานศพ/i.test(autoTitle + ' ' + text.slice(0, 5000))) {
        $('#categoryInput').value = 'เครื่องมือออกแบบ';
      } else {
        $('#categoryInput').value = 'เทมเพลต';
      }
    }

    // Check duplicate hash in background
    const hash = await computeContentHash(text);
    const existing = await findByContentHash(hash);
    if (existing) {
      toast(`⚠️ พบไฟล์ที่มีเนื้อหาเดียวกันในคลังแล้ว: “${existing.title}”`);
    }
  } catch (err) {
    console.warn("Could not parse file:", err);
  }
});

$('#coverInput').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) {
    selectedCoverBlob = null;
    return;
  }
  selectedCoverBlob = file;
  const url = URL.createObjectURL(file);
  $('#coverPreview').src = url;
  $('#coverPreview').hidden = false;
});

$('#editForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();

  const title = $('#titleInput').value.trim();
  const categoryName = $('#categoryInput').value.trim() || 'อื่น ๆ';
  const categoryId = categoryName.toLowerCase().replace(/\s+/g, '-');
  const description = $('#descInput').value.trim();
  const tags = $('#tagsInput').value.split(',').map(x => x.trim()).filter(Boolean);
  const notes = $('#notesInput').value.trim();
  const visibility = $('#visibilitySelect').value || 'public';

  try {
    if (editingId) {
      // Update existing record
      const entry = entries.find(x => x.id === editingId);
      if (!entry) return;

      let coverDownloadUrl = entry.coverDownloadUrl || '';
      let coverStoragePath = entry.coverStoragePath || '';

      if (selectedCoverBlob) {
        $('#uploadProgressWrap').hidden = false;
        const upload = await uploadCoverImage(editingId, selectedCoverBlob, (pct) => {
          $('#uploadProgressFill').style.width = `${pct}%`;
          $('#uploadProgressText').textContent = `กำลังอัปโหลดภาพปก: ${pct}%`;
        });
        coverDownloadUrl = upload.downloadUrl;
        coverStoragePath = upload.storagePath;
      }

      await updateHtmlFileRecord(editingId, {
        title,
        categoryId,
        categoryName,
        description,
        tags,
        notes,
        visibility,
        coverDownloadUrl,
        coverStoragePath
      });

      closeModal('editWrap');
      toast('บันทึกการแก้ไขเรียบร้อยแล้ว');
    } else {
      // Create new record
      if (!selectedHtmlFile) {
        toast('กรุณาเลือกไฟล์ HTML ก่อนบันทึก');
        return;
      }

      const fileId = "doc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      const text = await selectedHtmlFile.text();
      const contentHash = await computeContentHash(text);

      // Check duplicates
      const dup = await findByContentHash(contentHash);
      if (dup) {
        const proceed = confirm(`ไฟล์นี้มีเนื้อหาเหมือนกับ “${dup.title}” (${dup.originalFilename}) ที่อยู่ในคลังแล้ว\n\nต้องการบันทึกเป็นสำเนาอีกรายการหรือไม่?`);
        if (!proceed) return;
      }

      $('#uploadProgressWrap').hidden = false;

      // 1. Upload HTML
      const htmlUpload = await uploadHtmlFile(fileId, selectedHtmlFile, selectedHtmlFile.name, (pct) => {
        $('#uploadProgressFill').style.width = `${pct}%`;
        $('#uploadProgressText').textContent = `กำลังอัปโหลดไฟล์ HTML: ${pct}%`;
      });

      // 2. Upload Cover if present
      let coverUpload = null;
      if (selectedCoverBlob) {
        $('#uploadProgressText').textContent = 'กำลังอัปโหลดภาพปก...';
        coverUpload = await uploadCoverImage(fileId, selectedCoverBlob);
      }

      // 3. Write Firestore record
      await createHtmlFileRecord({
        title: title || selectedHtmlFile.name,
        description,
        categoryId,
        categoryName,
        tags,
        originalFilename: selectedHtmlFile.name,
        htmlStoragePath: htmlUpload.storagePath,
        htmlDownloadUrl: htmlUpload.downloadUrl,
        coverStoragePath: coverUpload?.storagePath || '',
        coverDownloadUrl: coverUpload?.downloadUrl || '',
        coverType: coverUpload ? 'custom' : 'auto',
        fileSize: selectedHtmlFile.size,
        contentHash,
        notes,
        visibility
      });

      closeModal('editWrap');
      toast('อัปโหลดไฟล์ขึ้นคลาวด์เรียบร้อยแล้ว');
    }
  } catch (err) {
    console.error("Save error:", err);
    toast('บันทึกไม่สำเร็จ: ' + err.message);
  } finally {
    $('#uploadProgressWrap').hidden = true;
  }
});

// --- Migration & Bulk Importer ---
$('#migrationNav').addEventListener('click', () => {
  $('#migrationReport').hidden = true;
  $('#migrationProgress').hidden = true;
  $('#migrationWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
});

$('#tabJsonMigrate').addEventListener('click', () => {
  $('#tabJsonMigrate').classList.add('active');
  $('#tabHtmlMigrate').classList.remove('active');
  $('#tabSeedMigrate')?.classList.remove('active');
  $('#paneJsonMigrate').hidden = false;
  $('#paneHtmlMigrate').hidden = true;
  $('#paneSeedMigrate').hidden = true;
});

$('#tabHtmlMigrate').addEventListener('click', () => {
  $('#tabHtmlMigrate').classList.add('active');
  $('#tabJsonMigrate').classList.remove('active');
  $('#tabSeedMigrate')?.classList.remove('active');
  $('#paneHtmlMigrate').hidden = false;
  $('#paneJsonMigrate').hidden = true;
  $('#paneSeedMigrate').hidden = true;
});

$('#tabSeedMigrate')?.addEventListener('click', () => {
  $('#tabSeedMigrate').classList.add('active');
  $('#tabJsonMigrate').classList.remove('active');
  $('#tabHtmlMigrate').classList.remove('active');
  $('#paneSeedMigrate').hidden = false;
  $('#paneJsonMigrate').hidden = true;
  $('#paneHtmlMigrate').hidden = true;
});

async function seedInitialSamples() {
  $('#migrationProgress').hidden = false;
  $('#migrationReport').hidden = true;
  $('#migrationWrap').classList.add('show');
  document.body.style.overflow = 'hidden';

  if (!getCurrentUser()) {
    try {
      await loginAnonymously();
    } catch (_) {}
  }

  try {
    const report = await migrateLegacyJsonBackup({ entries: SEED_SAMPLES }, (progress) => {
      $('#migrationBarFill').style.width = `${progress.percent}%`;
      $('#migrationStatusText').textContent = progress.status;
    });

    renderMigrationReport(report);
    toast(`ติดตั้งไฟล์ตัวอย่างสำเร็จ ${report.imported.length} รายการ`);
  } catch (err) {
    toast('ติดตั้งไฟล์ตัวอย่างล้มเหลว: ' + err.message);
  }
}

$('#startSeedBtn')?.addEventListener('click', seedInitialSamples);

$('#startJsonMigrateBtn').addEventListener('click', async () => {
  const file = $('#jsonBackupInput').files?.[0];
  if (!file) {
    toast('กรุณาเลือกไฟล์ JSON สำรองข้อมูลก่อน');
    return;
  }

  $('#migrationProgress').hidden = false;
  $('#migrationReport').hidden = true;

  try {
    const raw = await file.text();
    const report = await migrateLegacyJsonBackup(raw, (progress) => {
      $('#migrationBarFill').style.width = `${progress.percent}%`;
      $('#migrationStatusText').textContent = progress.status;
    });

    renderMigrationReport(report);
    toast(`ย้ายข้อมูลสำเร็จ ${report.imported.length} รายการ`);
  } catch (err) {
    toast('ย้ายข้อมูลล้มเหลว: ' + err.message);
  }
});

$('#startHtmlMigrateBtn').addEventListener('click', async () => {
  const files = [...($('#batchHtmlInput').files || [])];
  if (!files.length) {
    toast('กรุณาเลือกไฟล์ HTML อย่างน้อย 1 ไฟล์');
    return;
  }

  $('#migrationProgress').hidden = false;
  $('#migrationReport').hidden = true;

  try {
    const report = await migrateHtmlFileList(files, null, (progress) => {
      $('#migrationBarFill').style.width = `${progress.percent}%`;
      $('#migrationStatusText').textContent = progress.status;
    });

    renderMigrationReport(report);
    toast(`นำเข้าไฟล์ HTML สำเร็จ ${report.imported.length} รายการ`);
  } catch (err) {
    toast('นำเข้าไฟล์ล้มเหลว: ' + err.message);
  }
});

function renderMigrationReport(report) {
  $('#migrationProgress').hidden = true;
  $('#migrationReport').hidden = false;

  $('#reportSuccess').textContent = `นำเข้าสำเร็จ: ${report.imported.length}`;
  $('#reportDuplicates').textContent = `ข้ามไฟล์ซ้ำ: ${report.skippedDuplicates.length}`;
  $('#reportFailed').textContent = `ล้มเหลว: ${report.failed.length}`;

  let html = '';
  if (report.imported.length) {
    html += `<div><b>✓ ไฟล์ที่นำเข้าสำเร็จ:</b><ul>${report.imported.map(x => `<li>${htmlEsc(x.title)} (${htmlEsc(x.filename)})</li>`).join('')}</ul></div>`;
  }
  if (report.skippedDuplicates.length) {
    html += `<div><b>⚠ ไฟล์ซ้ำที่ข้าม (SHA-256 ตรงกับที่มีอยู่แล้ว):</b><ul>${report.skippedDuplicates.map(x => `<li>${htmlEsc(x.filename)} → ตรงกับ “${htmlEsc(x.existingTitle)}”</li>`).join('')}</ul></div>`;
  }
  if (report.failed.length) {
    html += `<div><b>✗ ไฟล์ที่ล้มเหลว:</b><ul>${report.failed.map(x => `<li>${htmlEsc(x.filename)}: ${htmlEsc(x.reason)}</li>`).join('')}</ul></div>`;
  }

  $('#reportDetails').innerHTML = html || 'ไม่มีข้อมูลเพิ่มเติม';
}

// --- Backup JSON from Cloud ---
$('#backupJsonBtn').addEventListener('click', () => {
  const payload = {
    app: 'MIX-IMAGE HTML Archive — Real-Time Cloud Edition',
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    entries: entries.map(e => ({
      id: e.id,
      title: e.title,
      category: e.categoryName,
      description: e.description,
      tags: e.tags,
      originalFilename: e.originalFilename,
      htmlDownloadUrl: e.htmlDownloadUrl,
      fileSize: e.fileSize,
      contentHash: e.contentHash,
      notes: e.notes,
      updatedAt: e.updatedAt
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MIX-IMAGE-Cloud-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('ส่งออกไฟล์สำรอง JSON จากคลาวด์แล้ว');
});

// --- Auth Modal ---
function openAuthModal() {
  $('#authWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

$('#authBtn').addEventListener('click', () => {
  const user = getCurrentUser();
  if (user) {
    if (confirm(`ออกจากระบบจากบัญชี ${user.email || user.displayName || ''}?`)) {
      logoutUser().then(() => toast('ออกจากระบบแล้ว'));
    }
  } else {
    openAuthModal();
  }
});

$('#authForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPassword').value;
  try {
    await loginWithEmail(email, password);
    closeModal('authWrap');
    toast('เข้าสู่ระบบสำเร็จ');
  } catch (err) {
    toast('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
});

$('#googleLoginBtn').addEventListener('click', async () => {
  try {
    await loginWithGoogle();
    closeModal('authWrap');
    toast('เข้าสู่ระบบด้วย Google สำเร็จ');
  } catch (err) {
    toast('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  }
});

// --- Config Modal ---
$('#configNav').addEventListener('click', () => {
  $('#cfgApiKey').value = firebaseConfig.apiKey || '';
  $('#cfgProjectId').value = firebaseConfig.projectId || '';
  $('#cfgAuthDomain').value = firebaseConfig.authDomain || '';
  $('#cfgStorageBucket').value = firebaseConfig.storageBucket || '';
  $('#cfgAppId').value = firebaseConfig.appId || '';
  $('#configWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
});

$('#configForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const newConfig = {
    apiKey: $('#cfgApiKey').value.trim(),
    projectId: $('#cfgProjectId').value.trim(),
    authDomain: $('#cfgAuthDomain').value.trim(),
    storageBucket: $('#cfgStorageBucket').value.trim(),
    appId: $('#cfgAppId').value.trim()
  };
  saveFirebaseConfig(newConfig);
});

$('#resetConfigBtn').addEventListener('click', () => {
  if (confirm('ต้องการคืนค่าคอนฟิกเป็นค่าเริ่มต้นใช่หรือไม่?')) {
    resetFirebaseConfig();
  }
});

// --- Modal Helper Functions ---
function closeModal(id) {
  const el = $('#' + id);
  if (!el) return;
  el.classList.remove('show');
  if (!$$('.modal-wrap.show').length) {
    document.body.style.overflow = '';
  }
  if (id === 'previewWrap') {
    $('#previewFrame').removeAttribute('srcdoc');
    previewEntry = null;
  }
}

$$('[data-close]').forEach(b => {
  b.addEventListener('click', () => closeModal(b.dataset.close));
});

$$('.modal-wrap').forEach(w => {
  w.addEventListener('click', (e) => {
    if (e.target === w) closeModal(w.id);
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $$('.modal-wrap.show').forEach(w => closeModal(w.id));
  }
});

// --- Top Buttons & Toolbar Listeners ---
$('#addNav').addEventListener('click', () => openEditorModal());
$('#addTop').addEventListener('click', () => openEditorModal());
$('#helpBtn').addEventListener('click', () => {
  $('#helpWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
});
$('#openNewTab').addEventListener('click', openIsolatedTab);
$('#downloadPreview').addEventListener('click', () => downloadOriginalFile(previewEntry));

$('#search').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderGrid();
});

$('#customCoverFilter').addEventListener('click', () => {
  onlyCustomCover = !onlyCustomCover;
  renderGrid();
});

$('#sortSelect').addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderGrid();
});

$$('.nav button[data-view]').forEach(b => {
  b.addEventListener('click', () => {
    currentView = b.dataset.view;
    currentCategory = 'all';
    render();
  });
});

// --- Application Bootstrapping ---
async function bootstrap() {
  console.info("🚀 MIX-IMAGE HTML Archive — Real-Time Cloud Edition starting...");

  // 1. Initialize Auth
  initAuth();

  subscribeAuth((user, profile) => {
    if (user) {
      $('#userName').textContent = profile?.displayName || user.email || 'User';
      $('#userRole').textContent = profile?.role || 'Editor';
      $('#authBtn').textContent = 'ออกจากระบบ';
      $('#liveDot').style.background = '#2cbd7b';

      // Subscribe to user favorites
      if (unsubscribeFavorites) unsubscribeFavorites();
      unsubscribeFavorites = subscribeUserFavorites(user.uid, (favSet) => {
        userFavorites = favSet;
        render();
      });
    } else {
      $('#userName').textContent = 'ผู้เยี่ยมชม (Guest)';
      $('#userRole').textContent = 'Viewer (Read-only)';
      $('#authBtn').textContent = 'เข้าสู่ระบบ';
      userFavorites = new Set();
      render();
    }
  });

  // 2. Connect Real-Time Firestore Listener
  try {
    unsubscribeFirestore = subscribeHtmlFiles(
      (items, hasPendingWrites, fromCache) => {
        entries = items;
        $('#syncBadge').innerHTML = hasPendingWrites
          ? `<span class="pulse-dot" style="background:#ff9a24"></span> กำลังบันทึก...`
          : `<span class="pulse-dot"></span> Real-time Active`;
        render();
      },
      (err) => {
        console.error("Firestore subscription error:", err);
        $('#syncBadge').innerHTML = `<span class="pulse-dot" style="background:#f35f7d"></span> ออฟไลน์ / การเชื่อมต่อขัดข้อง`;
        toast('การเชื่อมต่อ Firestore ขัดข้อง: ' + err.message);
      }
    );
  } catch (err) {
    console.error("Could not subscribe to Firestore:", err);
  }
}

bootstrap();
