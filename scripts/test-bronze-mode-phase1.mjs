import assert from "node:assert/strict";
import {
  BRONZE_MODES,
  BRONZE_MODE_SCHEMA_VERSION,
  DEFAULT_BRONZE_MODE,
  isValidBronzeMode,
  planBronzeModeMigration,
  resolveBronzeMode,
  validateBronzeMode,
} from "../src/domain/bronzeMode.js";

const legacyTournament = {
  id: "t-legacy",
  name: "Legacy tournament",
  format: "unchanged",
  schedule: {
    "cat-1": { date: "2026-08-03", time: "08:00", mat: 1 },
  },
  categoryResults: {
    "cat-1": {
      first: "Athlete A",
      second: "Athlete B",
      third1: "Athlete C",
      third2: "Athlete D",
    },
  },
  categories: [
    {
      id: "cat-1",
      name: "Legacy category",
      format: "repechage",
      athletes: [{ id: "a-1", name: "Athlete A" }],
      bracket: {
        id: "bracket-1",
        numRounds: 2,
        matches: [
          {
            id: "match-1",
            matchNumber: 1,
            matchCode: "M1",
            round: 1,
            position: 0,
            athlete1: { id: "a-1", name: "Athlete A" },
            athlete2: { id: "a-2", name: "Athlete B" },
            score1: 2,
            score2: 1,
            winner: { id: "a-1", name: "Athlete A" },
            isBye: false,
            nextMatchId: "match-3",
          },
          {
            id: "match-2",
            matchNumber: null,
            matchCode: null,
            round: 1,
            position: 1,
            athlete1: { id: "a-3", name: "Athlete C" },
            athlete2: null,
            score1: null,
            score2: null,
            winner: { id: "a-3", name: "Athlete C" },
            isBye: true,
            nextMatchId: "match-3",
          },
          {
            id: "match-3",
            matchNumber: 2,
            matchCode: "M2",
            round: 2,
            position: 0,
            athlete1: { id: "a-1", name: "Athlete A" },
            athlete2: { id: "a-3", name: "Athlete C" },
            score1: 3,
            score2: 2,
            winner: { id: "a-1", name: "Athlete A" },
            isBye: false,
            nextMatchId: null,
          },
        ],
      },
    },
  ],
};

const source = [legacyTournament];
const sourceBefore = JSON.stringify(source);
const categoryBefore = JSON.stringify(legacyTournament.categories[0]);

assert.equal(resolveBronzeMode(legacyTournament.categories[0]), DEFAULT_BRONZE_MODE);
assert.equal(JSON.stringify(legacyTournament.categories[0]), categoryBefore, "resolver mutated legacy category");

for (const mode of Object.values(BRONZE_MODES)) {
  assert.equal(isValidBronzeMode(mode), true);
  assert.equal(validateBronzeMode(mode), true);
  assert.equal(resolveBronzeMode({ bronze_mode: mode }), mode);
}
assert.equal(isValidBronzeMode("REPECHAGE"), false);
assert.throws(() => validateBronzeMode("REPECHAGE"), /Invalid bronze_mode/);
assert.throws(() => resolveBronzeMode({ bronze_mode: "REPECHAGE" }), /Invalid bronze_mode/);

const plan = planBronzeModeMigration(source);
assert.equal(plan.targetVersion, BRONZE_MODE_SCHEMA_VERSION);
assert.equal(plan.changed, true);
assert.deepEqual(plan.affectedCategories, [
  { tournamentId: "t-legacy", categoryId: "cat-1" },
]);
assert.equal(JSON.stringify(source), sourceBefore, "migration planning mutated source data");
assert.notEqual(plan.migratedTournaments, source, "migration plan reused source array");

const migratedCategory = plan.migratedTournaments[0].categories[0];
assert.equal(migratedCategory.bronze_mode, DEFAULT_BRONZE_MODE);
assert.equal(Object.hasOwn(migratedCategory.bracket, "auxiliaryMatches"), false);

const migratedWithoutMode = structuredClone(plan.migratedTournaments);
delete migratedWithoutMode[0].categories[0].bronze_mode;
assert.deepEqual(migratedWithoutMode, source, "migration changed legacy data outside bronze_mode");

