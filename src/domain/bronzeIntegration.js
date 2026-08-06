import { BRONZE_MODES, resolveBronzeMode, validateBronzeMode } from "./bronzeMode.js";
import {
  createSingleBronzePlan,
  createWkfRepechagePlan,
  isAuxiliaryMatchCompleted,
  reconcileAuxiliaryMatches,
} from "./bronzeCompetition.js";
import { findSingleBronzeMatch, selectCategoryMedalists } from "./bronzeMedalSelection.js";

export const BRONZE_MODE_CHANGE_STATUSES = Object.freeze({
  NO_CHANGE: "NO_CHANGE",
  ALLOWED_NO_BRACKET: "ALLOWED_NO_BRACKET",
  CONFIRM_BRACKET_EXISTS: "CONFIRM_BRACKET_EXISTS",
  BLOCKED_REAL_MATCH_RESULT: "BLOCKED_REAL_MATCH_RESULT",
  BLOCKED_UNDER_APPEAL: "BLOCKED_UNDER_APPEAL",
  BLOCKED_COMPLETED_AUXILIARY_MATCH: "BLOCKED_COMPLETED_AUXILIARY_MATCH",
  BLOCKED_MEANINGFUL_CATEGORY_RESULTS: "BLOCKED_MEANINGFUL_CATEGORY_RESULTS",
  BLOCKED_FEATURE_DISABLED: "BLOCKED_FEATURE_DISABLED",
  UNSUPPORTED_MODE: "UNSUPPORTED_MODE",
  INVALID_MODE: "INVALID_MODE",
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const athleteId = (athlete) => typeof athlete?.id === "string" && athlete.id ? athlete.id : null;
const sameAthlete = (left, right) => athleteId(left) !== null && athleteId(left) === athleteId(right);
const fail = (status, details = {}) => ({ ok: false, status, ...details });

export function isSingleBronzeCoreEnabled() {
  return true;
}

export function hasMeaningfulCategoryResults(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulCategoryResults);
  return Object.values(value).some(hasMeaningfulCategoryResults);
}

export function hasRealMatchResult(bracket) {
  return (bracket?.matches || []).some((match) => {
    if (match?.isBye === true || !athleteId(match?.athlete1) || !athleteId(match?.athlete2)) return false;
    return Boolean(match.winner || match.resultStatus === "FINAL" || match.finalDecision === true || match.decisionStatus === "FINAL");
  });
}

export function guardBronzeModeChange({ category, requestedMode, categoryResults, singleEnabled = false }) {
  let currentMode;
  try {
    currentMode = resolveBronzeMode(category);
    validateBronzeMode(requestedMode);
  } catch (error) {
    return fail(BRONZE_MODE_CHANGE_STATUSES.INVALID_MODE, { message: error.message });
  }
  if (requestedMode === currentMode) return { ok: true, status: BRONZE_MODE_CHANGE_STATUSES.NO_CHANGE };
  if (requestedMode === BRONZE_MODES.SINGLE_BRONZE && !singleEnabled) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_FEATURE_DISABLED);
  const bracket = category?.bracket;
  if (!bracket) return { ok: true, status: BRONZE_MODE_CHANGE_STATUSES.ALLOWED_NO_BRACKET };
  const appealed = [...(bracket.matches || []), ...(bracket.auxiliaryMatches || [])].filter((match) => match?.resultStatus === "UNDER_APPEAL");
  if (appealed.length) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_UNDER_APPEAL, { blockingMatchIds: appealed.map((match) => match.id) });
  for (const match of bracket.auxiliaryMatches || []) {
    const completed = isAuxiliaryMatchCompleted(match);
    if (!completed.ok) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_UNDER_APPEAL, { blockingMatchIds: [match.id] });
    if (completed.completed) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_COMPLETED_AUXILIARY_MATCH, { blockingMatchIds: [match.id] });
  }
  if (hasMeaningfulCategoryResults(categoryResults)) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_MEANINGFUL_CATEGORY_RESULTS);
  if (hasRealMatchResult(bracket)) return fail(BRONZE_MODE_CHANGE_STATUSES.BLOCKED_REAL_MATCH_RESULT);
  return { ok: true, status: BRONZE_MODE_CHANGE_STATUSES.CONFIRM_BRACKET_EXISTS };
}

