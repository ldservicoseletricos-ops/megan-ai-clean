export function tokenizeText(text = "") {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function countTokensApprox(text = "") {
  return tokenizeText(text).length;
}