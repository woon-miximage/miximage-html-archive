# MIX-IMAGE HTML Archive — Real-Time Cloud Edition

> คลังไฟล์ HTML, พรอมต์แพ็ก (Prompt Pack), เว็บเครื่องมือ และเทมเพลตดีไซน์ บนระบบคลาวด์เรียลไทม์ (Firebase Cloud Edition) พร้อมระบบพรีวิวแยกแซนด์บ็อกซ์ ป้องกันความปลอดภัยระดับสูงสุด และระบบตรวจจับไฟล์ซ้ำ (SHA-256 Deduplication)

---

## 🌟 จุดเด่นและฟีเจอร์หลัก (Key Features)

1. **Real-Time Cloud Vault (Cloud Firestore)**:
   - ซิงก์ข้อมูลแบบเรียลไทม์สองทางด้วย `onSnapshot` ทุกการเพิ่ม แก้ไข หรือลบ จะแสดงผลทันทีบนทุกเครื่องและทุกหน้าจอโดยไม่ต้องรีเฟรชหน้าเว็บ
   - รองรับ Offline Persistence อัตโนมัติ สามารถเปิดดูข้อมูลที่แคชไว้ได้แม้ขณะออฟไลน์
2. **Cloud Storage สำหรับไฟล์ต้นฉบับ**:
   - เก็บไฟล์ HTML ตัวเต็ม, ภาพปกความละเอียดสูง (Custom Covers), และภาพถ่ายหน้าจอพรีวิว (Screenshots) แยกไว้บน Google Cloud Storage
   - รักษาชื่อไฟล์ดั้งเดิมและโครงสร้างไบต์สมบูรณ์ 100% ไม่บีบอัดจนเสียเนื้อหา
3. **ระบบพรีวิวปลอดภัยแบบแยกแซนด์บ็อกซ์ (Isolated Sandbox Runtime)**:
   - ไฟล์ HTML ที่อัปโหลดอาจมี JavaScript ทำงานอยู่ ระบบจึงรันพรีวิวใน `<iframe sandbox="allow-scripts">` **โดยไม่ให้สิทธิ์ `allow-same-origin` หรือ `allow-top-navigation`**
   - ฉีด Content Security Policy (CSP) กั้นไม่ให้โค้ดแปลกปลอมเข้าถึง `localStorage`, `cookies`, หรือโทเคน Firebase ของหน้าแอปหลัก
4. **ตรวจจับไฟล์ซ้ำอัจฉริยะ (SHA-256 Deduplication)**:
   - คำนวณ Cryptographic Hash ก่อนบันทึก หากพบไฟล์ที่มีเนื้อหาเหมือนกัน (เช่น `STREET-RIDE-DRIFT.html` กับ `StreetRideDrift.html`) ระบบจะแจ้งเตือนและป้องกันการกินพื้นที่คลาวด์ซ้ำซ้อน
5. **ระบบย้ายข้อมูลในคลิกเดียว (Migration & Bulk Importer)**:
   - นำเข้าไฟล์สำรองข้อมูล JSON เดิม (`MIX-IMAGE-HTML-Archive-Backup-*.json`) จากเวอร์ชัน IndexedDB
   - นำเข้าโฟลเดอร์ไฟล์ HTML หลายไฟล์พร้อมกัน พร้อมสร้างรายงานตรวจสอบ (Migration Audit Report) สรุปจำนวนที่สำเร็จ ไฟล์ซ้ำที่ข้าม และข้อผิดพลาดอย่างละเอียด
6. **คงอัตลักษณ์ดีไซน์ดั้งเดิม 100%**:
   - ดีไซน์สวยงาม โทนสีพาสเทลไอคอนโรบอท 🤖 MIX-IMAGE, การ์ดแสดงผลแบบ Frosted Glass, สถิติคลัง, ตัวกรองหมวดหมู่, แท็ก, และรองรับหน้าจอมือถือ แท็บเล็ต เดสก์ท็อปอย่างสมบูรณ์

---

## 🏗️ สถาปัตยกรรมระบบ (Architecture)

