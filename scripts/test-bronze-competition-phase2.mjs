import assert from "node:assert/strict";
import { BRONZE_MODES } from "../src/domain/bronzeMode.js";
import {
  AUXILIARY_STAGE_TYPES,
  ELIGIBILITY_DECISIONS,
  OUTCOME_TYPES,
  RESULT_STATUSES,
  SLOT_SOURCE_TYPES,
  collectLossesToFinalist,
  createGenerationKey,
  createRepechageBranchPlan,
  createSingleBronzePlan,
  createStableAuxiliaryId,
  createWkfRepechagePlan,
  decodeStableAuxiliaryId,
  detectAuxiliaryConflict,
  detectOutcomeSignals,
  evaluateLoserEligibility,
  findFinalMatch,
  findSemiFinalMatches,
  getValidMatchOutcome,
  isAuxiliaryMatchCompleted,
  parseGenerationKey,
  reconcileAuxiliaryMatches,
  splitFinalistBranches,
  traceFinalistPath,
  validateEligibilityPolicy,
  validateMainBracketStructure,
  validateMatchParticipantStructure,
  validateSlotSource,
} from "../src/domain/bronzeCompetition.js";
import {
  asymmetricFinalistPathsFixture,
  createCompletedBracket,
  eightAthleteFixture,
  fourAthleteFixture,
  reverseMatchArray,
  sixAthleteByeFixture,
  sixteenAthleteFixture,
  snapshotFixture,
  tenAthleteByeFixture,
  thirtyTwoAthleteFixture,
  withAuxiliaryMatches,
  withMatchPatch,
} from "./fixtures/bronzeCompetitionFixtures.mjs";

let testCount = 0;
let assertionCount = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const equal = (...args) => { assertionCount += 1; return assert.equal(...args); };
const deepEqual = (...args) => { assertionCount += 1; return assert.deepEqual(...args); };
const match = (...args) => { assertionCount += 1; return assert.match(...args); };
const throws = (...args) => { assertionCount += 1; return assert.throws(...args); };
const ok = (...args) => { assertionCount += 1; return assert.ok(...args); };
const clone = (value) => JSON.parse(JSON.stringify(value));
const policy = { version: 1, withdrawal_during_match: "ELIGIBLE", forfeit: "INELIGIBLE" };

const realMatch = () => ({
  id: "outcome-main", isBye: false,
  athlete1: { id: "a", name: "A" }, athlete2: { id: "b", name: "B" },
  winner: { id: "a", name: "A" }, score1: 1, score2: 0,
});
const loss = (index, side = "A") => ({
  athlete: { id: `${side.toLowerCase()}-loss-${index}`, name: `Loss ${side}${index}` },
  sourceMatchId: `source-${side}-${index}`,
  round: index,
  position: index,
  eligibilityDecision: ELIGIBILITY_DECISIONS.ELIGIBLE,
  eligibilityReason: OUTCOME_TYPES.NORMAL,
  policyVersion: 1,
});

