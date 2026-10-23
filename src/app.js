/**
 * MIX-IMAGE Prompt & HTML Studio — Application Controller
 * Single-user vault with Fullscreen PIN Gate (1449) and 2:3 Portrait Preview Cards
 */

import { getFirebaseInstance } from "./services/firebase-service.js";
import { 
  initAuth, 
  subscribeAuth, 
  loginWithPin,
  logoutUser, 
  getCurrentUser, 
  isPinAuthenticated 
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

// --- State ---
const MASTER_PIN = "1449";
const UNLOCKED_KEY = "miximage_vault_unlocked";

let entries = [];
let userFavorites = new Set();
let activeFilter = 'all'; // 'all' | 'favorites' | 'has-notes' | 'has-preview'
let currentCategory = 'all';
let searchTerm = '';
let currentSort = 'newest';
let editingId = null;
let previewEntry = null;
let currentPinBuffer = "";
let unsubscribeFirestore = null;
let unsubscribeFavorites = null;

// --- Selectors ---
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
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Live Thai Clock Formatter
function updateLiveClocks() {
  const now = new Date();
  const dStr = new Intl.DateTimeFormat('th-TH', { 
    day: 'numeric', 
    month: 'short', 
    year: '2-digit' 
  }).format(now);
  const tStr = now.toTimeString().slice(0, 8);
  const formatted = `${dStr} · ${tStr}`;

  const lockEl = $('#lockClockText');
  if (lockEl) lockEl.textContent = formatted;

  const topEl = $('#topbarClockText');
  if (topEl) topEl.textContent = formatted;
}
setInterval(updateLiveClocks, 1000);
updateLiveClocks();

// =========================================================================
// 1. PIN GATE LOGIC (Matching Image 1: Always starts locked on enter)
// =========================================================================
function initPinGate() {
  const lockScreen = $('#lockScreen');

  // Single-user requirement: "เข้ามาเจอให้ใส่ พินเลย ใช้งานคนเดียว"
  // Every page visit / load immediately presents the PIN gate
  lockScreen.classList.remove('unlocked');
  clearPinBuffer();
  focusPinInput();

  // Keypad button listeners
  $$('.lkey[data-k]').forEach(btn => {
    btn.addEventListener('click', () => {
      appendPinDigit(btn.dataset.k);
    });
  });

  $('#gateClear')?.addEventListener('click', clearPinBuffer);
  $('#gateBack')?.addEventListener('click', backspacePinBuffer);

  // Hidden hardware keyboard capture
  const hiddenInput = $('#gatePinInput');
  if (hiddenInput) {
    hiddenInput.addEventListener('input', () => {
      currentPinBuffer = hiddenInput.value.slice(0, 4);
      updatePinDots();
      if (currentPinBuffer.length === 4) {
        verifyPinAttempt();
      }
    });
  }

  // Global keydown capture for PIN entry
  document.addEventListener('keydown', (e) => {
    if ($('#lockScreen').classList.contains('unlocked')) return;
    if (e.key >= '0' && e.key <= '9') {
      appendPinDigit(e.key);
    } else if (e.key === 'Backspace') {
      backspacePinBuffer();
    } else if (e.key === 'Escape') {
      clearPinBuffer();
    }
  });

  // Re-lock buttons
  $('#lockVaultBtn')?.addEventListener('click', lockVault);
  $('#lockTopbarBtn')?.addEventListener('click', lockVault);
}

function lockVault() {
  const lockScreen = $('#lockScreen');
  lockScreen.classList.remove('unlocked');
  clearPinBuffer();
  focusPinInput();
  toast('🔒 ล็อกหน้าจอสตูดิโอเรียบร้อยแล้ว');
}

function focusPinInput() {
  setTimeout(() => {
    const input = $('#gatePinInput');
    if (input) {
      input.value = "";
      input.focus();
    }
  }, 100);
}

function appendPinDigit(digit) {
  if (currentPinBuffer.length < 4) {
    currentPinBuffer += digit;
    updatePinDots();
    if (currentPinBuffer.length === 4) {
      setTimeout(verifyPinAttempt, 90);
    }
  }
}

function clearPinBuffer() {
  currentPinBuffer = "";
  const input = $('#gatePinInput');
  if (input) input.value = "";
  updatePinDots();
}

function backspacePinBuffer() {
  currentPinBuffer = currentPinBuffer.slice(0, -1);
  const input = $('#gatePinInput');
  if (input) input.value = currentPinBuffer;
  updatePinDots();
}

function updatePinDots() {
  const dots = $$('#lockDots .dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < currentPinBuffer.length);
  });
}