```
├── index.html                      # หน้าเว็บหลัก (Dashboard, Modals, Card Grid)
├── firebase-config.js              # คอนฟิกเชื่อมต่อ Firebase (รองรับ Dynamic UI Config)
├── firebase-config.example.js      # เทมเพลตตัวอย่างคอนฟิก
├── .env.example                    # ตัวอย่าง Environment Variables
├── firebase.json                   # การตั้งค่า Firebase Hosting, Rules และ Emulators
├── firestore.rules                 # กฎความปลอดภัย Firestore (Authoring โดย Specialist Subagent)
├── storage.rules                   # กฎความปลอดภัย Cloud Storage
├── firestore.indexes.json          # Composite Indexes สำหรับการคิวรี
├── src/
│   ├── app.js                      # แอปพลิเคชันหลักและ State Management
│   ├── styles/
│   │   └── main.css                # สไตล์ชีตหลักและ Responsive Breakpoints
│   └── services/
│       ├── firebase-service.js     # ตัวเชื่อมต่อ Firebase SDK v11 Modular
│       ├── auth-service.js         # ระบบสมาชิก บัญชีผู้ใช้ และ Role-based Access
│       ├── firestore-service.js    # Firestore CRUD และ Real-time Snapshot Listeners
│       ├── storage-service.js      # Cloud Storage Uploads และ Resumable Progress
│       ├── crypto-service.js       # การคำนวณ SHA-256 Hash
│       └── migration-service.js    # เอนจินย้ายข้อมูลจากระบบเดิม
├── tests/
│   └── run-tests.js                # ชุดทดสอบอัตโนมัติ (Deduplication, Sandbox, Rules)
└── _original_backup/               # สำเนาไฟล์ต้นฉบับเดิม (ปลอดภัย ไม่มีการทับไฟล์เดิม)
```

---

## 🚀 วิธีติดตั้งและเปิดใช้งานในเครื่อง (Local Setup)

### 1. เปิดใช้งานแบบด่วน (Quick Start)
คุณสามารถเปิด `index.html` ผ่าน Local Web Server ได้ทันที เช่น:
```bash
# ใช้ npx serve
npx serve .

# หรือใช้ Python
python -m http.server 5000
```
เปิดเบราว์เซอร์ไปที่ `http://localhost:5000`

### 2. ตั้งค่าการเชื่อมต่อ Firebase (เชื่อมต่อโปรเจกต์ของคุณ)
เมื่อเปิดหน้าเว็บ คุณสามารถตั้งค่าได้ 2 วิธี:
- **วิธีที่ 1 (ผ่านหน้าเว็บ)**: กดปุ่ม **“⚙ ตั้งค่า Firebase”** ที่แถบเมนูด้านซ้าย แล้ววางค่าคอนฟิกจาก Firebase Console (API Key, Project ID, Storage Bucket ฯลฯ) แล้วกดบันทึก
- **วิธีที่ 2 (แก้ไขไฟล์)**: แก้ไขไฟล์ `firebase-config.js` โดยใส่ค่าจาก Firebase Console ของคุณโดยตรง

### 3. รันผ่าน Firebase Local Emulator Suite (สำหรับทดสอบ)
หากต้องการทดสอบแบบจำลองในเครื่องโดยไม่ส่งข้อมูลขึ้นโปรเจกต์จริง:
```bash
# เริ่มต้น Emulators (Auth, Firestore, Storage, Hosting)
npx firebase-tools emulators:start
```
จากนั้นในหน้าเว็บให้เปิดเมนู **“⚙ ตั้งค่า Firebase”** แล้วเลือกติ๊กถูกที่ **“ใช้ Firebase Local Emulator”**

---

## 🔒 กฎความปลอดภัย (Security Rules)

### Cloud Firestore (`firestore.rules`)
- **Default Deny**: ปิดกั้นทุกพาธที่ไม่ได้รับอนุญาต
- **การยืนยันตัวตน**: การเพิ่ม แก้ไข และลบไฟล์ต้องเป็นสมาชิกที่ล็อกอินแล้วเท่านั้น
- **ตรวจสอบความถูกต้อง (Validation)**:
  - ขนาดไฟล์ HTML สูงสุดไม่เกิน 15 MB
  - บังคับ SHA-256 Hash ต้องมีความยาว 64 ตัวอักษร
  - ห้ามแก้ไขฟิลด์สำคัญ (`createdBy`, `createdAt`, `contentHash`) ในขั้นตอนการอัปเดต เพื่อป้องกัน Update Bypass
  - บังคับใช้ `request.time` สำหรับเวลาฝั่งเซิร์ฟเวอร์
- **รายการโปรด (Favorites)**: ผู้ใช้แต่ละคนจัดการได้เฉพาะรายการโปรดของตนเอง (`users/{uid}/favorites/{fileId}`)

