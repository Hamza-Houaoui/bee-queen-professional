/**
 * Smart Search Utility
 * Performs keyword-based search across multiple fields
 */
export function smartSearch(items, query, fields) {
  if (!query) return items;
  const q = query.toLowerCase().trim();
  const keywords = q.split(/\s+/);

  return items.filter(item => {
    return keywords.every(kw => {
      return fields.some(field => {
        const val = item[field];
        if (val === undefined || val === null) return false;
        return String(val).toLowerCase().includes(kw);
      });
    });
  });
}
