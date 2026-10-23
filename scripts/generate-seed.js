import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.resolve('extracted_samples/ตัวอย่าง HTML');
const files = [
  {
    fileName: 'STREET-RIDE-DRIFT.html',
    title: 'STREET • RIDE • DRIFT',
    category: 'Prompt Pack',
    categoryName: 'Prompt Pack',
    categoryId: 'prompt-pack',
    tags: ['GPT Image', 'Street Art', 'Harley-Davidson', 'Drift'],
    notes: 'ตัวอย่างพรอมต์ GPT Image 60 แบบ สำหรับภาพสตรีทอาร์ต ฮาร์เลย์ และดริฟท์',
    coverType: 'street'
  },
  {
    fileName: 'StreetRideDrift.html',
    title: 'STREET • RIDE • DRIFT (สำเนา)',
    category: 'Prompt Pack',
    categoryName: 'Prompt Pack',
    categoryId: 'prompt-pack',
    tags: ['GPT Image', 'สำเนา', 'Street Art', 'Drift'],
    notes: 'สำเนาเนื้อหาเดียวกันกับ STREET-RIDE-DRIFT.html แต่ต่างชื่อไฟล์ ใช้ทดสอบตรวจจับไฟล์ซ้ำ',
    coverType: 'street'
  },
  {
    fileName: 'index(3).html',
    title: 'เครื่องมือทำภาพหน้างานศพ',
    category: 'เครื่องมือออกแบบ',
    categoryName: 'เครื่องมือออกแบบ',
    categoryId: 'design-tools',
    tags: ['Canvas', 'เครื่องมือออกแบบ', 'ภาพหน้างานศพ', 'งานพิมพ์'],
    notes: 'เว็บแอปพลิเคชัน Canvas สำหรับสร้างและจัดกรอบรูปอนุสรณ์งานศพ พร้อมระบบฟอนต์ไทยและการพิมพ์',
    coverType: 'memorial'
  },
  {
    fileName: 'ตามหากันจนเจอ – พรอมต์ GPT Image 2.5 ชุดชิบิ 80 ภาพ.html',
    title: 'ตามหากันจนเจอ – พรอมต์ GPT Image 2.5 ชุดชิบิ 80 ภาพ',
    category: 'Prompt Pack',
    categoryName: 'Prompt Pack',
    categoryId: 'prompt-pack',
    tags: ['GPT Image', 'ชิบิ', 'Prompt Pack', 'อัตราส่วน 3:2'],
    notes: 'ชุดพรอมต์ชิบิ 80 แบบ (ชาย 25, หญิง 25, คู่ 30) พร้อมระบบคัดลอกและ Dark/Light mode',
    coverType: 'chibi'
  }
];

const samples = files.map(f => {
  const fullPath = path.resolve(baseDir, f.fileName);
  const body = fs.readFileSync(fullPath, 'utf-8');
  return { ...f, body };
});

const out = `/**
 * Pre-bundled initial sample files for MIX-IMAGE HTML Archive
 * Ready for one-click instant seeding into Firebase Cloud.
 */

export const SEED_SAMPLES = ${JSON.stringify(samples, null, 2)};
`;

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/seed-samples.js', out, 'utf-8');
console.log('Successfully generated src/data/seed-samples.js with 4 samples!');
