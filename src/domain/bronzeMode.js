export const BRONZE_MODES = Object.freeze({
  DUAL_BRONZE: "DUAL_BRONZE",
  SINGLE_BRONZE: "SINGLE_BRONZE",
  WKF_REPECHAGE: "WKF_REPECHAGE",
});

export const DEFAULT_BRONZE_MODE = BRONZE_MODES.DUAL_BRONZE;
export const BRONZE_MODE_SCHEMA_VERSION = 1;
export const BRONZE_MODE_SCHEMA_SETTING_KEY = "bronze_mode_schema_version";

const VALID_BRONZE_MODES = new Set(Object.values(BRONZE_MODES));

export function isValidBronzeMode(value) {
  return VALID_BRONZE_MODES.has(value);
}

export function validateBronzeMode(value, { allowMissing = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (allowMissing) return true;
    throw new TypeError("bronze_mode is required");
  }

  if (!isValidBronzeMode(value)) {
    throw new TypeError(`Invalid bronze_mode: ${String(value)}`);
  }

  return true;
}

export function resolveBronzeMode(category) {
  const value = category?.bronze_mode;
  if (value === undefined || value === null || value === "") {
    return DEFAULT_BRONZE_MODE;
  }
  validateBronzeMode(value);
  return value;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function planBronzeModeMigration(tournaments) {
  if (!Array.isArray(tournaments)) {
    throw new TypeError("tournaments must be an array");
  }

  const migratedTournaments = cloneJson(tournaments);
  const affectedCategories = [];

  migratedTournaments.forEach((tournament) => {
    const categories = Array.isArray(tournament?.categories)
      ? tournament.categories
      : [];

    categories.forEach((category) => {
      const value = category?.bronze_mode;
      if (value === undefined || value === null || value === "") {
        category.bronze_mode = DEFAULT_BRONZE_MODE;
        affectedCategories.push({
          tournamentId: tournament?.id || null,
          categoryId: category?.id || null,
        });
        return;
      }

      validateBronzeMode(value);
    });
  });

  return {
    targetVersion: BRONZE_MODE_SCHEMA_VERSION,
    migratedTournaments,
    affectedCategories,
    changed: affectedCategories.length > 0,
  };
}