// Main bracket validation and structural lookup.
for (const [label, fixture] of [["4", fourAthleteFixture], ["8", eightAthleteFixture], ["16", sixteenAthleteFixture], ["32", thirtyTwoAthleteFixture]]) {
  test(`valid ${label}-athlete bracket`, () => equal(validateMainBracketStructure(fixture.bracket).ok, true));
}
test("find unique final", () => equal(findFinalMatch(eightAthleteFixture.bracket).match.nextMatchId, null));
test("find two semifinal feeders", () => {
  const result = findSemiFinalMatches(eightAthleteFixture.bracket);
  equal(result.ok, true); equal(result.sideA.nextMatchId, result.sideB.nextMatchId);
});
test("side A uses smaller feeder position", () => {
  const result = findSemiFinalMatches(eightAthleteFixture.bracket);
  ok(result.sideA.position < result.sideB.position);
});
test("array order is not a side fallback", () => {
  const result = findSemiFinalMatches(reverseMatchArray(eightAthleteFixture).bracket);
  equal(result.sideA.position, 0); equal(result.sideB.position, 1);
});
test("matchCode changes do not affect structure", () => {
  const fixture = clone(eightAthleteFixture); fixture.bracket.matches.forEach((m) => { m.matchCode = `X-${m.id}`; });
  equal(validateMainBracketStructure(fixture.bracket).ok, true);
});
test("duplicate main ID rejected", () => {
  const fixture = clone(eightAthleteFixture); fixture.bracket.matches[1].id = fixture.bracket.matches[0].id;
  equal(validateMainBracketStructure(fixture.bracket).status, "INVALID_BRACKET_STRUCTURE");
});
test("missing main ID rejected", () => {
  const fixture = clone(eightAthleteFixture); delete fixture.bracket.matches[0].id;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "MISSING_MAIN_MATCH_ID"));
});
test("invalid next reference rejected", () => {
  const fixture = clone(eightAthleteFixture); fixture.bracket.matches[0].nextMatchId = "missing";
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "INVALID_NEXT_MATCH_REFERENCE"));
});
test("cycle rejected", () => {
  const fixture = clone(eightAthleteFixture); const final = fixture.bracket.matches.find((m) => m.nextMatchId === null); final.nextMatchId = fixture.bracket.matches[0].id;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "BRACKET_CYCLE"));
});
test("multiple finals rejected", () => {
  const fixture = clone(eightAthleteFixture); fixture.bracket.matches[0].nextMatchId = null;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "MULTIPLE_FINALS"));
});
test("one final feeder rejected", () => {
  const fixture = clone(eightAthleteFixture); const final = fixture.bracket.matches.find((m) => m.nextMatchId === null); const feeders = fixture.bracket.matches.filter((m) => m.nextMatchId === final.id); feeders[0].nextMatchId = feeders[1].id;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "INVALID_FINAL_FEEDER_COUNT"));
});
test("missing feeder position rejected", () => {
  const fixture = clone(eightAthleteFixture); const final = fixture.bracket.matches.find((m) => m.nextMatchId === null); delete fixture.bracket.matches.find((m) => m.nextMatchId === final.id).position;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "MISSING_FEEDER_POSITION"));
});
test("duplicate feeder position rejected", () => {
  const fixture = clone(eightAthleteFixture); const final = fixture.bracket.matches.find((m) => m.nextMatchId === null); const feeders = fixture.bracket.matches.filter((m) => m.nextMatchId === final.id); feeders[1].position = feeders[0].position;
  ok(validateMainBracketStructure(fixture.bracket).errors.some((e) => e.code === "DUPLICATE_FEEDER_POSITION"));
});

// BYE and participant structure.
test("valid BYE has one participant and winner", () => {
  const bye = sixAthleteByeFixture.bracket.matches.find((m) => m.isBye);
  equal(validateMatchParticipantStructure(bye).type, "VALID_BYE");
});
test("BYE with two participants rejected", () => {
  const m = realMatch(); m.isBye = true;
  equal(validateMatchParticipantStructure(m).status, "INVALID_BYE_STRUCTURE");
});
test("BYE without participants rejected", () => {
  const m = { id: "bye-empty", isBye: true, athlete1: null, athlete2: null, winner: null };
  equal(validateMatchParticipantStructure(m).status, "INVALID_BYE_STRUCTURE");
});
test("BYE with invalid winner rejected", () => {
  const m = { id: "bye-winner", isBye: true, athlete1: { id: "a" }, athlete2: null, winner: { id: "b" } };
  equal(validateMatchParticipantStructure(m).status, "INVALID_BYE_STRUCTURE");
});
test("non-BYE missing athlete1 rejected", () => {
  const m = realMatch(); m.athlete1 = null;
  equal(validateMatchParticipantStructure(m).status, "INVALID_PARTICIPANT_STRUCTURE");
});
test("non-BYE missing athlete2 rejected", () => {
  const m = realMatch(); m.athlete2 = null;
  equal(validateMatchParticipantStructure(m).status, "INVALID_PARTICIPANT_STRUCTURE");
});
test("uncertain missing participant needs verification", () => {
  const m = realMatch(); m.athlete2 = null; m.metadataIncomplete = true;
  equal(validateMatchParticipantStructure(m).status, "NEEDS_VERIFICATION");
});
test("BYE outcome has no loser", () => {
  const bye = sixAthleteByeFixture.bracket.matches.find((m) => m.isBye);
  equal(getValidMatchOutcome(bye).loser, null);
});

