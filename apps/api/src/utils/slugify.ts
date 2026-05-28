/**
 * Convert an org name to a URL-safe slug.
 * "Acme Corp" → "acme-corp"
 * "NovaPay Inc." → "novapay-inc"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
    .replace(/\s+/g, '-')            // spaces → dashes
    .replace(/-+/g, '-')             // collapse multiple dashes
    .replace(/^-|-$/g, '');          // trim leading/trailing dashes
}

/**
 * Make a slug unique by appending a random 4-char suffix if needed.
 * "acme-corp" → "acme-corp-a3f2"
 */
export function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}
