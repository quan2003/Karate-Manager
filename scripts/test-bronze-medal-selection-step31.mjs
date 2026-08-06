import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BRONZE_MODES } from "../src/domain/bronzeMode.js";
import {
  MEDAL_SELECTION_STATUSES,
  findSingleBronzeMatch,
  getExpectedSingleBronzeIdentity,
  getMatchLoser,
  selectCategoryMedalists,
  selectDualBronzeMedalists,
  selectSingleBronzeMedalists,
} from "../src/domain/bronzeMedalSelection.js";
import {
  cloneFixture,
  createLegacyAutoAdvanceFixture,
  createSingleBronzeAuxiliary,
  dualFixtures,
  patchMainMatch,
  singleFixture,
  withAuxiliary,
  wkfFixture,
} from "./fixtures/bronzeMedalSelectionFixtures.mjs";

let cases = 0;
let assertions = 0;
const check = (value, message) => { assertions += 1; assert.ok(value, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.deepEqual(actual, expected, message); };
const is = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };
async function test(name, operation) {
  cases += 1;
  try { await operation(); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

const id = (athlete) => athlete?.id ?? null;
function legacyReference(bracket) {
  const final = bracket.matches.find((match) => match.nextMatchId === null && match.round > 0);
  if (!final?.winner) return null;
  const loser = (match) => id(match.winner) === id(match.athlete1) ? match.athlete2 : id(match.winner) === id(match.athlete2) ? match.athlete1 : null;
  const gold = final.winner;
  const silver = loser(final);
  const semiRound = bracket.numRounds - 1;
  const semis = bracket.matches.filter((match) => match.round === semiRound && !match.isBye);
  const bronzes = semis.map(loser).filter(Boolean);
  if (bronzes.length < 2 && semiRound > 1) {
    const quarterFinals = bracket.matches.filter((match) => match.round === semiRound - 1 && !match.isBye && match.winner);
    const autoAdvance = semis.filter((match) => match.winner && (!match.athlete1 || !match.athlete2));
    const add = (candidate) => {
      const athlete = loser(candidate);
      if (athlete && ![gold, silver, ...bronzes].some((item) => id(item) === id(athlete))) bronzes.push(athlete);
    };
    for (const semi of autoAdvance) {
      const advanced = semi.winner || semi.athlete1 || semi.athlete2;
      const source = quarterFinals.find((match) => id(match.winner) === id(advanced));
      if (source) add(source);
    }
    for (const quarterFinal of quarterFinals) {
      if (bronzes.length >= 2) break;
      add(quarterFinal);
    }
  }
  return [gold, silver, bronzes[0] || null, bronzes[1] || null].map(id);
}

for (const [name, fixture] of Object.entries(dualFixtures)) {
  await test(`DUAL ${name} matches legacy`, () => {
    const result = selectCategoryMedalists(fixture);
    is(result.status, MEDAL_SELECTION_STATUSES.READY);
    equal(Object.values(result.medals).map(id), legacyReference(fixture.bracket));
  });
}

await test("missing bronze_mode resolves DUAL", () => {
  const result = selectCategoryMedalists(dualFixtures.eight);
  is(result.mode, BRONZE_MODES.DUAL_BRONZE);
  is(result.medals.bronze2.id, legacyReference(dualFixtures.eight.bracket)[3]);
});

await test("explicit DUAL resolves DUAL", () => {
  const fixture = cloneFixture(dualFixtures.four);
  fixture.category.bronze_mode = BRONZE_MODES.DUAL_BRONZE;
  is(selectCategoryMedalists(fixture).status, MEDAL_SELECTION_STATUSES.READY);
});

await test("legacy auto-advance fallback remains compatible", () => {
  const fixture = createLegacyAutoAdvanceFixture();
  const result = selectDualBronzeMedalists({ bracket: fixture.bracket });
  is(result.status, MEDAL_SELECTION_STATUSES.READY);
  equal(Object.values(result.medals).map(id), legacyReference(fixture.bracket));
});

await test("multiple finals are rejected", () => {
  const fixture = patchMainMatch(dualFixtures.eight, "main-r1-p0", { nextMatchId: null });
  is(selectCategoryMedalists(fixture).reason, "MULTIPLE_FINALS");
});

await test("missing final is rejected", () => {
  const fixture = patchMainMatch(dualFixtures.four, "main-r2-p0", { nextMatchId: "missing" });
  is(selectCategoryMedalists(fixture).reason, "FINAL_NOT_FOUND");
});

await test("invalid final winner is rejected", () => {
  const fixture = patchMainMatch(dualFixtures.four, "main-r2-p0", { winner: { id: "outsider" } });
  is(selectCategoryMedalists(fixture).status, MEDAL_SELECTION_STATUSES.INVALID_RESULT);
});

await test("missing final participant is rejected", () => {
  const fixture = patchMainMatch(dualFixtures.four, "main-r2-p0", { athlete2: null });
  is(selectCategoryMedalists(fixture).reason, "TWO_DISTINCT_PARTICIPANTS_REQUIRED");
});

await test("ambiguous semifinal set is rejected", () => {
  const fixture = patchMainMatch(dualFixtures.eight, "main-r1-p0", { round: 2 });
  is(selectCategoryMedalists(fixture).reason, "AMBIGUOUS_SEMIFINALS");
});

await test("invalid semifinal winner is rejected", () => {
  const fixture = patchMainMatch(dualFixtures.eight, "main-r2-p0", { winner: { id: "outsider" } });
  is(selectCategoryMedalists(fixture).reason, "WINNER_NOT_IN_MATCH");
});

await test("appealed final locks selection", () => {
  const fixture = patchMainMatch(dualFixtures.four, "main-r2-p0", { resultStatus: "UNDER_APPEAL" });
  is(selectCategoryMedalists(fixture).status, MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL);
});

await test("appealed semifinal locks selection", () => {
  const fixture = patchMainMatch(dualFixtures.four, "main-r1-p0", { resultStatus: "UNDER_APPEAL" });
  is(selectCategoryMedalists(fixture).status, MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL);
});

await test("getMatchLoser returns canonical participants", () => {
  const match = dualFixtures.four.bracket.matches[0];
  const result = getMatchLoser(match);
  is(result.winner, match.athlete1);
  is(result.loser, match.athlete2);
});

await test("getMatchLoser rejects duplicate participants", () => {
  const athlete = { id: "same" };
  is(getMatchLoser({ id: "x", athlete1: athlete, athlete2: athlete, winner: athlete }).status, MEDAL_SELECTION_STATUSES.INVALID_RESULT);
});

await test("expected B1 identity is deterministic", () => {
  equal(getExpectedSingleBronzeIdentity("cat"), getExpectedSingleBronzeIdentity("cat"));
  check(getExpectedSingleBronzeIdentity("cat").id.startsWith("aux_v1_"));
});

await test("categoryId is not trimmed", () => {
  check(getExpectedSingleBronzeIdentity(" cat ").generationKey.includes(" cat "));
  check(getExpectedSingleBronzeIdentity("cat").id !== getExpectedSingleBronzeIdentity(" cat ").id);
});

await test("exact B1 identity is found despite display code", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { matchCode: "DISPLAY-X" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [match] }).match, match);
});