// Generation keys, stable IDs and source validation.
test("generation key stable", () => {
  const input = { categoryId: "cat|opaque", mode: BRONZE_MODES.WKF_REPECHAGE, side: "A", sequence: 1 };
  equal(createGenerationKey(input), createGenerationKey(input));
});
test("stable ID stable", () => {
  const key = createGenerationKey({ categoryId: "cat", mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 });
  equal(createStableAuxiliaryId(key), createStableAuxiliaryId(key));
});
test("stable ID round trip", () => {
  const key = createGenerationKey({ categoryId: "cát|猫", mode: BRONZE_MODES.WKF_REPECHAGE, side: "B", sequence: 2 });
  equal(decodeStableAuxiliaryId(createStableAuxiliaryId(key)), key);
});
test("stable ID works without Buffer", () => {
  const original = globalThis.Buffer; globalThis.Buffer = undefined;
  try { match(createStableAuxiliaryId(createGenerationKey({ categoryId: "browser", mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 })), /^aux_v1_/); }
  finally { globalThis.Buffer = original; }
});
test("different categories create different IDs", () => {
  const make = (categoryId) => createStableAuxiliaryId(createGenerationKey({ categoryId, mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 }));
  ok(make("cat-a") !== make("cat-b"));
});
test("Unicode-distinct opaque IDs remain distinct", () => {
  const make = (categoryId) => createStableAuxiliaryId(createGenerationKey({ categoryId, mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 }));
  ok(make("é") !== make("e\u0301"));
});
test("delimiter cannot collide", () => {
  const left = createGenerationKey({ categoryId: "a|b", mode: BRONZE_MODES.WKF_REPECHAGE, side: "A", sequence: 1 });
  const right = createGenerationKey({ categoryId: "a", mode: BRONZE_MODES.WKF_REPECHAGE, side: "A", sequence: 1 });
  ok(left !== right);
});
test("empty category rejected", () => throws(() => createGenerationKey({ categoryId: "", mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 })));
test("invalid mode rejected", () => throws(() => createGenerationKey({ categoryId: "cat", mode: "BAD", side: null, sequence: 1 })));
test("invalid side rejected", () => throws(() => createGenerationKey({ categoryId: "cat", mode: BRONZE_MODES.WKF_REPECHAGE, side: "NONE", sequence: 1 })));
test("invalid sequence rejected", () => throws(() => createGenerationKey({ categoryId: "cat", mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 0 })));
test("invalid generation version rejected", () => throws(() => parseGenerationKey(JSON.stringify(["auxiliary-match", 2, "cat", BRONZE_MODES.SINGLE_BRONZE, "NONE", 1]))));
test("loser source valid", () => equal(validateSlotSource({ type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: "m" }).ok, true));
test("aux winner source valid", () => equal(validateSlotSource({ type: SLOT_SOURCE_TYPES.WINNER_OF_AUXILIARY_MATCH, matchId: "a" }).ok, true));
test("source missing match rejected", () => equal(validateSlotSource({ type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH }).ok, false));
test("direct source requires athlete", () => equal(validateSlotSource({ type: SLOT_SOURCE_TYPES.DIRECT_ATHLETE }).ok, false));
test("source with match and athlete rejected", () => equal(validateSlotSource({ type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: "m", athleteId: "a" }).ok, false));

