export function shortContentHash(hash: string, visible = 12) {
  if (hash.length <= visible * 2 + 1) return hash;
  return `${hash.slice(0, visible)}…${hash.slice(-visible)}`;
}

export function contentHashLabel(hash: string) {
  return `SHA-256 · ${shortContentHash(hash)}`;
}
