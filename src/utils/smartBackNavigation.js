const CATEGORY_LIST_STORAGE_PREFIX = "smart-back:category-list:";

export const getCategoryListKey = (tournamentId) =>
  `${CATEGORY_LIST_STORAGE_PREFIX}${tournamentId}`;

export const readSmartListState = (key) => {
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const writeSmartListState = (key, value) => {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage can be unavailable in hardened browser/Electron contexts.
  }
};

export const createSmartListEntryState = (currentState, listKey) => ({
  ...(currentState || {}),
  smartListKey: listKey,
});

export const createSmartChildState = (currentState, listKey, returnTo, categoryIds = []) => ({
  ...(currentState || {}),
  smartBack: {
    listKey,
    returnTo,
    categoryIds,
  },
});

export const getSmartBackContext = (location) =>
  location.state?.smartBack || null;

const getNumericOrder = (category) => {
  const value = [
    category.displayOrder,
    category.sortOrder,
    category.order,
    category.position,
  ].find(
    (candidate) => candidate !== null && candidate !== undefined && candidate !== "" && Number.isFinite(Number(candidate))
  );
  return value === undefined ? null : Number(value);
};

export const getStableCategoryIds = (categories = []) =>
  categories
    .map((category, originalIndex) => ({ category, originalIndex }))
    .sort((a, b) => {
      const orderA = getNumericOrder(a.category);
      const orderB = getNumericOrder(b.category);
      if (orderA !== null || orderB !== null) {
        if (orderA === null) return 1;
        if (orderB === null) return -1;
        if (orderA !== orderB) return orderA - orderB;
      }

      const createdA = Date.parse(a.category.createdAt || a.category.created_at || "");
      const createdB = Date.parse(b.category.createdAt || b.category.created_at || "");
      if (Number.isFinite(createdA) || Number.isFinite(createdB)) {
        if (!Number.isFinite(createdA)) return 1;
        if (!Number.isFinite(createdB)) return -1;
        if (createdA !== createdB) return createdA - createdB;
      }

      // The stored array is the current display order and is stable for legacy data.
      if (a.originalIndex !== b.originalIndex) return a.originalIndex - b.originalIndex;
      return String(a.category.id || "").localeCompare(String(b.category.id || ""));
    })
    .map(({ category }) => category.id)
    .filter(Boolean);