// Outcomes and eligibility policy.
test("missing outcomeType defaults to NORMAL", () => equal(getValidMatchOutcome(realMatch()).outcomeType, OUTCOME_TYPES.NORMAL));
test("score does not imply abnormal outcome", () => {
  const m = realMatch(); m.score1 = 99; m.score2 = 0;
  equal(detectOutcomeSignals(m).abnormalSignals.length, 0);
});
test("winner outside match rejected", () => {
  const m = realMatch(); m.winner = { id: "other" };
  equal(getValidMatchOutcome(m).status, "INVALID_RESULT");
});
test("unclassified disqualification needs verification", () => {
  const m = realMatch(); m.disqualification = true;
  equal(getValidMatchOutcome(m).status, "NEEDS_VERIFICATION");
});
test("unclassified walkover needs verification", () => {
  const m = realMatch(); m.walkover = true;
  equal(getValidMatchOutcome(m).status, "NEEDS_VERIFICATION");
});
test("no-show is ineligible", () => {
  const m = realMatch(); m.noShowBeforeMatch = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy }).decision, ELIGIBILITY_DECISIONS.INELIGIBLE);
});
test("tournament disqualification is ineligible", () => {
  const m = realMatch(); m.tournamentDisqualification = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy }).decision, ELIGIBILITY_DECISIONS.INELIGIBLE);
});
test("withdrawal policy can allow", () => {
  const m = realMatch(); m.withdrawalDuringMatch = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy }).decision, ELIGIBILITY_DECISIONS.ELIGIBLE);
});
test("withdrawal policy can deny", () => {
  const m = realMatch(); m.withdrawalDuringMatch = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy: { ...policy, withdrawal_during_match: "INELIGIBLE" } }).decision, ELIGIBILITY_DECISIONS.INELIGIBLE);
});
test("withdrawal missing policy needs verification", () => {
  const m = realMatch(); m.withdrawalDuringMatch = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy: { version: 1 } }).decision, ELIGIBILITY_DECISIONS.NEEDS_VERIFICATION);
});
test("forfeit policy can allow", () => {
  const m = realMatch(); m.forfeit = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy: { ...policy, forfeit: "ELIGIBLE" } }).decision, ELIGIBILITY_DECISIONS.ELIGIBLE);
});
test("forfeit policy can deny", () => {
  const m = realMatch(); m.forfeit = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy }).decision, ELIGIBILITY_DECISIONS.INELIGIBLE);
});
test("forfeit missing policy needs verification", () => {
  const m = realMatch(); m.forfeit = true;
  equal(evaluateLoserEligibility({ match: m, loser: m.athlete2, policy: { version: 1 } }).decision, ELIGIBILITY_DECISIONS.NEEDS_VERIFICATION);
});
test("invalid policy enum rejected", () => equal(validateEligibilityPolicy({ version: 1, forfeit: "MAYBE" }).ok, false));
test("UNDER_APPEAL blocks outcome", () => {
  const m = realMatch(); m.resultStatus = RESULT_STATUSES.UNDER_APPEAL;
  equal(getValidMatchOutcome(m).status, "UNDER_APPEAL");
});

// Generalized branch plans.
test("zero losses is insufficient", () => equal(createRepechageBranchPlan({ categoryId: "c", side: "A", eligibleLosses: [], policyVersion: 1 }).status, "INSUFFICIENT_REPECHAGE_PARTICIPANTS"));
test("one loss is direct bronze", () => {
  const result = createRepechageBranchPlan({ categoryId: "c", side: "A", eligibleLosses: [loss(1)], policyVersion: 1 });
  equal(result.status, "DIRECT_BRONZE"); equal(result.desiredMatches.length, 0); equal(result.directBronzeAthlete.sourceMatchId, "source-A-1");
});
for (const count of [2, 3, 4]) {
  test(`${count} losses create ${count - 1} matches`, () => {
    const result = createRepechageBranchPlan({ categoryId: `c-${count}`, side: "A", eligibleLosses: Array.from({ length: count }, (_, i) => loss(i + 1)), policyVersion: 1 });
    equal(result.desiredMatches.length, count - 1);
  });
}
test("first repechage match has two main loser sources", () => {
  const result = createRepechageBranchPlan({ categoryId: "c", side: "A", eligibleLosses: [loss(1), loss(2), loss(3)], policyVersion: 1 });
  equal(result.desiredMatches[0].athlete1Source.type, SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH); equal(result.desiredMatches[0].athlete2Source.type, SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH);
});
test("later match uses prior auxiliary winner", () => {
  const result = createRepechageBranchPlan({ categoryId: "c", side: "B", eligibleLosses: [loss(1, "B"), loss(2, "B"), loss(3, "B")], policyVersion: 1 });
  equal(result.desiredMatches[1].athlete1Source.type, SLOT_SOURCE_TYPES.WINNER_OF_AUXILIARY_MATCH); equal(result.desiredMatches[1].athlete1Source.matchId, result.desiredMatches[0].id);
});
test("plans never use DIRECT_ATHLETE", () => {
  const result = createRepechageBranchPlan({ categoryId: "c", side: "A", eligibleLosses: [loss(1), loss(2), loss(3), loss(4)], policyVersion: 1 });
  equal(JSON.stringify(result).includes(SLOT_SOURCE_TYPES.DIRECT_ATHLETE), false);
});