assert.deepEqual(migratedCategory.bracket, legacyTournament.categories[0].bracket);
assert.deepEqual(plan.migratedTournaments[0].schedule, legacyTournament.schedule);
assert.deepEqual(plan.migratedTournaments[0].categoryResults, legacyTournament.categoryResults);
assert.equal(migratedCategory.format, "repechage", "legacy format was converted");
assert.deepEqual(
  migratedCategory.bracket.matches.map(({ id, matchNumber, matchCode, winner, score1, score2, isBye, nextMatchId }) => ({
    id,
    matchNumber,
    matchCode,
    winner,
    score1,
    score2,
    isBye,
    nextMatchId,
  })),
  legacyTournament.categories[0].bracket.matches.map(({ id, matchNumber, matchCode, winner, score1, score2, isBye, nextMatchId }) => ({
    id,
    matchNumber,
    matchCode,
    winner,
    score1,
    score2,
    isBye,
    nextMatchId,
  }))
);

const alreadyCurrent = [{
  id: "t-current",
  categories: Object.values(BRONZE_MODES).map((mode, index) => ({
    id: `cat-current-${index}`,
    bronze_mode: mode,
  })),
}];
const currentPlan = planBronzeModeMigration(alreadyCurrent);
assert.equal(currentPlan.changed, false);
assert.deepEqual(currentPlan.migratedTournaments, alreadyCurrent);

assert.throws(
  () => planBronzeModeMigration([{ id: "bad", categories: [{ id: "bad-cat", bronze_mode: "UNKNOWN" }] }]),
  /Invalid bronze_mode/
);

const fakeSettings = new Map();
const fakeBackups = new Map();
let saveTournamentsCalls = 0;
globalThis.window = {
  electronAPI: {
    db: {
      getTournaments: async () => source,
      saveTournaments: async () => {
        saveTournamentsCalls += 1;
        return true;
      },
      getSetting: async (key) => fakeSettings.get(key) ?? null,
      setSetting: async (key, value) => {
        fakeSettings.set(key, value);
        return true;
      },
      saveAutoBackup: async (id, reason, data, size) => {
        fakeBackups.set(id, { id, reason, data, size, timestamp: new Date().toISOString() });
        return true;
      },
      getAutoBackupById: async (id) => fakeBackups.get(id) ?? null,
    },
  },
};

const {
  dbSetBronzeModeSchemaVersion,
  getBronzeModeSchemaStatus,
  previewBronzeModeMigration,
} = await import("../src/services/dbService.js");
const { createVerifiedMigrationBackup } = await import("../src/services/backupService.js");

assert.deepEqual(await getBronzeModeSchemaStatus(), {
  currentVersion: 0,
  targetVersion: BRONZE_MODE_SCHEMA_VERSION,
  needsMigration: true,
});
const dbPreview = await previewBronzeModeMigration();
assert.equal(dbPreview.changed, true);
assert.equal(saveTournamentsCalls, 0, "migration preview wrote tournament data");
assert.equal(fakeSettings.size, 0, "migration preview advanced schema version");

const verifiedBackup = await createVerifiedMigrationBackup("bronze_mode_v1");
assert.equal(verifiedBackup.success, true);
assert.equal(verifiedBackup.tournamentCount, 1);
assert.match(verifiedBackup.backupId, /^migration_/);
assert.equal(saveTournamentsCalls, 0, "backup preparation wrote tournament data");

await assert.rejects(
  () => dbSetBronzeModeSchemaVersion(BRONZE_MODE_SCHEMA_VERSION),
  /verified migration backup is required/
);
await dbSetBronzeModeSchemaVersion(
  BRONZE_MODE_SCHEMA_VERSION,
  verifiedBackup.backupId
);
assert.deepEqual(await getBronzeModeSchemaStatus(), {
  currentVersion: BRONZE_MODE_SCHEMA_VERSION,
  targetVersion: BRONZE_MODE_SCHEMA_VERSION,
  needsMigration: false,
});
await assert.rejects(
  () => dbSetBronzeModeSchemaVersion(2, verifiedBackup.backupId),
  /Unsupported bronze mode schema version/
);

globalThis.window.electronAPI.db.getAutoBackupById = async (id) => {
  const saved = fakeBackups.get(id);
  return saved ? { ...saved, data: `${saved.data}corrupt` } : null;
};
const rejectedBackup = await createVerifiedMigrationBackup("bronze_mode_v1_corrupt");
assert.equal(rejectedBackup.success, false);
assert.match(rejectedBackup.error, /verification failed/);

console.log("Bronze mode Phase 1 regression tests passed.");