function suspendExistingSingleBronze(categoryId, bracket, reason) {
  const copy = clone(bracket);
  const located = findSingleBronzeMatch({ categoryId, auxiliaryMatches: copy.auxiliaryMatches });
  if (!located.ok) return located;
  if (!located.match) return { ok: true, status: "WAITING_FOR_SEMIFINALS", bracketCopy: copy };
  const completed = isAuxiliaryMatchCompleted(located.match);
  if (!completed.ok || completed.completed) return fail(completed.status || "CONFLICT_COMPLETED_AUXILIARY_MATCH", { conflicts: [located.match.id] });
  located.match.operationalStatus = "SUSPENDED_SOURCE_INCOMPLETE";
  located.match.suspensionReason = reason;
  return { ok: true, status: "SUSPENDED_SOURCE_INCOMPLETE", bracketCopy: copy };
}

function hydrateAuxiliaryDependencies(bracket) {
  const copy = clone(bracket);
  const matches = copy.auxiliaryMatches || [];
  const byId = new Map(matches.map((match) => [match.id, match]));
  [...matches].sort((a, b) => Number(a.sequence) - Number(b.sequence)).forEach((match) => {
    for (const slot of [1, 2]) {
      const source = match[`athlete${slot}Source`];
      if (source?.type === "WINNER_OF_AUXILIARY_MATCH") {
        match[`athlete${slot}`] = byId.get(source.matchId)?.winner || null;
      }
    }
    const ready = athleteId(match.athlete1) && athleteId(match.athlete2);
    if (!match.winner) {
      match.operationalStatus = ready ? "READY" : "SUSPENDED_SOURCE_INCOMPLETE";
      match.suspensionReason = ready ? null : "AUXILIARY_SOURCE_INCOMPLETE";
    }
  });
  return copy;
}

function suspendExistingWkf(bracket) {
  const copy = clone(bracket);
  for (const match of copy.auxiliaryMatches || []) {
    const completed = isAuxiliaryMatchCompleted(match);
    if (!completed.ok || completed.completed) return fail(completed.status || "CONFLICT_COMPLETED_AUXILIARY_MATCH", { conflicts: [match.id] });
    match.operationalStatus = "SUSPENDED_SOURCE_INCOMPLETE";
    match.suspensionReason = "MAIN_SOURCE_INCOMPLETE";
  }
  return { ok: true, status: "WAITING_FOR_REPECHAGE_SOURCES", bracketCopy: copy };
}

export function reconcileBronzeAfterMainBracketChange({ category, candidateBracket, singleEnabled }) {
  const mode = resolveBronzeMode(category);
  if (mode === BRONZE_MODES.DUAL_BRONZE) return { ok: true, status: "DUAL_UNCHANGED", bracketCopy: clone(candidateBracket) };
  if (mode === BRONZE_MODES.WKF_REPECHAGE) {
    const plan = createWkfRepechagePlan({
      categoryId: category.id,
      bracket: candidateBracket,
      policy: category.eligibilityPolicy || { version: 1 },
    });
    if (!plan.ok) {
      if (["LOCKED_UNDER_APPEAL", "INVALID_BRACKET_STRUCTURE"].includes(plan.status)) return fail(plan.status, { diagnostics: plan });
      return suspendExistingWkf(candidateBracket);
    }
    const reconciled = reconcileAuxiliaryMatches({ categoryId: category.id, bracket: candidateBracket, desiredPlan: plan });
    if (!reconciled.ok) return reconciled;
    let bracketCopy = clone(reconciled.bracketCopy);
    bracketCopy.directBronzeAthletes = clone(plan.directBronzeAthletes || []);
    bracketCopy = hydrateAuxiliaryDependencies(bracketCopy);
    return { ...reconciled, bracketCopy };
  }
  if (mode !== BRONZE_MODES.SINGLE_BRONZE) return fail("UNSUPPORTED_MODE");
  if (!singleEnabled) return fail("SINGLE_BRONZE_FEATURE_DISABLED");
  const plan = createSingleBronzePlan({ categoryId: category.id, bracket: candidateBracket });
  if (!plan.ok) {
    if (plan.status === "LOCKED_UNDER_APPEAL" || plan.status === "INVALID_BRACKET_STRUCTURE") return fail(plan.status, { diagnostics: plan });
    if (["NOT_READY", "INVALID_RESULT", "INVALID_PARTICIPANT_STRUCTURE"].includes(plan.status)) {
      return suspendExistingSingleBronze(category.id, candidateBracket, "SEMIFINAL_RESULT_MISSING");
    }
    return fail(plan.status, { diagnostics: plan });
  }
  const reconciled = reconcileAuxiliaryMatches({ categoryId: category.id, bracket: candidateBracket, desiredPlan: plan });
  if (!reconciled.ok) return reconciled;
  const bracketCopy = clone(reconciled.bracketCopy);
  bracketCopy.auxiliaryMatches = bracketCopy.auxiliaryMatches.map((match) => match.generationKey === plan.desiredMatches[0].generationKey
    ? { ...match, operationalStatus: "READY", suspensionReason: null }
    : match);
  return { ...reconciled, bracketCopy };
}

