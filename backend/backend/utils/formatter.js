export function sanitizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\u0000/g, "").trim();
}

export function truncateText(value, max = 4000) {
  const text = sanitizeText(value);
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max)}...`;
}

export function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;

  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}