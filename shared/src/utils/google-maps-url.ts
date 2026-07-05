const GOOGLE_MAPS_URL_REGEX =
  /^https?:\/\/(?:maps\.app\.goo\.gl\/[^\s]+|(?:www\.)?google\.com\/maps\/[^\s]+|maps\.google\.com\/[^\s]+)/i;

export function isValidGoogleMapsUrl(value: string | null | undefined): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  return GOOGLE_MAPS_URL_REGEX.test(trimmed);
}

export function extractGoogleMapsUrls(text: string): string[] {
  const matches = text.match(
    /https?:\/\/(?:maps\.app\.goo\.gl\/[a-zA-Z0-9]+|(?:www\.)?google\.com\/maps\/[^\s]+|maps\.google\.com\/[^\s]+)/gi,
  );
  return matches ? [...new Set(matches)] : [];
}
