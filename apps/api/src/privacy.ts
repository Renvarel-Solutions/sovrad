// Heuristic only: callers must also restrict source selection and obtain consent.
// This detects common credentials, not every secret or confidential document.
export const secretLike = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\d{6,}:[A-Za-z0-9_-]{25,})\b|\b(?:api[_ -]?key|access[_ -]?token|password|secret)["']?\s*[:=]\s*["']?[^\s"'`,;{}\[\]<>]{12,}/i;
const credentialField = /^(?:api[_ -]?key|access[_ -]?token|password|secret)$/i;

function privateString(value: string, knownSecret?: string): boolean {
  let text = value;
  for (let layer = 0; layer < 4; layer++) {
    if ((knownSecret && text.includes(knownSecret)) || secretLike.test(text)) return true;
    // Handle quoted assignments embedded in an escaped JSON/text string without serializing leaves.
    const decoded = text.replace(/\\([\\"'])/g, '$1');
    if (decoded === text) break;
    text = decoded;
  }
  return false;
}

export function containsPrivateContent(value: unknown, knownSecret?: string): boolean {
  const pending: {value: unknown; depth: number; field?: string}[] = [{value, depth: 0}];
  const seen = new WeakSet<object>();
  let visited = 0;
  while (pending.length) {
    const item = pending.pop()!;
    // Fail closed on values outside bounded plain JSON rather than silently skip part of an input.
    if (++visited > 10000 || item.depth > 32) return true;
    if (typeof item.value === 'string') {
      if (privateString(item.value, knownSecret) ||
          (item.field && credentialField.test(item.field) && privateString(`${item.field}=${item.value}`, knownSecret))) return true;
    } else if (item.value && typeof item.value === 'object') {
      if (seen.has(item.value)) return true;
      seen.add(item.value);
      if (!Array.isArray(item.value) && Object.getPrototypeOf(item.value) !== Object.prototype &&
          Object.getPrototypeOf(item.value) !== null) return true;
      for (const [field, child] of Object.entries(item.value)) pending.push({value: child, depth: item.depth + 1, field});
    } else if (item.value !== null && !['number', 'boolean'].includes(typeof item.value)) return true;
  }
  return false;
}

export {containsPrivateContent as containsCredentialLike};
