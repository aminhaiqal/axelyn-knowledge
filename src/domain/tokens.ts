export function estimateTokens(text: string): number {
  if (!text) return 0;
  const wordEstimate = text.trim().split(/\s+/).length * 1.3;
  const characterEstimate = text.length / 4;
  return Math.max(1, Math.ceil(Math.max(wordEstimate, characterEstimate)));
}