await test("matchCode B1 alone is ignored", () => {
  const match = createSingleBronzeAuxiliary("other-category", { matchCode: "B1" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [match] }).match, null);
});

await test("matching id with wrong key is mismatch", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { generationKey: "wrong" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [match] }).status, MEDAL_SELECTION_STATUSES.SINGLE_BRONZE_IDENTITY_MISMATCH);
});

await test("matching key with wrong id is mismatch", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { id: "wrong" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [match] }).status, MEDAL_SELECTION_STATUSES.SINGLE_BRONZE_IDENTITY_MISMATCH);
});

await test("two exact identities are duplicate", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id);
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [match, cloneFixture(match)] }).status, MEDAL_SELECTION_STATUSES.DUPLICATE_SINGLE_BRONZE_IDENTITY);
});

await test("two partial identities are duplicate", () => {
  const one = createSingleBronzeAuxiliary(singleFixture.category.id, { generationKey: "wrong" });
  const two = createSingleBronzeAuxiliary(singleFixture.category.id, { id: "wrong" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [one, two] }).status, MEDAL_SELECTION_STATUSES.DUPLICATE_SINGLE_BRONZE_IDENTITY);
});

await test("exact plus partial identity is duplicate", () => {
  const exact = createSingleBronzeAuxiliary(singleFixture.category.id);
  const partial = createSingleBronzeAuxiliary(singleFixture.category.id, { id: "wrong" });
  is(findSingleBronzeMatch({ categoryId: singleFixture.category.id, auxiliaryMatches: [exact, partial] }).status, MEDAL_SELECTION_STATUSES.DUPLICATE_SINGLE_BRONZE_IDENTITY);
});

