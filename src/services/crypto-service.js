/**
 * Cryptographic utility for computing SHA-256 content hashes
 * Used for reliable file deduplication without reading or transmitting entire files twice.
 */

export async function computeContentHash(content) {
  let arrayBuffer;
  if (typeof content === 'string') {
    arrayBuffer = new TextEncoder().encode(content);
  } else if (content instanceof Blob || content instanceof File) {
    arrayBuffer = await content.arrayBuffer();
  } else if (content instanceof ArrayBuffer) {
    arrayBuffer = content;
  } else {
    throw new Error('Unsupported content type for SHA-256 computation');
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