export function updateAuxiliaryMatchResult({ bracket, matchId, winnerId, score1 = 0, score2 = 0, resultStatus = "FINAL" }) {
  const copy = clone(bracket);
  const matches = Array.isArray(copy?.auxiliaryMatches) ? copy.auxiliaryMatches : [];
  const index = matches.findIndex((match) => match.id === matchId);
  if (index < 0) return fail("AUXILIARY_MATCH_NOT_FOUND", { matchId });
  const match = matches[index];
  if (match.operationalStatus !== "READY") return fail("AUXILIARY_MATCH_NOT_READY", { matchId });
  if (match.resultStatus === "UNDER_APPEAL") return fail("LOCKED_UNDER_APPEAL", { matchId });
  if (!winnerId || (![match.athlete1, match.athlete2].some((athlete) => athleteId(athlete) === winnerId))) return fail("INVALID_AUXILIARY_WINNER", { matchId });
  const completed = isAuxiliaryMatchCompleted(match);
  if (!completed.ok) return completed;
  if (completed.completed) return fail("COMPLETED_AUXILIARY_RESET_BLOCKED", { matchId });
  matches[index] = { ...match, winner: sameAthlete(match.athlete1, { id: winnerId }) ? match.athlete1 : match.athlete2, score1, score2, resultStatus };
  const bracketCopy = hydrateAuxiliaryDependencies(copy);
  return { ok: true, bracketCopy, match: bracketCopy.auxiliaryMatches[index] };
}

export function getOperationalMatches(category) {
  return [...(category?.bracket?.matches || []), ...(category?.bracket?.auxiliaryMatches || [])];
}

export function getComputedCategoryResults(category) {
  const selected = selectCategoryMedalists({ category, bracket: category?.bracket });
  if (!selected.ok) return selected;
  const { gold, silver, bronze1, bronze2 } = selected.medals;
  return { ok: true, status: selected.status, results: {
    first: gold?.name || "", club1: gold?.club || "",
    second: silver?.name || "", club2: silver?.club || "",
    third1: bronze1?.name || "", club3a: bronze1?.club || "",
    third2: bronze2?.name || "", club3b: bronze2?.club || "",
    _fromBracket: true,
  } };
}

export function getSavedResultWarnings(category, savedResults) {
  if (!savedResults || resolveBronzeMode(category) !== BRONZE_MODES.SINGLE_BRONZE) return [];
  const warnings = [];
  if ([savedResults.third2, savedResults.club3b].some((value) => typeof value === "string" && value.trim())) warnings.push("SINGLE_SAVED_SECOND_BRONZE");
  const computed = getComputedCategoryResults(category);
  if (computed.ok && savedResults.third1?.trim() && savedResults.third1.trim() !== computed.results.third1) warnings.push("SINGLE_SAVED_BRONZE_MISMATCH");
  return warnings;
}
