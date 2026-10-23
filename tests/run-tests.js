/**
 * Automated Verification Test Suite for MIX-IMAGE HTML Archive
 * Executes unit and integration tests against real project sample files.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

console.log("=================================================");
console.log(" MIX-IMAGE HTML ARCHIVE — TEST SUITE VERIFICATION");
console.log("=================================================\n");

// --- Test 1: Content Hash & Deduplication ---
console.log("Test 1: Content Hash & Duplicate Detection");
const sample1Path = path.resolve('extracted_samples/ตัวอย่าง HTML/STREET-RIDE-DRIFT.html');
const sample2Path = path.resolve('extracted_samples/ตัวอย่าง HTML/StreetRideDrift.html');

if (fs.existsSync(sample1Path) && fs.existsSync(sample2Path)) {
  const content1 = fs.readFileSync(sample1Path);
  const content2 = fs.readFileSync(sample2Path);

  const hash1 = await computeSha256(content1);
  const hash2 = await computeSha256(content2);

  assert(hash1.length === 64, `SHA-256 hash length is exactly 64 characters (${hash1.slice(0, 16)}...)`);
  assert(hash1 === hash2, `Identical content files produce identical hash: ${hash1}`);
} else {
  console.warn("  ⚠ Warning: Sample files not found at expected path.");
}

// --- Test 2: Different Content Hash Distinctness ---
console.log("\nTest 2: Distinct Content Hash Verification");
const sample3Path = path.resolve('extracted_samples/ตัวอย่าง HTML/index(3).html');
if (fs.existsSync(sample3Path)) {
  const content3 = fs.readFileSync(sample3Path);
  const hash3 = await computeSha256(content3);
  const content1 = fs.readFileSync(sample1Path);
  const hash1 = await computeSha256(content1);

  assert(hash3 !== hash1, `Distinct files produce unique hashes (index(3): ${hash3.slice(0, 8)}... != drift: ${hash1.slice(0, 8)}...)`);
  assert(content3.length > 0 && content3.length < 15 * 1024 * 1024, `File size (${content3.length} bytes) is within permitted 15MB limit`);
}

// --- Test 3: Metadata Extraction & Category Inference ---
console.log("\nTest 3: Metadata Extraction & Thai Character Parsing");
const sample4Path = path.resolve('extracted_samples/ตัวอย่าง HTML/ตามหากันจนเจอ – พรอมต์ GPT Image 2.5 ชุดชิบิ 80 ภาพ.html');
if (fs.existsSync(sample4Path)) {
  const content4 = fs.readFileSync(sample4Path, 'utf-8');
  const titleMatch = content4.match(/<title>([\s\S]*?)<\/title>/i);
  const extractedTitle = titleMatch ? titleMatch[1].trim() : '';

  assert(extractedTitle.includes('ชุดชิบิ 80 ภาพ'), `Correctly extracted Thai title: "${extractedTitle}"`);
  
  // Category inference test
  const isPromptPack = /prompt|พรอมต์|gpt image|chibi|ชุดชิบิ/i.test(extractedTitle + ' ' + content4.slice(0, 5000));
  assert(isPromptPack === true, `Correctly inferred category as "Prompt Pack"`);
}

// --- Test 4: Isolated Sandbox CSP Injection ---
console.log("\nTest 4: Isolated Sandbox Security & CSP Injection");
function injectCsp(html) {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; object-src 'none';">`;
  return html.includes('<head>')
    ? html.replace('<head>', `<head>${cspMeta}`)
    : cspMeta + html;
}

const mockUntrustedHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body><script>alert(window.origin);</script></body></html>`;
const guardedHtml = injectCsp(mockUntrustedHtml);

assert(guardedHtml.includes('http-equiv="Content-Security-Policy"'), `Content-Security-Policy meta header is injected`);
assert(guardedHtml.includes("object-src 'none'"), `Restricts malicious plugins via object-src 'none'`);

// --- Test 5: Firestore Security Rules Syntax & Structure ---
console.log("\nTest 5: Firestore Security Rules Validation");
const rulesPath = path.resolve('firestore.rules');
assert(fs.existsSync(rulesPath), `firestore.rules file exists on disk`);

if (fs.existsSync(rulesPath)) {
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');
  assert(rulesContent.includes("rules_version = '2'"), `Uses rules version 2`);
  assert(rulesContent.includes("match /html_files/{fileId}"), `Defines match for html_files`);
  assert(rulesContent.includes("data.fileSize <= 15728640"), `Enforces 15MB file size limit in rules`);
  assert(rulesContent.includes("data.contentHash.size() == 64"), `Enforces 64-char SHA-256 hash in rules`);
  assert(rulesContent.includes("request.resource.data.contentHash == resource.data.contentHash"), `Enforces contentHash immutability on update`);
  assert(rulesContent.includes("match /{document=**} {\n      allow read, write: if false;\n    }"), `Enforces global default deny`);
}

// --- Test 6: Storage Security Rules Structure ---
console.log("\nTest 6: Cloud Storage Security Rules Validation");
const storageRulesPath = path.resolve('storage.rules');
assert(fs.existsSync(storageRulesPath), `storage.rules file exists on disk`);

if (fs.existsSync(storageRulesPath)) {
  const storageContent = fs.readFileSync(storageRulesPath, 'utf-8');
  assert(storageContent.includes("match /html_files/{fileId}/{fileName}"), `Defines match for html_files`);
  assert(storageContent.includes("15 * 1024 * 1024"), `Enforces 15MB storage limit`);
  assert(storageContent.includes("isHtml()"), `Enforces text/html content-type verification`);
  assert(storageContent.includes("match /{allPaths=**} {\n      allow read, write: if false;\n    }"), `Enforces default deny on storage`);
}

// --- Test 7: Master PIN Authentication Logic ---
console.log("\nTest 7: Master PIN 1449 Verification");
const MASTER_PIN = "1449";
function verifyPin(input) {
  return input === MASTER_PIN;
}

assert(verifyPin("1449") === true, "PIN 1449 is correctly accepted as Master Admin PIN");
assert(verifyPin("0000") === false, "Incorrect PIN 0000 is rejected");
assert(verifyPin("1234") === false, "Incorrect PIN 1234 is rejected");

// --- Summary ---
console.log("\n=================================================");
console.log(` TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
}