### Cloud Storage (`storage.rules`)
- ตรวจสอบ Content-Type (`text/html` สำหรับไฟล์เว็บ, `image/*` สำหรับภาพปกและภาพพรีวิว)
- จำกัดขนาดอัปโหลด: HTML ไม่เกิน 15 MB, ภาพปกไม่เกิน 5 MB, ภาพพรีวิวไม่เกิน 8 MB

---

## 📦 การย้ายข้อมูลจากระบบเดิม (Migration Guide)

1. เปิดแอปพลิเคชัน แล้วคลิกที่เมนู **“⇄ ย้าย/นำเข้าข้อมูล (Migrate)”** ทางด้านซ้าย
2. เลือกว่าจะย้ายด้วยวิธีใด:
   - **แท็บ 1: นำเข้าจาก JSON Backup**: เลือกไฟล์สำรอง JSON ที่เคยดาวน์โหลดไว้จากแอปเดิม ระบบจะอ่านเนื้อหา HTML, ถอดรหัสภาพปก, ตรวจสอบ SHA-256, อัปโหลดขึ้น Cloud Storage, และสร้างระเบียนใน Firestore
   - **แท็บ 2: นำเข้าไฟล์ HTML โดยตรง**: เลือกไฟล์ `.html` จากเครื่องพร้อมกันหลายไฟล์ ระบบจะสกัดชื่อไฟล์ ดึง `<title>` สกัดคำอธิบาย จัดหมวดหมู่ให้อัตโนมัติ
3. ระบบจะแสดง **Migration Audit Report** สรุปจำนวนที่สำเร็จ ไฟล์ซ้ำที่ข้าม (Duplicates Skipped) และข้อผิดพลาด (ถ้ามี)

---

## 🧪 การรันชุดทดสอบอัตโนมัติ (Automated Tests)

รันคำสั่ง:
```bash
node tests/run-tests.js
```

ผลการทดสอบครอบคลุม:
- การคำนวณ SHA-256 และการตรวจจับไฟล์ซ้ำจากไฟล์ตัวอย่างจริง
- การสกัด Metadata ภาษาไทยและคำอธิบาย
- การฉีด Content Security Policy (CSP) ในกรอบพรีวิวแซนด์บ็อกซ์
- การตรวจสอบโครงสร้างและข้อกำหนดของ `firestore.rules` และ `storage.rules`

---

## 📋 สิ่งที่เจ้าของโปรเจกต์ต้องทำบน Firebase Console

1. **สร้าง Firebase Project** ที่ [console.firebase.google.com](https://console.firebase.google.com)
2. **เปิดใช้งาน Authentication**:
   - ไปที่ *Build > Authentication > Sign-in method*
   - เปิดใช้งาน **Email/Password** และ/หรือ **Google**
3. **เปิดใช้งาน Cloud Firestore**:
   - ไปที่ *Build > Firestore Database*
   - กด Create database (เลือกโหมด Production หรือเริ่มด้วย Emulator)
4. **เปิดใช้งาน Cloud Storage**:
   - ไปที่ *Build > Storage*
   - กด Get started
5. **คัดลอก Web App Configuration**:
   - ไปที่ *Project Settings > General > Your apps*
   - กดเพิ่ม Web App `</>` แล้วคัดลอกค่าคอนฟิกมาใส่ใน `firebase-config.js` หรือในเมนูตั้งค่าของเว็บ
6. **Deploy กฎและโฮสติ้ง**:
   ```bash
   npx firebase-tools deploy
   ```

---

## 🛡️ รายการตรวจสอบความปลอดภัยก่อนขึ้น Production (Deployment Checklist)

- [x] ตรวจสอบว่า `MIX-IMAGE-HTML-Archive.html` เดิมถูกสำรองไว้ใน `_original_backup/` อย่างปลอดภัย
- [x] ตรวจสอบว่าไม่มี API Key ลับหรือ Service Account Key ปรากฏในซอร์สโค้ดฝั่ง Client
- [x] ตรวจสอบว่า `firestore.rules` ปิดกั้นการเขียนแบบ Anonymous และตรวจสอบความยาวข้อมูลทุกฟิลด์
- [x] ตรวจสอบว่า Sandbox Iframe ปิดกั้น `allow-same-origin` เพื่อป้องกัน XSS หลุดรอด
- [x] ทดสอบการอัปโหลดไฟล์ HTML, การค้นหา, การติดดาวรายการโปรด, และการดาวน์โหลดไฟล์กลับ
