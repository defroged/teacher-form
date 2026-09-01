const CLASS_ALIASES = Object.freeze({
  'Orion 2': 'Orion'
});

function canonicalizeClassName(className) {
  const trimmedClassName = typeof className === 'string' ? className.trim() : '';
  return CLASS_ALIASES[trimmedClassName] || trimmedClassName;
}

export { canonicalizeClassName };