// SINGLE and WKF plans across fixture sizes.
test("SINGLE creates exactly B1", () => {
  const plan = createSingleBronzePlan({ categoryId: fourAthleteFixture.categoryId, bracket: fourAthleteFixture.bracket });
  equal(plan.desiredMatches.length, 1); equal(plan.desiredMatches[0].matchCode, "B1"); equal(plan.desiredMatches[0].stageType, AUXILIARY_STAGE_TYPES.BRONZE);
});
test("SINGLE B1 sources are semifinal losers", () => {
  const plan = createSingleBronzePlan({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket });
  equal(plan.desiredMatches[0].athlete1Source.type, SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH); equal(plan.desiredMatches[0].athlete2Source.type, SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH);
});
test("SINGLE deterministic independent plans", () => {
  deepEqual(createSingleBronzePlan({ categoryId: "same", bracket: eightAthleteFixture.bracket }), createSingleBronzePlan({ categoryId: "same", bracket: eightAthleteFixture.bracket }));
});
for (const [size, fixture, expectedPerSide] of [[4, fourAthleteFixture, 0], [8, eightAthleteFixture, 1], [16, sixteenAthleteFixture, 2], [32, thirtyTwoAthleteFixture, 3]]) {
  test(`WKF ${size} slots has expected branch match count`, () => {
    const plan = createWkfRepechagePlan({ categoryId: fixture.categoryId, bracket: fixture.bracket, policy });
    equal(plan.ok, true); equal(plan.branches.A.desiredMatches.length, expectedPerSide); equal(plan.branches.B.desiredMatches.length, expectedPerSide);
  });
}
test("four-person WKF awards two direct bronzes", () => {
  const plan = createWkfRepechagePlan({ categoryId: fourAthleteFixture.categoryId, bracket: fourAthleteFixture.bracket, policy });
  equal(plan.directBronzeAthletes.length, 2); equal(plan.desiredMatches.length, 0);
});
test("six-person BYEs exist in both halves", () => {
  const split = splitFinalistBranches(sixAthleteByeFixture.bracket);
  ok(split.branchA.path.matches.some((m) => m.isBye)); ok(split.branchB.path.matches.some((m) => m.isBye));
});
test("ten-person WKF excludes BYEs", () => {
  const plan = createWkfRepechagePlan({ categoryId: tenAthleteByeFixture.categoryId, bracket: tenAthleteByeFixture.bracket, policy });
  equal(plan.ok, true); equal(plan.desiredMatches.some((m) => m.athlete1Source.matchId === null || m.athlete2Source.matchId === null), false);
});
test("asymmetric finalists have different real path lengths", () => {
  const split = splitFinalistBranches(asymmetricFinalistPathsFixture.bracket);
  const realA = split.branchA.path.matches.filter((m) => !m.isBye).length; const realB = split.branchB.path.matches.filter((m) => !m.isBye).length;
  ok(realA !== realB);
});
test("non-finalist loser is not selected", () => {
  const plan = createWkfRepechagePlan({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, policy });
  const selected = new Set(plan.desiredMatches.flatMap((m) => [m.athlete1?.id, m.athlete2?.id]).filter(Boolean));
  equal(selected.has("a4"), false);
});
test("WKF deterministic independent plans", () => {
  deepEqual(createWkfRepechagePlan({ categoryId: "same-wkf", bracket: sixteenAthleteFixture.bracket, policy }), createWkfRepechagePlan({ categoryId: "same-wkf", bracket: sixteenAthleteFixture.bracket, policy }));
});
test("unrelated appeal does not block WKF", () => {
  const fixture = withMatchPatch(eightAthleteFixture, "main-r1-p1", { resultStatus: "UNDER_APPEAL" });
  equal(createWkfRepechagePlan({ categoryId: fixture.categoryId, bracket: fixture.bracket, policy }).ok, true);
});
test("appeal on branch A blocks whole WKF", () => {
  const fixture = withMatchPatch(eightAthleteFixture, "main-r1-p0", { resultStatus: "UNDER_APPEAL" });
  const plan = createWkfRepechagePlan({ categoryId: fixture.categoryId, bracket: fixture.bracket, policy });
  equal(plan.status, "LOCKED_UNDER_APPEAL"); equal(Object.hasOwn(plan, "desiredMatches"), false); ok(plan.blockingSides.includes("A"));
});
test("appeal in semifinal blocks SINGLE", () => {
  const fixture = withMatchPatch(eightAthleteFixture, "main-r2-p0", { resultStatus: "UNDER_APPEAL" });
  const result = createSingleBronzePlan({ categoryId: fixture.categoryId, bracket: fixture.bracket });
  equal(result.status, "LOCKED_UNDER_APPEAL"); ok(result.blockingSides.includes("A"));
});

