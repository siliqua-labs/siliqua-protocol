/** Splits a status line that ends in a URL, so the URL can be shown as a short link. */
export function splitStatusLink(status: string): {
  text: string;
  url: string | null;
} {
  const match = /^(.*?)\s*(https?:\/\/\S+)$/.exec(status);
  if (!match) return { text: status, url: null };
  return { text: match[1] ?? "", url: match[2] ?? null };
}
