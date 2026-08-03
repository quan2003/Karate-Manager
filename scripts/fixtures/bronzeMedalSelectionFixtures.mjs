import { BRONZE_MODES } from "../../src/domain/bronzeMode.js";
import { createGenerationKey, createStableAuxiliaryId } from "../../src/domain/bronzeCompetition.js";
import { createCompletedBracket } from "./bronzeCompetitionFixtures.mjs";

export const cloneFixture = (value) => JSON.parse(JSON.stringify(value));

export function createMedalFixture(size, options = {}) {
  const fixture = createCompletedBracket(size, options);
  return { category: { id: fixture.categoryId, ...(options.bronze_mode ? { bronze_mode: options.bronze_mode } : {}) }, bracket: fixture.bracket };
}

export function patchMainMatch(fixture, matchId, patch) {
  const copy = cloneFixture(fixture);
  const match = copy.bracket.matches.find((item) => item.id === matchId);
  if (!match) throw new Error(`Unknown main match: ${matchId}`);
  Object.assign(match, cloneFixture(patch));
  return copy;
}

export function createSingleBronzeAuxiliary(categoryId, patch = {}) {
  const generationKey = createGenerationKey({ categoryId, mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 });
  const athlete1 = { id: "bronze-a", name: "Bronze A" };
  const athlete2 = { id: "bronze-b", name: "Bronze B" };
  return {
    id: createStableAuxiliaryId(generationKey),
    generationKey,
    matchCode: "B1",
    stageType: "BRONZE",
    sequence: 1,
    athlete1,
    athlete2,
    winner: athlete1,
    resultStatus: "FINAL",
    ...cloneFixture(patch),
  };
}

export function withAuxiliary(fixture, matches) {
  const copy = cloneFixture(fixture);
  copy.bracket.auxiliaryMatches = cloneFixture(matches);
  return copy;
}

export function createLegacyAutoAdvanceFixture() {
  const fixture = createMedalFixture(8, { categoryId: "legacy-auto-advance" });
  const copy = cloneFixture(fixture);
  const semi = copy.bracket.matches.find((match) => match.id === "main-r2-p0");
  semi.athlete2 = null;
  semi.winner = semi.athlete1;
  semi.isBye = false;
  return copy;
}

export const dualFixtures = Object.freeze({
  four: createMedalFixture(4, { categoryId: "medals-4" }),
  eight: createMedalFixture(8, { categoryId: "medals-8" }),
  sixteen: createMedalFixture(16, { categoryId: "medals-16" }),
  thirtyTwo: createMedalFixture(32, { categoryId: "medals-32" }),
});

export const singleFixture = createMedalFixture(8, { categoryId: "single-medals", bronze_mode: BRONZE_MODES.SINGLE_BRONZE });
export const wkfFixture = createMedalFixture(8, { categoryId: "wkf-medals", bronze_mode: BRONZE_MODES.WKF_REPECHAGE });