await test("SINGLE without B1 is not ready", () => {
  is(selectCategoryMedalists(singleFixture).status, MEDAL_SELECTION_STATUSES.NOT_READY);
});

await test("SINGLE pending B1 is not ready", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { winner: null, resultStatus: null });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.NOT_READY);
});

await test("suspended B1 is not ready", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { operationalStatus: "SUSPENDED_SOURCE_INCOMPLETE" });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.NOT_READY);
});

await test("appealed B1 locks selection", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { resultStatus: "UNDER_APPEAL" });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL);
});

await test("valid B1 winner works without resultStatus", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { resultStatus: undefined });
  const result = selectCategoryMedalists(withAuxiliary(singleFixture, [match]));
  is(result.status, MEDAL_SELECTION_STATUSES.READY);
  is(result.medals.bronze1.id, match.winner.id);
  is(result.medals.bronze2, null);
});

await test("appealed pending B1 still locks selection", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { resultStatus: "UNDER_APPEAL", winner: null });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL);
});

await test("valid second-slot B1 winner is selected", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id);
  match.winner = match.athlete2;
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).medals.bronze1.id, match.athlete2.id);
});

await test("invalid B1 winner is rejected without score inference", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { winner: { id: "outsider" }, score1: 99, score2: 0 });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.INVALID_RESULT);
});

await test("B1 missing participant is invalid", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id, { athlete2: null });
  is(selectCategoryMedalists(withAuxiliary(singleFixture, [match])).status, MEDAL_SELECTION_STATUSES.INVALID_RESULT);
});

await test("WKF without repechage plan is not ready", () => {
  const result = selectCategoryMedalists(wkfFixture);
  is(result.status, MEDAL_SELECTION_STATUSES.NOT_READY);
  is(result.side, "A");
});

await test("WKF ignores unrelated auxiliary display records", () => {
  const fixture = withAuxiliary(wkfFixture, [{ resultStatus: "UNDER_APPEAL", matchCode: "RA1" }]);
  is(selectCategoryMedalists(fixture).status, MEDAL_SELECTION_STATUSES.NOT_READY);
});

await test("invalid mode does not throw", () => {
  const fixture = cloneFixture(dualFixtures.four);
  fixture.category.bronze_mode = "repechage";
  is(selectCategoryMedalists(fixture).reason, "INVALID_BRONZE_MODE");
});

await test("selectors do not mutate DUAL input", () => {
  const fixture = cloneFixture(dualFixtures.thirtyTwo);
  const before = cloneFixture(fixture);
  selectCategoryMedalists(fixture);
  equal(fixture, before);
});

await test("selectors do not mutate SINGLE input", () => {
  const match = createSingleBronzeAuxiliary(singleFixture.category.id);
  const fixture = withAuxiliary(singleFixture, [match]);
  const before = cloneFixture(fixture);
  selectCategoryMedalists(fixture);
  equal(fixture, before);
});

await test("selector does not add auxiliaryMatches", () => {
  const fixture = cloneFixture(dualFixtures.eight);
  selectCategoryMedalists(fixture);
  check(!Object.hasOwn(fixture.bracket, "auxiliaryMatches"));
});

await test("selector does not change main match IDs or codes", () => {
  const fixture = cloneFixture(dualFixtures.sixteen);
  const before = fixture.bracket.matches.map(({ id: matchId, matchCode }) => [matchId, matchCode]);
  selectCategoryMedalists(fixture);
  equal(fixture.bracket.matches.map(({ id: matchId, matchCode }) => [matchId, matchCode]), before);
});

await test("important functions are exported", async () => {
  const module = await import("../src/domain/bronzeMedalSelection.js");
  for (const name of ["MEDAL_SELECTION_STATUSES", "selectCategoryMedalists", "selectDualBronzeMedalists", "selectSingleBronzeMedalists", "getExpectedSingleBronzeIdentity", "findSingleBronzeMatch", "getMatchLoser"]) check(name in module, `${name} must be exported`);
});

await test("domain module contains no forbidden integration APIs", async () => {
  const source = await readFile(new URL("../src/domain/bronzeMedalSelection.js", import.meta.url), "utf8");
  for (const token of ["localStorage", "electronAPI", "fetch(", "axios", "XMLHttpRequest", "Math.random", "Date.now", "Buffer", "node:crypto"]) check(!source.includes(token), `forbidden token ${token}`);
});

console.log(`Bronze medal selection Step 3.1 tests passed: ${cases} cases, ${assertions} assertions.`);