// Auxiliary completion and atomic reconciliation.
const eightPlan = createWkfRepechagePlan({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, policy });
test("aux winner without resultStatus is completed", () => {
  const m = { ...clone(eightPlan.desiredMatches[0]), winner: clone(eightPlan.desiredMatches[0].athlete1), resultStatus: null };
  equal(isAuxiliaryMatchCompleted(m).completed, true);
});
test("FINAL auxiliary without winner is completed", () => {
  const m = { ...clone(eightPlan.desiredMatches[0]), winner: null, resultStatus: "FINAL" };
  equal(isAuxiliaryMatchCompleted(m).completed, true);
});
test("FINAL auxiliary with invalid winner rejected", () => {
  const m = { ...clone(eightPlan.desiredMatches[0]), winner: { id: "invalid" }, resultStatus: "FINAL" };
  equal(isAuxiliaryMatchCompleted(m).status, "INVALID_AUXILIARY_RESULT");
});
test("UNDER_APPEAL auxiliary locked", () => {
  const m = { ...clone(eightPlan.desiredMatches[0]), resultStatus: "UNDER_APPEAL" };
  equal(isAuxiliaryMatchCompleted(m).status, "LOCKED_UNDER_APPEAL");
});
test("reconciliation rechecks appealed main dependencies", () => {
  const dependencyId = eightPlan.desiredMatches[0].sourceMatchIds[0];
  const fixture = withMatchPatch(eightAthleteFixture, dependencyId, { resultStatus: "UNDER_APPEAL" });
  const result = reconcileAuxiliaryMatches({ categoryId: fixture.categoryId, bracket: fixture.bracket, desiredPlan: eightPlan });
  equal(result.status, "LOCKED_UNDER_APPEAL"); equal(Object.hasOwn(result, "bracketCopy"), false); ok(result.blockingMatchIds.includes(dependencyId));
});
test("first reconciliation creates desired matches", () => {
  const result = reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, desiredPlan: eightPlan });
  equal(result.ok, true); equal(result.created.length, eightPlan.desiredMatches.length);
});
test("reconciliation does not mutate input", () => {
  const before = snapshotFixture(eightAthleteFixture);
  reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, desiredPlan: eightPlan });
  deepEqual(eightAthleteFixture, before);
});
test("reconciliation preserves main matches and M codes", () => {
  const result = reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, desiredPlan: eightPlan });
  deepEqual(result.bracketCopy.matches, eightAthleteFixture.bracket.matches);
});
test("second reconciliation is idempotent", () => {
  const first = reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: eightAthleteFixture.bracket, desiredPlan: eightPlan });
  const second = reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: first.bracketCopy, desiredPlan: eightPlan });
  equal(second.status, "UNCHANGED"); deepEqual(second.bracketCopy, first.bracketCopy); equal(second.created.length, 0);
});
test("duplicate existing generation key rejected atomically", () => {
  const duplicate = [eightPlan.desiredMatches[0], clone(eightPlan.desiredMatches[0])];
  const fixture = withAuxiliaryMatches(eightAthleteFixture, duplicate);
  const result = reconcileAuxiliaryMatches({ categoryId: fixture.categoryId, bracket: fixture.bracket, desiredPlan: eightPlan });
  equal(result.status, "DUPLICATE_GENERATION_KEY"); equal(Object.hasOwn(result, "bracketCopy"), false);
});
test("completed dependency change conflicts atomically", () => {
  const current = clone(eightPlan.desiredMatches[0]); current.winner = clone(current.athlete1);
  const fixture = withAuxiliaryMatches(eightAthleteFixture, [current]);
  const changed = clone(eightPlan); changed.desiredMatches[0].sourceMatchIds.push("changed-source");
  const result = reconcileAuxiliaryMatches({ categoryId: fixture.categoryId, bracket: fixture.bracket, desiredPlan: changed });
  equal(result.status, "CONFLICT_COMPLETED_AUXILIARY_MATCH"); equal(Object.hasOwn(result, "bracketCopy"), false); equal(current.winner.id, fixture.bracket.auxiliaryMatches[0].winner.id);
});
test("unfinished auxiliary can update", () => {
  const current = clone(eightPlan.desiredMatches[0]); current.athlete2 = { id: "old", name: "Old" };
  const fixture = withAuxiliaryMatches(eightAthleteFixture, [current]);
  const result = reconcileAuxiliaryMatches({ categoryId: fixture.categoryId, bracket: fixture.bracket, desiredPlan: eightPlan });
  equal(result.ok, true); equal(result.updated.length, 1);
});
test("orphan auxiliary is reported and retained", () => {
  const orphan = clone(eightPlan.desiredMatches[0]); orphan.generationKey = createGenerationKey({ categoryId: fixtureCategory(), mode: BRONZE_MODES.WKF_REPECHAGE, side: "A", sequence: 9 }); orphan.id = createStableAuxiliaryId(orphan.generationKey);
  const fixture = withAuxiliaryMatches(eightAthleteFixture, [orphan]);
  const result = reconcileAuxiliaryMatches({ categoryId: eightAthleteFixture.categoryId, bracket: fixture.bracket, desiredPlan: eightPlan });
  equal(result.orphaned.length, 1); ok(result.bracketCopy.auxiliaryMatches.some((m) => m.id === orphan.id));
});
function fixtureCategory() { return eightAthleteFixture.categoryId; }
test("aux conflict helper detects completed change", () => {
  const existing = clone(eightPlan.desiredMatches[0]); existing.winner = clone(existing.athlete1);
  const desired = clone(existing); desired.athlete2 = { id: "new" }; desired.winner = null;
  equal(detectAuxiliaryConflict(existing, desired).status, "CONFLICT_COMPLETED_AUXILIARY_MATCH");
});
test("collect losses does not mutate finalist path", () => {
  const split = splitFinalistBranches(eightAthleteFixture.bracket); const before = clone(split.branchA.path);
  collectLossesToFinalist({ finalistPath: split.branchA.path, policy });
  deepEqual(split.branchA.path, before);
});
test("trace finalist path exported and deterministic", () => {
  const split = splitFinalistBranches(eightAthleteFixture.bracket);
  const traced = traceFinalistPath({ validatedBracket: split.validated, finalist: split.branchA.finalist, semiFinalMatch: split.branchA.semiFinalMatch, finalMatch: split.finalMatch });
  deepEqual(traced.matches.map((m) => m.id), split.branchA.path.matches.map((m) => m.id));
});

for (const { name, fn } of tests) {
  try { fn(); testCount += 1; }
  catch (error) { console.error(`FAILED: ${name}`); throw error; }
}

assert.ok(testCount >= 64, `Expected at least 64 test cases, got ${testCount}`);
assertionCount += 1;
console.log(`Bronze competition Phase 2 tests passed: ${testCount} cases, ${assertionCount} assertions.`);
