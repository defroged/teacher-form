function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createSpeechText(text) {
  const trimmedText = cleanString(text);
  if (!trimmedText) {
    throw new Error('Cannot generate speech for empty text.');
  }

  const textWithPunctuation = /[.!?]["')\]]?$/.test(trimmedText)
    ? trimmedText
    : `${trimmedText}.`;

  return `[speaking calmly and clearly] ${textWithPunctuation} [long pause]`;
}

function createSafeFileStem(text) {
  const stem = text
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return stem || 'speech';
}

export { cleanString, createSafeFileStem, createSpeechText };
