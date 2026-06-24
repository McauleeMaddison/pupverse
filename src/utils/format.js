export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

export function titleCase(value) {
  if (!value) return "Stat";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