async function verifyPinAttempt() {
  if (currentPinBuffer === MASTER_PIN) {
    $('#lockScreen').classList.add('unlocked');
    toast('👑 ยินดีต้อนรับลูกพี่! ปลดล็อกคลังเรียบร้อย');
    try {
      await loginWithPin(MASTER_PIN);
    } catch (_) {}
    currentPinBuffer = "";
    updatePinDots();
  } else {
    const pinBox = $('.lock-pin-box');
    if (pinBox) {
      pinBox.classList.add('shake-error');
      setTimeout(() => pinBox.classList.remove('shake-error'), 400);
    }
    toast('❌ รหัส PIN ไม่ถูกต้อง โปรดลองใหม่อีกครั้ง');
    clearPinBuffer();
  }
}

// =========================================================================
// 2. DYNAMIC 2:3 PORTRAIT SVG COVER GENERATOR (Exact 2:3 Ratio 800x1200)
// =========================================================================
function makeSvgCover(title, category, coverType) {
  let c1 = '#ff7a2f', c2 = '#f35f7d', emoji = '✨', badge = 'GPT-Image 2.5';
  const combined = (title + ' ' + (category || '')).toLowerCase();

  if (coverType === 'student-male' || /นักเรียนชาย/i.test(combined)) {
    c1 = '#1e3a8a'; c2 = '#38bdf8'; emoji = '👨‍🎓'; badge = 'THAI STUDENT MALE';
  } else if (coverType === 'student-female' || /นักเรียน หญิง|นักเรียนหญิง/i.test(combined)) {
    c1 = '#831843'; c2 = '#f472b6'; emoji = '👩‍🎓'; badge = 'THAI STUDENT FEMALE';
  } else if (coverType === 'visa-male' || /วีซ่า ชาย/i.test(combined)) {
    c1 = '#0f172a'; c2 = '#475569'; emoji = '🛂'; badge = 'VISA • PASSPORT MALE';
  } else if (coverType === 'visa-female' || /วีซ่า หญิง|ติดบัตรหญิง/i.test(combined)) {
    c1 = '#1e1b4b'; c2 = '#6366f1'; emoji = '🪪'; badge = 'VISA • PASSPORT FEMALE';
  } else if (coverType === 'portrait' || /เชิ้ตขาว/i.test(combined)) {
    c1 = '#334155'; c2 = '#94a3b8'; emoji = '👔'; badge = 'WHITE SHIRT PORTRAIT';
  } else if (coverType === 'street' || /street|drift|ride|รถ|ดริฟท์/i.test(combined)) {
    c1 = '#ff2b88'; c2 = '#00e1ff'; emoji = '🏎️'; badge = 'STREET • DRIFT';
  } else if (coverType === 'memorial' || /ศพ|กรอบรูป|อนุสรณ์/.test(combined)) {
    c1 = '#b88937'; c2 = '#f7dc9f'; emoji = '🕊️'; badge = 'CANVAS TOOL';
  } else if (coverType === 'chibi' || /chibi|ชิบิ|คู่/i.test(combined)) {
    c1 = '#358aff'; c2 = '#ba88ff'; emoji = '🌟'; badge = 'CHIBI 80 PACK';
  } else if (/ภาพบุคคล|portrait/i.test(combined)) {
    c1 = '#3272e8'; c2 = '#5cd4b5'; emoji = '👤'; badge = 'PORTRAIT MASTER';
  }

  const t = xmlText(String(title || 'PROMPT ITEM').slice(0, 32));
  const sub = xmlText(category || 'MIX-IMAGE STUDIO');

  // Exact 2:3 Aspect Ratio: 800 width x 1200 height
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
    <defs>
      <linearGradient id="g23" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
      <radialGradient id="glow23" cx="50%" cy="38%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    
    <!-- Background -->
    <rect width="800" height="1200" fill="#101827"/>
    <rect width="800" height="1200" fill="url(#g23)" opacity="0.88"/>
    <circle cx="400" cy="450" r="340" fill="url(#glow23)"/>
    
    <!-- Decorative 2:3 Inner Frame Line -->
    <rect x="40" y="40" width="720" height="1120" rx="32" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2.5"/>
    
    <!-- Top Model Badge (Image 3 Style) -->
    <rect x="60" y="60" width="240" height="46" rx="23" fill="#0d1422" fill-opacity="0.88"/>
    <text x="180" y="90" font-family="Arial,sans-serif" font-size="16" font-weight="800" text-anchor="middle" fill="#ffffff">${xmlText(badge)}</text>
    
    <!-- Aspect Ratio 2:3 Pill -->
    <rect x="620" y="60" width="120" height="46" rx="23" fill="#ffffff" fill-opacity="0.22"/>
    <text x="680" y="90" font-family="Arial,sans-serif" font-size="16" font-weight="800" text-anchor="middle" fill="#ffffff">2:3</text>
    
    <!-- Center Graphic Circle & Emoji -->
    <circle cx="400" cy="480" r="170" fill="#ffffff" fill-opacity="0.14"/>
    <circle cx="400" cy="480" r="150" fill="#0c1322" fill-opacity="0.45"/>
    <text x="400" y="540" font-family="Arial,sans-serif" font-size="135" text-anchor="middle">${emoji}</text>
    
    <!-- Bottom Content Card -->
    <rect x="60" y="780" width="680" height="340" rx="26" fill="#0c1322" fill-opacity="0.90"/>
    
    <text x="100" y="860" font-family="Arial,sans-serif" font-size="36" font-weight="800" fill="#ffffff">${t}</text>
    <text x="100" y="915" font-family="Arial,sans-serif" font-size="22" font-weight="600" fill="#a4b8d6">${sub}</text>
    <path d="M100 955 H700" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2"/>
    
    <text x="100" y="1010" font-family="monospace" font-size="18" fill="#e0ecff" opacity="0.85"># 2:3 ULTRA-HD PORTRAIT SPEC</text>
    <text x="100" y="1045" font-family="monospace" font-size="18" fill="#e0ecff" opacity="0.65">MIX-IMAGE PRIVATE PROMPT VAULT</text>
    
    <!-- Watermark Brand -->
    <text x="400" y="1170" font-family="Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="4" text-anchor="middle" fill="#ffffff" opacity="0.75">MIX-IMAGE · ART &amp; AUDIO</text>
  </svg>`;

  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

function getCoverUrl(entry) {
  if (entry.coverDownloadUrl) return entry.coverDownloadUrl;
  return makeSvgCover(entry.title, entry.categoryName, entry.coverType);
}

// =========================================================================
// 3. CATEGORIES & STATS
// =========================================================================
const DEFAULT_CATEGORIES = [
  { name: 'ทั้งหมด', key: 'all', icon: '✧' },
  { name: 'ทั่วไป', key: 'general', icon: '🗂' },
  { name: 'โน้ตส่วนตัว', key: 'notes', icon: '📝' },
  { name: 'ภาพบุคคล', key: 'portrait', icon: '👤' },
  { name: 'Prompt Pack', key: 'prompt-pack', icon: '🌟' },
  { name: 'เครื่องมือออกแบบ', key: 'design-tools', icon: '✎' },
  { name: 'เว็บแอป', key: 'web-apps', icon: '⌘' }
];

function renderCategoriesBar() {
  const container = $('#categoriesBar');
  if (!container) return;

  const cats = [...new Set(entries.map(e => e.categoryName || 'ทั่วไป'))];
  const list = [
    { name: 'ทั้งหมด', key: 'all', icon: '✧', count: entries.length },
    ...cats.map(c => ({
      name: c,
      key: c,
      icon: getCategoryIcon(c),
      count: entries.filter(e => (e.categoryName || 'ทั่วไป') === c).length
    }))
  ];

  container.innerHTML = list.map(c => `
    <button class="cat-btn ${currentCategory === c.key ? 'active' : ''}" data-cat="${htmlEsc(c.key)}">
      <div class="cat-icon">${c.icon}</div>
      <strong>${htmlEsc(c.name)}</strong>
      <small>${c.count} รายการ</small>
    </button>
  `).join('');

  $$('[data-cat]').forEach(b => {
    b.addEventListener('click', () => {
      currentCategory = b.dataset.cat;
      render();
    });
  });
}

function getCategoryIcon(c) {
  if (/บุคคล|portrait|คน/i.test(c)) return '👤';
  if (/prompt|พรอมต์/i.test(c)) return '🌟';
  if (/เครื่องมือ|ออกแบบ|canvas/i.test(c)) return '✎';
  if (/แอป|app|web/i.test(c)) return '⌘';
  if (/โน้ต|note/i.test(c)) return '📝';
  return '🗂';
}

function updateStatsAndCounters() {
  const total = entries.length;
  const notesCount = entries.filter(e => Boolean(e.notes)).length;
  const favCount = userFavorites.size;
  const previewCount = entries.filter(e => Boolean(e.coverDownloadUrl || e.htmlDownloadUrl)).length;

  $('#statTotal').textContent = total;
  $('#statNotes').textContent = notesCount;
  $('#statFav').textContent = favCount;
  $('#sideTotalCount').textContent = total;
  $('#sideNotesCount').textContent = notesCount;

  $('#chipAllCount').textContent = total;
  $('#chipFavCount').textContent = favCount;
  $('#chipNotesCount').textContent = notesCount;
  $('#chipPreviewCount').textContent = previewCount;
}

// =========================================================================
// 4. FILTERING & 2:3 CARD GRID RENDERING (Matching Image 3)
// =========================================================================
function getFilteredEntries() {
  let list = [...entries];

  // Quick Filter Chips
  if (activeFilter === 'favorites') {
    list = list.filter(e => userFavorites.has(e.id));
  } else if (activeFilter === 'has-notes') {
    list = list.filter(e => Boolean(e.notes));
  } else if (activeFilter === 'has-preview') {
    list = list.filter(e => Boolean(e.coverDownloadUrl || e.htmlDownloadUrl));
  }

  // Category Filter
  if (currentCategory !== 'all') {
    list = list.filter(e => (e.categoryName || 'ทั่วไป') === currentCategory);
  }

  // Search
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(e => {
      return [
        e.title,
        e.originalFilename,
        e.description,
        e.categoryName,
        e.notes,
        ...(e.tags || [])
      ].join(' ').toLowerCase().includes(q);
    });
  }

  // Sorting
  list.sort((a, b) => {
    if (currentSort === 'newest') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    if (currentSort === 'name') return (a.title || '').localeCompare(b.title || '', 'th');
    if (currentSort === 'size') return (Number(b.fileSize) || 0) - (Number(a.fileSize) || 0);
    return 0;
  });

  return list;
}

function render() {
  updateStatsAndCounters();
  renderCategoriesBar();
  renderGrid();

  $('#shownCount').textContent = `แสดง ${getFilteredEntries().length} รายการ`;
}

function renderGrid() {
  const list = getFilteredEntries();
  const grid = $('#grid');

  if (!list.length) {
    grid.innerHTML = `
      <div class="empty" style="grid-column: 1/-1; text-align:center; padding: 48px 16px; background:#fff; border-radius:24px; border:1px dashed #c9d8ee;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎨</div>
        <h3 style="margin: 0 0 6px;">ยังไม่มีรายการในหมวดนี้</h3>
        <p style="color:#647593; font-size:12px; margin:0 0 16px;">คุณสามารถกดปุ่มด้านล่างเพื่อโหลดไฟล์ตัวอย่างลงคลังคลาวด์ได้ทันที</p>
        <button class="primary" id="emptySeedBtn">⚡ ติดตั้งไฟล์ตัวอย่างลงคลาวด์ทันที</button>
      </div>
    `;
    $('#emptySeedBtn')?.addEventListener('click', seedInitialSamples);
    return;
  }

  grid.innerHTML = list.map(e => {
    const isFav = userFavorites.has(e.id);
    const coverUrl = getCoverUrl(e);
    const modelTag = e.modelTag || (e.tags?.[0]) || 'GPT-Image 2.5';
    const folderName = e.categoryName || 'ภาพบุคคล';
    const hasSpecialTag = e.tags && e.tags.includes('รูปติดบัตรหญิง');

    return `
      <article class="file-card-2-3" data-id="${htmlEsc(e.id)}">
        <!-- Exact 2:3 Portrait Container -->
        <div class="media-2-3" data-action="preview" data-id="${htmlEsc(e.id)}" title="คลิกเพื่อดูตัวอย่างแบบขยาย">
          <img src="${coverUrl}" alt="${htmlEsc(e.title)}" loading="lazy">
          <span class="media-tag-left">${htmlEsc(modelTag)}</span>
          <span class="media-ratio-pill">2:3</span>
          <button class="media-fav-star ${isFav ? 'on' : ''}" data-fav="${htmlEsc(e.id)}" aria-label="รายการโปรด">
            ${isFav ? '★' : '☆'}
          </button>
        </div>

        <!-- Card Content (Image 3 Style) -->
        <div class="card-content-2-3">
          <div class="card-pills-row">
            <span class="cat-pill-pink">${htmlEsc(folderName)} ▾</span>
            <span class="folder-pill-gray">📁 ${htmlEsc(e.originalFilename || 'ใส่โฟลเดอร์')}</span>
            ${hasSpecialTag ? '<span class="tag-pill-blue">รูปติดบัตรหญิง</span>' : ''}
          </div>

          <h4 class="card-title-2-3">${htmlEsc(e.title || e.originalFilename)}</h4>
          <p class="card-desc-2-3" data-action="copy" data-id="${htmlEsc(e.id)}" title="คลิกเพื่อคัดลอกพรอมต์">${htmlEsc(e.description || e.notes || 'พรอมต์และไฟล์ HTML สัดส่วน 2:3 พร้อมใช้งาน')}</p>

          <div class="card-footer-2-3">
            <span class="card-date-small">อัปเดต ${dateShort(e.updatedAt || e.createdAt)}</span>
            <div class="card-btns-row">
              <button class="mbtn copy" data-action="copy" data-id="${htmlEsc(e.id)}" title="คัดลอกพรอมต์">📋 คัดลอก</button>
              <button class="mbtn preview" data-action="preview" data-id="${htmlEsc(e.id)}" title="ดูตัวอย่าง">↗ ตัวอย่าง</button>
              <button class="mbtn" data-action="download" data-id="${htmlEsc(e.id)}" title="ดาวน์โหลด">↓</button>
              <button class="mbtn" data-action="edit" data-id="${htmlEsc(e.id)}" title="แก้ไข">✎</button>
              <button class="mbtn del" data-action="delete" data-id="${htmlEsc(e.id)}" title="ลบ">🗑</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Attach card event listeners
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

// =========================================================================
// 5. ACTION HANDLERS (Copy, Preview, Download, Edit, Delete)
// =========================================================================
async function handleCardAction(action, fileId) {
  const entry = entries.find(x => x.id === fileId);
  if (!entry) return;

  if (action === 'copy') {
    const textToCopy = entry.description || entry.title || entry.notes || '';
    if (textToCopy) {
      await navigator.clipboard.writeText(textToCopy);
      toast('📋 คัดลอกข้อความพรอมต์ลง Clipboard แล้ว!');
    } else {
      toast('ไม่มีข้อความให้คัดลอก');
    }
  } else if (action === 'preview') {
    openPreviewModal(entry);
  } else if (action === 'download') {
    downloadOriginalFile(entry);
  } else if (action === 'edit') {
    openEditorModal(entry);
  } else if (action === 'delete') {
    if (!confirm(`ต้องการลบ “${entry.title || entry.originalFilename}” ใช่หรือไม่?`)) return;
    try {
      await deleteHtmlFileRecord(fileId, entry.title);
      if (entry.htmlStoragePath) await deleteStoragePath(entry.htmlStoragePath);
      if (entry.coverStoragePath) await deleteStoragePath(entry.coverStoragePath);
      toast('ลบรายการออกจากคลังเรียบร้อยแล้ว');
    } catch (err) {
      toast('ลบไม่สำเร็จ: ' + err.message);
    }
  }
}

async function handleToggleFavorite(fileId) {
  const user = getCurrentUser();
  const uid = user?.uid || 'owner-master';
  const isFav = userFavorites.has(fileId);

  try {
    await toggleUserFavorite(uid, fileId, isFav);
    if (isFav) {
      userFavorites.delete(fileId);
      toast('นำออกจากรายการโปรดแล้ว');
    } else {
      userFavorites.add(fileId);
      toast('⭐ เพิ่มในรายการโปรดแล้ว');
    }
    render();
  } catch (err) {
    toast('ไม่สามารถอัปเดต: ' + err.message);
  }
}

// --- Isolated Sandboxed Preview Modal ---
async function openPreviewModal(entry) {
  previewEntry = entry;
  $('#previewTitle').textContent = entry.title || entry.originalFilename;
  $('#previewDesc').textContent = entry.description || 'รันในแซนด์บ็อกซ์แยกอิสระ (สัดส่วน 2:3)';
  $('#previewFilename').textContent = `${entry.originalFilename} · ${fmtSize(entry.fileSize)}`;

  const frame = $('#previewFrame');
  frame.removeAttribute('srcdoc');

  try {
    let htmlContent = '';
    if (entry.htmlDownloadUrl) {
      const resp = await fetch(entry.htmlDownloadUrl);
      htmlContent = await resp.text();
    } else if (entry.body) {
      htmlContent = entry.body;
    } else {
      htmlContent = `<h1>${htmlEsc(entry.title)}</h1><p>${htmlEsc(entry.description)}</p>`;
    }

    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; object-src 'none';">`;
    const guardedHtml = htmlContent.includes('<head>')
      ? htmlContent.replace('<head>', `<head>${cspMeta}`)
      : cspMeta + htmlContent;

    frame.srcdoc = guardedHtml;
    $('#previewWrap').classList.add('show');
    document.body.style.overflow = 'hidden';
  } catch (err) {
    toast('โหลดตัวอย่างไม่สำเร็จ: ' + err.message);
  }
}

function downloadOriginalFile(entry) {
  if (!entry) return;
  if (entry.htmlDownloadUrl) {
    const a = document.createElement('a');
    a.href = entry.htmlDownloadUrl;
    a.download = entry.originalFilename || 'archive.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('กำลังดาวน์โหลดไฟล์ HTML...');
  } else if (entry.body) {
    const blob = new Blob([entry.body], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.originalFilename || 'file.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('ดาวน์โหลดไฟล์เรียบร้อย');
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
  $('#uploadProgressWrap').hidden = true;

  if (entry) {
    $('#editTitle').textContent = 'แก้ไขรายละเอียดไฟล์/พรอมต์';
    $('#fileUploadField').hidden = true;
    $('#titleInput').value = entry.title || '';
    $('#categoryInput').value = entry.categoryName || '';
    $('#modelTagInput').value = entry.modelTag || '';
    $('#descInput').value = entry.description || '';
    $('#notesInput').value = entry.notes || '';
    if (entry.coverDownloadUrl) {
      $('#coverPreview').src = entry.coverDownloadUrl;
      $('#coverPreview').hidden = false;
    }
  } else {
    $('#editTitle').textContent = 'เพิ่มพรอมต์ / ไฟล์ HTML ใหม่';
    $('#fileUploadField').hidden = false;
    $('#fileSelectInfo').textContent = 'ระบบจะสกัดชื่อและคำอธิบายให้อัตโนมัติ';
  }

  $('#editWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
}

$('#htmlFiles')?.addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  selectedHtmlFile = file;
  $('#fileSelectInfo').textContent = `เลือก: ${file.name} (${fmtSize(file.size)})`;

  try {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const autoTitle = (doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || file.name.replace(/\.html?$/i, '')).trim();
    const autoDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';

    if (!$('#titleInput').value) $('#titleInput').value = autoTitle;
    if (!$('#descInput').value && autoDesc) $('#descInput').value = autoDesc;
    if (!$('#categoryInput').value) $('#categoryInput').value = 'ภาพบุคคล';
    if (!$('#modelTagInput').value) $('#modelTagInput').value = 'GPT-Image 2.5';
  } catch (_) {}
});

$('#coverInput')?.addEventListener('change', (ev) => {
  const file = ev.target.files?.[0];
  if (!file) {
    selectedCoverBlob = null;
    return;
  }
  selectedCoverBlob = file;
  $('#coverPreview').src = URL.createObjectURL(file);
  $('#coverPreview').hidden = false;
});

$('#editForm')?.addEventListener('submit', async (ev) => {
  ev.preventDefault();

  const title = $('#titleInput').value.trim();
  const categoryName = $('#categoryInput').value.trim() || 'ทั่วไป';
  const categoryId = categoryName.toLowerCase().replace(/\s+/g, '-');
  const modelTag = $('#modelTagInput').value.trim() || 'GPT-Image 2.5';
  const description = $('#descInput').value.trim();
  const notes = $('#notesInput').value.trim();

  try {
    if (editingId) {
      const entry = entries.find(x => x.id === editingId);
      let coverDownloadUrl = entry.coverDownloadUrl || '';
      let coverStoragePath = entry.coverStoragePath || '';

      if (selectedCoverBlob) {
        $('#uploadProgressWrap').hidden = false;
        const upload = await uploadCoverImage(editingId, selectedCoverBlob, (pct) => {
          $('#uploadProgressFill').style.width = `${pct}%`;
          $('#uploadProgressText').textContent = `กำลังอัปโหลดรูป 2:3: ${pct}%`;
        });
        coverDownloadUrl = upload.downloadUrl;
        coverStoragePath = upload.storagePath;
      }

      await updateHtmlFileRecord(editingId, {
        title,
        categoryName,
        categoryId,
        modelTag,
        description,
        notes,
        coverDownloadUrl,
        coverStoragePath
      });

      closeModal('editWrap');
      toast('บันทึกการแก้ไขเรียบร้อย');
    } else {
      if (!selectedHtmlFile) {
        toast('กรุณาเลือกไฟล์ HTML ก่อน');
        return;
      }

      const fileId = "doc-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
      const text = await selectedHtmlFile.text();
      const contentHash = await computeContentHash(text);

      $('#uploadProgressWrap').hidden = false;

      // Upload HTML
      const htmlUpload = await uploadHtmlFile(fileId, selectedHtmlFile, selectedHtmlFile.name, (pct) => {
        $('#uploadProgressFill').style.width = `${pct}%`;
        $('#uploadProgressText').textContent = `อัปโหลด HTML: ${pct}%`;
      });

      // Upload Cover
      let coverUpload = null;
      if (selectedCoverBlob) {
        $('#uploadProgressText').textContent = 'อัปโหลดภาพ 2:3...';
        coverUpload = await uploadCoverImage(fileId, selectedCoverBlob);
      }

      await createHtmlFileRecord({
        title: title || selectedHtmlFile.name,
        description,
        categoryId,
        categoryName,
        modelTag,
        tags: [modelTag, categoryName],
        originalFilename: selectedHtmlFile.name,
        htmlStoragePath: htmlUpload.storagePath,
        htmlDownloadUrl: htmlUpload.downloadUrl,
        coverStoragePath: coverUpload?.storagePath || '',
        coverDownloadUrl: coverUpload?.downloadUrl || '',
        coverType: coverUpload ? 'custom' : 'auto',
        fileSize: selectedHtmlFile.size,
        contentHash,
        notes,
        visibility: 'public'
      });

      closeModal('editWrap');
      toast('เพิ่มไฟล์สำเร็จ!');
    }
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message);
  } finally {
    $('#uploadProgressWrap').hidden = true;
  }
});

// =========================================================================
// 6. SEEDING & MIGRATION
// =========================================================================
async function seedInitialSamples() {
  $('#migrationProgress').hidden = false;
  $('#migrationReport').hidden = true;
  $('#migrationWrap').classList.add('show');
  document.body.style.overflow = 'hidden';

  try {
    const report = await migrateLegacyJsonBackup({ entries: SEED_SAMPLES }, (progress) => {
      $('#migrationBarFill').style.width = `${progress.percent}%`;
      $('#migrationStatusText').textContent = progress.status;
    });

    renderMigrationReport(report);
    toast(`ติดตั้งตัวอย่างสำเร็จ ${report.imported.length} รายการ`);
  } catch (err) {
    toast('ติดตั้งตัวอย่างล้มเหลว: ' + err.message);
  }
}

function renderMigrationReport(report) {
  $('#migrationProgress').hidden = true;
  $('#migrationReport').hidden = false;

  $('#reportSuccess').textContent = `สำเร็จ: ${report.imported.length}`;
  $('#reportDuplicates').textContent = `ข้ามไฟล์ซ้ำ: ${report.skippedDuplicates.length}`;
  $('#reportFailed').textContent = `ล้มเหลว: ${report.failed.length}`;

  let html = '';
  if (report.imported.length) {
    html += `<div><b>✓ ไฟล์ที่ติดตั้งสำเร็จ:</b><ul>${report.imported.map(x => `<li>${htmlEsc(x.title)} (${htmlEsc(x.filename)})</li>`).join('')}</ul></div>`;
  }
  if (report.skippedDuplicates.length) {
    html += `<div><b>⚠ ไฟล์ซ้ำที่ข้าม (SHA-256 ตรงกัน):</b><ul>${report.skippedDuplicates.map(x => `<li>${htmlEsc(x.filename)} → ตรงกับ “${htmlEsc(x.existingTitle)}”</li>`).join('')}</ul></div>`;
  }
  $('#reportDetails').innerHTML = html || 'เรียบร้อยสมบูรณ์';
}

$('#startSeedBtn')?.addEventListener('click', seedInitialSamples);
$('#quickSeedChip')?.addEventListener('click', seedInitialSamples);

$('#tabSeedMigrate')?.addEventListener('click', () => {
  $('#tabSeedMigrate').classList.add('active');
  $('#tabHtmlMigrate').classList.remove('active');
  $('#tabJsonMigrate').classList.remove('active');
  $('#paneSeedMigrate').hidden = false;
  $('#paneHtmlMigrate').hidden = true;
  $('#paneJsonMigrate').hidden = true;
});

$('#tabHtmlMigrate')?.addEventListener('click', () => {
  $('#tabHtmlMigrate').classList.add('active');
  $('#tabSeedMigrate').classList.remove('active');
  $('#tabJsonMigrate').classList.remove('active');
  $('#paneHtmlMigrate').hidden = false;
  $('#paneSeedMigrate').hidden = true;
  $('#paneJsonMigrate').hidden = true;
});

$('#tabJsonMigrate')?.addEventListener('click', () => {
  $('#tabJsonMigrate').classList.add('active');
  $('#tabSeedMigrate').classList.remove('active');
  $('#tabHtmlMigrate').classList.remove('active');
  $('#paneJsonMigrate').hidden = false;
  $('#paneSeedMigrate').hidden = true;
  $('#paneHtmlMigrate').hidden = true;
});

$('#startHtmlMigrateBtn')?.addEventListener('click', async () => {
  const files = [...($('#batchHtmlInput').files || [])];
  if (!files.length) {
    toast('กรุณาเลือกไฟล์ HTML');
    return;
  }
  $('#migrationProgress').hidden = false;
  $('#migrationReport').hidden = true;

  try {
    const report = await migrateHtmlFileList(files, null, (p) => {
      $('#migrationBarFill').style.width = `${p.percent}%`;
      $('#migrationStatusText').textContent = p.status;
    });
    renderMigrationReport(report);
  } catch (err) {
    toast('อัปโหลดล้มเหลว: ' + err.message);
  }
});

// Modal helpers
function closeModal(id) {
  const el = $('#' + id);
  if (!el) return;
  el.classList.remove('show');
  if (!$$('.modal-wrap.show').length) document.body.style.overflow = '';
}

$$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
$$('.modal-wrap').forEach(w => w.addEventListener('click', (e) => { if (e.target === w) closeModal(w.id); }));

$('#addNav')?.addEventListener('click', () => openEditorModal());
$('#migrationTopBtn')?.addEventListener('click', () => {
  $('#migrationReport').hidden = true;
  $('#migrationProgress').hidden = true;
  $('#migrationWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
});

$('#helpBtn')?.addEventListener('click', () => {
  $('#helpWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
});

$('#copyPromptBtn')?.addEventListener('click', async () => {
  if (previewEntry?.description) {
    await navigator.clipboard.writeText(previewEntry.description);
    toast('📋 คัดลอกพรอมต์ลง Clipboard แล้ว!');
  }
});

$('#openNewTab')?.addEventListener('click', () => {
  if (!previewEntry) return;
  const frame = $('#previewFrame');
  const guardedHtml = frame.srcdoc || '<h1>No Content</h1>';
  const blob = new Blob([guardedHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

$('#downloadPreview')?.addEventListener('click', () => downloadOriginalFile(previewEntry));

// Filter Chips
$$('.fchip[data-filter]').forEach(chip => {
  chip.addEventListener('click', () => {
    $$('.fchip[data-filter]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    render();
  });
});

$('#search')?.addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderGrid();
});

$('#sortSelect')?.addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderGrid();
});

// =========================================================================
// 7. BOOTSTRAP
// =========================================================================
async function bootstrap() {
  console.info("🚀 MIX-IMAGE Prompt & HTML Studio starting...");

  // Initialize PIN gate
  initPinGate();

  // Initialize Auth
  initAuth();

  subscribeAuth((user) => {
    if (user) {
      if (unsubscribeFavorites) unsubscribeFavorites();
      unsubscribeFavorites = subscribeUserFavorites(user.uid, (favSet) => {
        userFavorites = favSet;
        render();
      });
    }
  });

  // Connect Real-Time Firestore
  try {
    unsubscribeFirestore = subscribeHtmlFiles(
      (items, hasPendingWrites) => {
        if (items && items.length > 0) {
          entries = items;
        } else {
          // Pre-populate with bundled seed samples so 2:3 cards appear immediately
          entries = SEED_SAMPLES.map((s, idx) => ({
            id: 'seed-' + (idx + 1),
            title: s.title,
            originalFilename: s.fileName,
            categoryName: s.categoryName || s.category,
            categoryId: s.categoryId || 'portrait',
            modelTag: s.modelTag || 'GPT-Image 2.5',
            tags: s.tags || ['GPT-Image 2.5'],
            description: s.notes,
            notes: s.notes,
            body: s.body,
            coverType: s.coverType || 'auto',
            fileSize: s.body ? s.body.length : 12400,
            updatedAt: new Date().toISOString()
          }));
        }
        $('#statSync').textContent = hasPendingWrites ? 'กำลังซิงก์...' : 'พร้อม';
        render();
      },
      (err) => {
        console.warn("Firestore listener:", err.message);
        $('#statSync').textContent = 'ออฟไลน์';
        if (!entries.length) {
          entries = SEED_SAMPLES.map((s, idx) => ({
            id: 'seed-' + (idx + 1),
            title: s.title,
            originalFilename: s.fileName,
            categoryName: s.categoryName || s.category,
            categoryId: s.categoryId || 'portrait',
            modelTag: s.modelTag || 'GPT-Image 2.5',
            tags: s.tags || ['GPT-Image 2.5'],
            description: s.notes,
            notes: s.notes,
            body: s.body,
            coverType: s.coverType || 'auto',
            fileSize: s.body ? s.body.length : 12400,
            updatedAt: new Date().toISOString()
          }));
          render();
        }
      }
    );
  } catch (err) {
    console.error("Bootstrap error:", err);
  }
}

bootstrap();
