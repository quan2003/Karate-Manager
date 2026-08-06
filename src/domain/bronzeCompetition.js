import { BRONZE_MODES, isValidBronzeMode } from "./bronzeMode.js";

export const AUXILIARY_STAGE_TYPES = Object.freeze({ BRONZE: "BRONZE", REPECHAGE: "REPECHAGE" });
export const RESULT_STATUSES = Object.freeze({ FINAL: "FINAL", UNDER_APPEAL: "UNDER_APPEAL" });
export const ELIGIBILITY_DECISIONS = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  INELIGIBLE: "INELIGIBLE",
  NEEDS_VERIFICATION: "NEEDS_VERIFICATION",
});
export const SLOT_SOURCE_TYPES = Object.freeze({
  LOSER_OF_MAIN_MATCH: "LOSER_OF_MAIN_MATCH",
  WINNER_OF_AUXILIARY_MATCH: "WINNER_OF_AUXILIARY_MATCH",
  DIRECT_ATHLETE: "DIRECT_ATHLETE",
});
export const OUTCOME_TYPES = Object.freeze({
  NORMAL: "NORMAL",
  NO_SHOW_BEFORE_MATCH: "NO_SHOW_BEFORE_MATCH",
  TOURNAMENT_DISQUALIFICATION: "TOURNAMENT_DISQUALIFICATION",
  WITHDRAWAL_DURING_MATCH: "WITHDRAWAL_DURING_MATCH",
  FORFEIT: "FORFEIT",
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const athleteId = (athlete) => typeof athlete?.id === "string" && athlete.id.length > 0 ? athlete.id : null;
const sameAthlete = (left, right) => athleteId(left) !== null && athleteId(left) === athleteId(right);
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort();
const failure = (status, details = {}) => ({ ok: false, status, ...details });

export function validateMatchParticipantStructure(match) {
  if (!match || typeof match !== "object") return failure("INVALID_PARTICIPANT_STRUCTURE", { reason: "MATCH_REQUIRED" });
  const a1 = athleteId(match.athlete1);
  const a2 = athleteId(match.athlete2);
  const count = Number(Boolean(a1)) + Number(Boolean(a2));
  if (match.isBye === true) {
    if (count !== 1) return failure("INVALID_BYE_STRUCTURE", { matchId: match.id, reason: count === 0 ? "BYE_WITHOUT_PARTICIPANT" : "BYE_WITH_TWO_PARTICIPANTS" });
    const participant = a1 ? match.athlete1 : match.athlete2;
    if (!sameAthlete(match.winner, participant)) return failure("INVALID_BYE_STRUCTURE", { matchId: match.id, reason: "INVALID_BYE_WINNER" });
    return { ok: true, type: "VALID_BYE", participant, winner: participant };
  }
  if (count !== 2) {
    const uncertain = match.participantStatus === "NEEDS_VERIFICATION" || match.metadataIncomplete === true;
    return failure(uncertain ? "NEEDS_VERIFICATION" : "INVALID_PARTICIPANT_STRUCTURE", { matchId: match.id, reason: "REAL_MATCH_REQUIRES_TWO_PARTICIPANTS" });
  }
  if (a1 === a2) return failure("INVALID_PARTICIPANT_STRUCTURE", { matchId: match.id, reason: "DUPLICATE_PARTICIPANT" });
  return { ok: true, type: "REAL_MATCH" };
}

export function validateMainBracketStructure(bracket) {
  if (!Array.isArray(bracket?.matches)) return failure("INVALID_BRACKET", { errors: [{ code: "MATCHES_REQUIRED" }] });
  const errors = [];
  const matchesById = new Map();
  for (const match of bracket.matches) {
    if (typeof match?.id !== "string" || match.id.length === 0) { errors.push({ code: "MISSING_MAIN_MATCH_ID" }); continue; }
    if (matchesById.has(match.id)) errors.push({ code: "DUPLICATE_MAIN_MATCH_ID", matchIds: [match.id] });
    else matchesById.set(match.id, match);
  }
  for (const match of matchesById.values()) {
    if (match.nextMatchId !== null && match.nextMatchId !== undefined && !matchesById.has(match.nextMatchId)) {
      errors.push({ code: "INVALID_NEXT_MATCH_REFERENCE", matchIds: [match.id], nextMatchId: match.nextMatchId });
    }
  }
  const state = new Map();
  const visit = (id, trail = []) => {
    if (state.get(id) === 1) { errors.push({ code: "BRACKET_CYCLE", matchIds: [...trail, id] }); return; }
    if (state.get(id) === 2) return;
    state.set(id, 1);
    const next = matchesById.get(id)?.nextMatchId;
    if (next && matchesById.has(next)) visit(next, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of matchesById.keys()) visit(id);
  const finals = [...matchesById.values()].filter((match) => match.nextMatchId === null || match.nextMatchId === undefined);
  if (finals.length === 0) errors.push({ code: "FINAL_NOT_FOUND" });
  if (finals.length > 1) errors.push({ code: "MULTIPLE_FINALS", matchIds: finals.map((m) => m.id) });
  const finalMatch = finals.length === 1 ? finals[0] : null;
  const feeders = finalMatch ? [...matchesById.values()].filter((match) => match.nextMatchId === finalMatch.id) : [];
  if (finalMatch && feeders.length !== 2) errors.push({ code: "INVALID_FINAL_FEEDER_COUNT", matchIds: feeders.map((m) => m.id) });
  if (feeders.length === 2) {
    if (!Number.isFinite(feeders[0].position) || !Number.isFinite(feeders[1].position)) errors.push({ code: "MISSING_FEEDER_POSITION", matchIds: feeders.map((m) => m.id) });
    else if (feeders[0].position === feeders[1].position) errors.push({ code: "DUPLICATE_FEEDER_POSITION", matchIds: feeders.map((m) => m.id) });
  }
  if (errors.length) return failure("INVALID_BRACKET_STRUCTURE", { errors });
  const sortedFeeders = [...feeders].sort((a, b) => a.position - b.position);
  return { ok: true, matchesById, finalMatch, semiFinalFeeders: sortedFeeders, sideA: sortedFeeders[0], sideB: sortedFeeders[1] };
}

export function findFinalMatch(bracketOrValidation) {
  const validated = bracketOrValidation?.matchesById ? bracketOrValidation : validateMainBracketStructure(bracketOrValidation);
  return validated.ok ? { ok: true, match: validated.finalMatch } : validated;
}

export function findSemiFinalMatches(bracketOrValidation, finalMatch = null) {
  const validated = bracketOrValidation?.matchesById ? bracketOrValidation : validateMainBracketStructure(bracketOrValidation);
  if (!validated.ok) return validated;
  if (finalMatch && finalMatch.id !== validated.finalMatch.id) return failure("FINAL_MISMATCH");
  return { ok: true, sideA: validated.sideA, sideB: validated.sideB };
}

export function detectOutcomeSignals(match, loser = null) {
  const explicit = typeof match?.outcomeType === "string" ? match.outcomeType : null;
  const signals = [];
  const add = (condition, signal) => { if (condition) signals.push(signal); };
  add(match?.noShowBeforeMatch === true || loser?.noShowBeforeMatch === true, OUTCOME_TYPES.NO_SHOW_BEFORE_MATCH);
  add(match?.tournamentDisqualification === true || loser?.tournamentDisqualification === true, OUTCOME_TYPES.TOURNAMENT_DISQUALIFICATION);
  add(match?.withdrawalDuringMatch === true, OUTCOME_TYPES.WITHDRAWAL_DURING_MATCH);
  add(match?.forfeit === true, OUTCOME_TYPES.FORFEIT);
  add(match?.disqualification === true && !signals.includes(OUTCOME_TYPES.TOURNAMENT_DISQUALIFICATION) && !explicit, "DISQUALIFICATION_UNCLASSIFIED");
  add(match?.walkover === true && !signals.includes(OUTCOME_TYPES.NO_SHOW_BEFORE_MATCH) && !signals.includes(OUTCOME_TYPES.FORFEIT) && !explicit, "WALKOVER_UNCLASSIFIED");
  if (explicit && explicit !== OUTCOME_TYPES.NORMAL && !signals.includes(explicit)) signals.push(explicit);
  const known = new Set(Object.values(OUTCOME_TYPES));
  const abnormal = uniqueSorted(signals);
  const metadataComplete = abnormal.every((signal) => known.has(signal) && signal !== OUTCOME_TYPES.NORMAL) && abnormal.length <= 1;
  return { underAppeal: match?.resultStatus === RESULT_STATUSES.UNDER_APPEAL, explicitOutcomeType: explicit, abnormalSignals: abnormal, metadataComplete };
}

export function getValidMatchOutcome(match) {
  if (match?.resultStatus === RESULT_STATUSES.UNDER_APPEAL) return failure("UNDER_APPEAL", { matchId: match?.id });
  const structure = validateMatchParticipantStructure(match);
  if (!structure.ok) return structure;
  if (structure.type === "VALID_BYE") return { ok: true, outcomeType: "BYE", winner: structure.winner, loser: null };
  const winner = sameAthlete(match.winner, match.athlete1) ? match.athlete1 : sameAthlete(match.winner, match.athlete2) ? match.athlete2 : null;
  if (!winner) return failure("INVALID_RESULT", { matchId: match.id, reason: "WINNER_NOT_IN_MATCH" });
  const loser = sameAthlete(winner, match.athlete1) ? match.athlete2 : match.athlete1;
  const signals = detectOutcomeSignals(match, loser);
  if (signals.underAppeal) return failure("UNDER_APPEAL", { matchId: match.id });
  if (signals.abnormalSignals.length && !signals.metadataComplete) return failure("NEEDS_VERIFICATION", { matchId: match.id, reason: "INCOMPLETE_OUTCOME_METADATA", signals });
  return { ok: true, outcomeType: signals.explicitOutcomeType || signals.abnormalSignals[0] || OUTCOME_TYPES.NORMAL, winner, loser, signals };
}

export function validateEligibilityPolicy(policy) {
  if (!policy || !Number.isInteger(policy.version) || policy.version < 1) return failure("INVALID_POLICY", { reason: "POLICY_VERSION_REQUIRED" });
  for (const key of ["withdrawal_during_match", "forfeit"]) {
    if (policy[key] !== undefined && ![ELIGIBILITY_DECISIONS.ELIGIBLE, ELIGIBILITY_DECISIONS.INELIGIBLE].includes(policy[key])) return failure("INVALID_POLICY", { reason: `INVALID_${key.toUpperCase()}` });
  }
  return { ok: true, policyVersion: policy.version };
}

export function evaluateLoserEligibility({ match, loser, policy }) {
  const outcome = getValidMatchOutcome(match);
  if (!outcome.ok) return { decision: outcome.status === "NEEDS_VERIFICATION" ? ELIGIBILITY_DECISIONS.NEEDS_VERIFICATION : ELIGIBILITY_DECISIONS.INELIGIBLE, reason: outcome.status, policyVersion: policy?.version ?? null };
  if (!outcome.loser) return { decision: ELIGIBILITY_DECISIONS.INELIGIBLE, reason: "BYE", policyVersion: policy?.version ?? null };
  const type = outcome.outcomeType;
  if (type === OUTCOME_TYPES.NO_SHOW_BEFORE_MATCH) return { decision: ELIGIBILITY_DECISIONS.INELIGIBLE, reason: type, policyVersion: policy?.version ?? null };
  if (type === OUTCOME_TYPES.TOURNAMENT_DISQUALIFICATION) return { decision: ELIGIBILITY_DECISIONS.INELIGIBLE, reason: type, policyVersion: policy?.version ?? null };
  const policyKey = type === OUTCOME_TYPES.WITHDRAWAL_DURING_MATCH ? "withdrawal_during_match" : type === OUTCOME_TYPES.FORFEIT ? "forfeit" : null;
  if (policyKey) {
    const validPolicy = validateEligibilityPolicy(policy);
    if (!validPolicy.ok || !policy[policyKey]) return { decision: ELIGIBILITY_DECISIONS.NEEDS_VERIFICATION, reason: `POLICY_REQUIRED_${policyKey.toUpperCase()}`, policyVersion: policy?.version ?? null };
    return { decision: policy[policyKey], reason: `POLICY_${policy[policyKey]}`, policyVersion: policy.version };
  }
  return { decision: ELIGIBILITY_DECISIONS.ELIGIBLE, reason: OUTCOME_TYPES.NORMAL, policyVersion: policy?.version ?? null };
}

export function traceFinalistPath({ validatedBracket, bracket, finalist, semiFinalMatch, finalMatch }) {
  const validated = validatedBracket || validateMainBracketStructure(bracket);
  if (!validated.ok) return validated;
  if (!athleteId(finalist) || !semiFinalMatch || !finalMatch || finalMatch.id !== validated.finalMatch.id) return failure("INVALID_FINALIST_PATH_INPUT");
  const path = [semiFinalMatch];
  const seen = new Set([semiFinalMatch.id]);
  let current = semiFinalMatch;
  while (true) {
    const feeders = [...validated.matchesById.values()].filter((match) => match.nextMatchId === current.id);
    const wonByFinalist = feeders.filter((match) => sameAthlete(match.winner, finalist));
    if (wonByFinalist.length === 0) break;
    if (wonByFinalist.length !== 1) return failure("AMBIGUOUS_FINALIST_PATH", { matchIds: wonByFinalist.map((m) => m.id) });
    current = wonByFinalist[0];
    if (seen.has(current.id)) return failure("BRACKET_CYCLE", { matchIds: [...seen, current.id] });
    seen.add(current.id);
    path.push(current);
  }
  path.reverse();
  return { ok: true, finalist, matches: path };
}

export function collectLossesToFinalist({ finalistPath, policy }) {
  if (!Array.isArray(finalistPath?.matches)) return failure("INVALID_FINALIST_PATH");
  const eligibleLosses = [], excluded = [], needsVerification = [], blockingMatchIds = [];
  for (const match of finalistPath.matches) {
    if (match.resultStatus === RESULT_STATUSES.UNDER_APPEAL) { blockingMatchIds.push(match.id); continue; }
    const outcome = getValidMatchOutcome(match);
    if (!outcome.ok) {
      const item = { sourceMatchId: match.id, reason: outcome.status };
      if (outcome.status === "NEEDS_VERIFICATION") needsVerification.push(item); else excluded.push(item);
      continue;
    }
    if (!outcome.loser) { excluded.push({ sourceMatchId: match.id, reason: "BYE" }); continue; }
    const eligibility = evaluateLoserEligibility({ match, loser: outcome.loser, policy });
    const item = { athlete: outcome.loser, sourceMatchId: match.id, round: match.round, position: match.position, eligibilityDecision: eligibility.decision, eligibilityReason: eligibility.reason, policyVersion: eligibility.policyVersion };
    if (eligibility.decision === ELIGIBILITY_DECISIONS.ELIGIBLE) eligibleLosses.push(item);
    else if (eligibility.decision === ELIGIBILITY_DECISIONS.NEEDS_VERIFICATION) needsVerification.push(item);
    else excluded.push(item);
  }
  if (blockingMatchIds.length) return failure("LOCKED_UNDER_APPEAL", { blockingMatchIds: uniqueSorted(blockingMatchIds) });
  if (needsVerification.length) return failure("NEEDS_VERIFICATION", { issues: needsVerification, eligibleLosses, excluded });
  return { ok: true, eligibleLosses, excluded, needsVerification: [] };
}

export function splitFinalistBranches(bracket) {
  const validated = validateMainBracketStructure(bracket);
  if (!validated.ok) return validated;
  const finalOutcome = getValidMatchOutcome(validated.finalMatch);
  if (!finalOutcome.ok) return finalOutcome;
  const outcomes = [getValidMatchOutcome(validated.sideA), getValidMatchOutcome(validated.sideB)];
  if (!outcomes[0].ok || !outcomes[1].ok) return !outcomes[0].ok ? outcomes[0] : outcomes[1];
  const pathA = traceFinalistPath({ validatedBracket: validated, finalist: outcomes[0].winner, semiFinalMatch: validated.sideA, finalMatch: validated.finalMatch });
  const pathB = traceFinalistPath({ validatedBracket: validated, finalist: outcomes[1].winner, semiFinalMatch: validated.sideB, finalMatch: validated.finalMatch });
  if (!pathA.ok || !pathB.ok) return !pathA.ok ? pathA : pathB;
  return { ok: true, validated, finalMatch: validated.finalMatch, branchA: { side: "A", semiFinalMatch: validated.sideA, finalist: outcomes[0].winner, path: pathA }, branchB: { side: "B", semiFinalMatch: validated.sideB, finalist: outcomes[1].winner, path: pathB } };
}

export function createGenerationKey({ categoryId, mode, side, sequence }) {
  if (typeof categoryId !== "string" || categoryId.length === 0) throw new TypeError("categoryId must be a non-empty opaque string");
  if (!isValidBronzeMode(mode) || mode === BRONZE_MODES.DUAL_BRONZE) throw new TypeError("Unsupported auxiliary match mode");
  const canonicalSide = side ?? "NONE";
  if (mode === BRONZE_MODES.SINGLE_BRONZE && canonicalSide !== "NONE") throw new TypeError("SINGLE_BRONZE side must be NONE");
  if (mode === BRONZE_MODES.WKF_REPECHAGE && !["A", "B"].includes(canonicalSide)) throw new TypeError("WKF_REPECHAGE side must be A or B");
  if (!Number.isInteger(sequence) || sequence < 1) throw new TypeError("sequence must be a positive integer");
  return JSON.stringify(["auxiliary-match", 1, categoryId, mode, canonicalSide, sequence]);
}

export function parseGenerationKey(key) {
  let value;
  try { value = JSON.parse(key); } catch { throw new TypeError("Invalid generation key JSON"); }
  if (!Array.isArray(value) || value.length !== 6 || value[0] !== "auxiliary-match" || value[1] !== 1) throw new TypeError("Invalid generation key schema or version");
  const canonical = createGenerationKey({ categoryId: value[2], mode: value[3], side: value[4], sequence: value[5] });
  if (canonical !== key) throw new TypeError("Generation key is not canonical");
  return { categoryId: value[2], mode: value[3], side: value[4], sequence: value[5] };
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64Url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >>> 18) & 63] + BASE64[(n >>> 12) & 63] + (i + 1 < bytes.length ? BASE64[(n >>> 6) & 63] : "=") + (i + 2 < bytes.length ? BASE64[n & 63] : "=");
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("Invalid Base64URL");
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bytes = [];
  for (let i = 0; i < base64.length; i += 4) {
    const indexes = [...base64.slice(i, i + 4)].map((char) => char === "=" ? 0 : BASE64.indexOf(char));
    if (indexes.some((index) => index < 0)) throw new TypeError("Invalid Base64URL");
    const n = (indexes[0] << 18) | (indexes[1] << 12) | (indexes[2] << 6) | indexes[3];
    bytes.push((n >>> 16) & 255);
    if (base64[i + 2] !== "=") bytes.push((n >>> 8) & 255);
    if (base64[i + 3] !== "=") bytes.push(n & 255);
  }
  return new Uint8Array(bytes);
}
export function createStableAuxiliaryId(generationKey) {
  parseGenerationKey(generationKey);
  return `aux_v1_${bytesToBase64Url(new TextEncoder().encode(generationKey))}`;
}
export function decodeStableAuxiliaryId(id) {
  if (typeof id !== "string" || !id.startsWith("aux_v1_")) throw new TypeError("Invalid auxiliary ID prefix");
  const key = new TextDecoder("utf-8", { fatal: true }).decode(base64UrlToBytes(id.slice(7)));
  parseGenerationKey(key);
  return key;
}

export function validateSlotSource(source) {
  if (!source || !Object.values(SLOT_SOURCE_TYPES).includes(source.type)) return failure("INVALID_SLOT_SOURCE");
  const hasMatch = typeof source.matchId === "string" && source.matchId.length > 0;
  const hasAthlete = typeof source.athleteId === "string" && source.athleteId.length > 0;
  if (source.type === SLOT_SOURCE_TYPES.DIRECT_ATHLETE) return hasAthlete && !hasMatch ? { ok: true } : failure("INVALID_SLOT_SOURCE");
  return hasMatch && !hasAthlete ? { ok: true } : failure("INVALID_SLOT_SOURCE");
}

function auxiliaryMatch({ categoryId, mode, side, sequence, matchCode, stageType, athlete1, athlete2, athlete1Source, athlete2Source, policyVersion }) {
  const generationKey = createGenerationKey({ categoryId, mode, side, sequence });
  const id = createStableAuxiliaryId(generationKey);
  const sourceMatchIds = uniqueSorted([athlete1Source.matchId, athlete2Source.matchId]);
  return { id, matchCode, stageType, repechageSide: side ?? null, sequence, generationKey, sourceMatchIds, athlete1: athlete1 || null, athlete2: athlete2 || null, athlete1Source, athlete2Source, winner: null, resultStatus: null, eligibilityPolicyVersion: policyVersion ?? null };
}

export function createSingleBronzePlan({ categoryId, bracket }) {
  const validated = validateMainBracketStructure(bracket);
  if (!validated.ok) return validated;
  const directAppeals = [
    [validated.finalMatch, "A"], [validated.finalMatch, "B"],
    [validated.sideA, "A"], [validated.sideB, "B"],
  ].filter(([match]) => match.resultStatus === RESULT_STATUSES.UNDER_APPEAL);
  if (directAppeals.length) return failure("LOCKED_UNDER_APPEAL", {
    blockingMatchIds: uniqueSorted(directAppeals.map(([match]) => match.id)),
    blockingSides: uniqueSorted(directAppeals.map(([, side]) => side)),
  });
  const outcomeA = getValidMatchOutcome(validated.sideA), outcomeB = getValidMatchOutcome(validated.sideB);
  const blocking = [outcomeA, outcomeB].filter((x) => !x.ok && x.status === "UNDER_APPEAL").map((x) => x.matchId);
  if (blocking.length) return failure("LOCKED_UNDER_APPEAL", { blockingMatchIds: uniqueSorted(blocking), blockingSides: [!outcomeA.ok ? "A" : null, !outcomeB.ok ? "B" : null].filter(Boolean) });
  if (!outcomeA.ok || !outcomeB.ok || !outcomeA.loser || !outcomeB.loser) return failure("NOT_READY", { diagnostics: [outcomeA, outcomeB] });
  const desired = auxiliaryMatch({ categoryId, mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1, matchCode: "B1", stageType: AUXILIARY_STAGE_TYPES.BRONZE, athlete1: outcomeA.loser, athlete2: outcomeB.loser, athlete1Source: { type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: validated.sideA.id }, athlete2Source: { type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: validated.sideB.id }, policyVersion: null });
  return { ok: true, mode: BRONZE_MODES.SINGLE_BRONZE, desiredMatches: [desired], directBronzeAthletes: [] };
}

export function createRepechageBranchPlan({ categoryId, side, eligibleLosses, policyVersion }) {
  if (!["A", "B"].includes(side) || !Array.isArray(eligibleLosses)) return failure("INVALID_BRANCH_INPUT");
  if (eligibleLosses.length === 0) return failure("INSUFFICIENT_REPECHAGE_PARTICIPANTS", { side, eligibleCount: 0 });
  if (eligibleLosses.length === 1) {
    const loss = eligibleLosses[0];
    return { ok: true, status: "DIRECT_BRONZE", side, desiredMatches: [], directBronzeAthlete: { athlete: loss.athlete, sourceMatchId: loss.sourceMatchId, side, eligibilityDecision: loss.eligibilityDecision, eligibilityReason: loss.eligibilityReason, policyVersion: loss.policyVersion ?? policyVersion ?? null } };
  }
  const desiredMatches = [];
  for (let index = 0; index < eligibleLosses.length - 1; index += 1) {
    const sequence = index + 1;
    const nextLoss = eligibleLosses[index + 1];
    const previous = desiredMatches[index - 1];
    const firstLoss = eligibleLosses[0];
    desiredMatches.push(auxiliaryMatch({ categoryId, mode: BRONZE_MODES.WKF_REPECHAGE, side, sequence, matchCode: `R${side}${sequence}`, stageType: AUXILIARY_STAGE_TYPES.REPECHAGE, athlete1: sequence === 1 ? firstLoss.athlete : null, athlete2: nextLoss.athlete, athlete1Source: sequence === 1 ? { type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: firstLoss.sourceMatchId } : { type: SLOT_SOURCE_TYPES.WINNER_OF_AUXILIARY_MATCH, matchId: previous.id }, athlete2Source: { type: SLOT_SOURCE_TYPES.LOSER_OF_MAIN_MATCH, matchId: nextLoss.sourceMatchId }, policyVersion }));
  }
  return { ok: true, status: "MATCHES_PLANNED", side, desiredMatches, directBronzeAthlete: null };
}

function relevantAppeals(split, bracket) {
  const ids = new Map();
  const add = (match, side) => { if (match?.resultStatus === RESULT_STATUSES.UNDER_APPEAL) ids.set(match.id, side); };
  add(split.finalMatch, "A"); add(split.finalMatch, "B");
  split.branchA.path.matches.forEach((m) => add(m, "A"));
  split.branchB.path.matches.forEach((m) => add(m, "B"));
  const main = new Map(bracket.matches.map((m) => [m.id, m]));
  for (const aux of bracket.auxiliaryMatches || []) for (const dep of aux.sourceMatchIds || []) add(main.get(dep), aux.repechageSide || "A");
  return { blockingMatchIds: uniqueSorted([...ids.keys()]), blockingSides: uniqueSorted([...ids.values()]) };
}

export function createWkfRepechagePlan({ categoryId, bracket, policy }) {
  const policyValidation = validateEligibilityPolicy(policy);
  if (!policyValidation.ok) return policyValidation;
  const validated = validateMainBracketStructure(bracket);
  if (!validated.ok) return validated;
  const directAppeals = [
    [validated.finalMatch, "A"], [validated.finalMatch, "B"],
    [validated.sideA, "A"], [validated.sideB, "B"],
  ].filter(([match]) => match.resultStatus === RESULT_STATUSES.UNDER_APPEAL);
  if (directAppeals.length) return failure("LOCKED_UNDER_APPEAL", {
    blockingMatchIds: uniqueSorted(directAppeals.map(([match]) => match.id)),
    blockingSides: uniqueSorted(directAppeals.map(([, side]) => side)),
  });
  const split = splitFinalistBranches(bracket);
  if (!split.ok) return split;
  const appeals = relevantAppeals(split, bracket);
  if (appeals.blockingMatchIds.length) return failure("LOCKED_UNDER_APPEAL", appeals);
  const lossesA = collectLossesToFinalist({ finalistPath: split.branchA.path, policy });
  const lossesB = collectLossesToFinalist({ finalistPath: split.branchB.path, policy });
  if (!lossesA.ok || !lossesB.ok) {
    const status = lossesA.status === "LOCKED_UNDER_APPEAL" || lossesB.status === "LOCKED_UNDER_APPEAL" ? "LOCKED_UNDER_APPEAL" : "NEEDS_VERIFICATION";
    return failure(status, { diagnostics: { A: lossesA, B: lossesB }, blockingMatchIds: uniqueSorted([...(lossesA.blockingMatchIds || []), ...(lossesB.blockingMatchIds || [])]), blockingSides: [!lossesA.ok ? "A" : null, !lossesB.ok ? "B" : null].filter(Boolean) });
  }
  const branchA = createRepechageBranchPlan({ categoryId, side: "A", eligibleLosses: lossesA.eligibleLosses, policyVersion: policy.version });
  const branchB = createRepechageBranchPlan({ categoryId, side: "B", eligibleLosses: lossesB.eligibleLosses, policyVersion: policy.version });
  if (!branchA.ok || !branchB.ok) return failure("INSUFFICIENT_REPECHAGE_PARTICIPANTS", { diagnostics: { A: branchA, B: branchB } });
  return { ok: true, mode: BRONZE_MODES.WKF_REPECHAGE, branches: { A: branchA, B: branchB }, desiredMatches: [...branchA.desiredMatches, ...branchB.desiredMatches], directBronzeAthletes: [branchA.directBronzeAthlete, branchB.directBronzeAthlete].filter(Boolean), excluded: [...lossesA.excluded, ...lossesB.excluded] };
}

export function isAuxiliaryMatchCompleted(match) {
  if (match?.resultStatus === RESULT_STATUSES.UNDER_APPEAL) return failure("LOCKED_UNDER_APPEAL", { matchId: match?.id });
  const hasParticipants = athleteId(match?.athlete1) && athleteId(match?.athlete2);
  const winnerPresent = match?.winner != null;
  const validWinner = hasParticipants && (sameAthlete(match.winner, match.athlete1) || sameAthlete(match.winner, match.athlete2));
  if (winnerPresent && !validWinner) return failure("INVALID_AUXILIARY_RESULT", { matchId: match?.id, reason: "WINNER_NOT_IN_MATCH" });
  const finalStatus = match?.resultStatus === RESULT_STATUSES.FINAL;
  const finalDecision = match?.finalDecision === true || match?.decisionStatus === RESULT_STATUSES.FINAL;
  return { ok: true, completed: Boolean(validWinner || finalStatus || finalDecision), evidence: [validWinner ? "VALID_WINNER" : null, finalStatus ? "FINAL_STATUS" : null, finalDecision ? "FINAL_DECISION_METADATA" : null].filter(Boolean) };
}

const comparableAux = (match) => JSON.stringify({ stageType: match.stageType, repechageSide: match.repechageSide ?? null, sequence: match.sequence, sourceMatchIds: uniqueSorted(match.sourceMatchIds || []), athlete1: athleteId(match.athlete1), athlete2: athleteId(match.athlete2), athlete1Source: match.athlete1Source, athlete2Source: match.athlete2Source, eligibilityPolicyVersion: match.eligibilityPolicyVersion ?? null });

export function detectAuxiliaryConflict(existing, desired) {
  const completion = isAuxiliaryMatchCompleted(existing);
  if (!completion.ok) return completion;
  const changed = comparableAux(existing) !== comparableAux(desired);
  return completion.completed && changed ? failure("CONFLICT_COMPLETED_AUXILIARY_MATCH", { generationKey: existing.generationKey, existingId: existing.id }) : { ok: true, changed, completed: completion.completed };
}

export function reconcileAuxiliaryMatches({ categoryId, bracket, desiredPlan }) {
  if (!desiredPlan?.ok) return failure(desiredPlan?.status || "INVALID_DESIRED_PLAN", { diagnostics: desiredPlan });
  const structure = validateMainBracketStructure(bracket);
  if (!structure.ok) return structure;
  const mainById = structure.matchesById;
  const dependencyAppeals = [];
  for (const desired of desiredPlan.desiredMatches || []) {
    for (const dependencyId of desired.sourceMatchIds || []) {
      const dependency = mainById.get(dependencyId);
      if (dependency?.resultStatus === RESULT_STATUSES.UNDER_APPEAL) {
        dependencyAppeals.push({ matchId: dependencyId, side: desired.repechageSide || "A" });
      }
    }
  }
  if (dependencyAppeals.length) return failure("LOCKED_UNDER_APPEAL", {
    blockingMatchIds: uniqueSorted(dependencyAppeals.map((item) => item.matchId)),
    blockingSides: uniqueSorted(dependencyAppeals.map((item) => item.side)),
  });
  const existing = Array.isArray(bracket.auxiliaryMatches) ? bracket.auxiliaryMatches : [];
  const existingByKey = new Map(), duplicateKeys = [];
  for (const match of existing) {
    if (existingByKey.has(match.generationKey)) duplicateKeys.push(match.generationKey);
    else existingByKey.set(match.generationKey, match);
    const completion = isAuxiliaryMatchCompleted(match);
    if (!completion.ok) return failure(completion.status, { conflicts: [completion] });
  }
  if (duplicateKeys.length) return failure("DUPLICATE_GENERATION_KEY", { conflicts: uniqueSorted(duplicateKeys) });
  const desiredKeys = new Set(), desiredDuplicates = [];
  for (const match of desiredPlan.desiredMatches || []) {
    const parsed = parseGenerationKey(match.generationKey);
    if (parsed.categoryId !== categoryId || match.id !== createStableAuxiliaryId(match.generationKey)) return failure("INVALID_DESIRED_MATCH_IDENTITY", { generationKey: match.generationKey });
    if (!validateSlotSource(match.athlete1Source).ok || !validateSlotSource(match.athlete2Source).ok) return failure("INVALID_SLOT_SOURCE", { generationKey: match.generationKey });
    if (desiredKeys.has(match.generationKey)) desiredDuplicates.push(match.generationKey);
    desiredKeys.add(match.generationKey);
  }
  if (desiredDuplicates.length) return failure("DUPLICATE_GENERATION_KEY", { conflicts: uniqueSorted(desiredDuplicates) });
  const conflicts = [];
  for (const desired of desiredPlan.desiredMatches || []) {
    const current = existingByKey.get(desired.generationKey);
    if (!current) continue;
    const conflict = detectAuxiliaryConflict(current, desired);
    if (!conflict.ok) conflicts.push(conflict);
  }
  if (conflicts.length) return failure("CONFLICT_COMPLETED_AUXILIARY_MATCH", { conflicts });
  const created = [], updated = [], unchanged = [];
  const next = [];
  for (const desired of desiredPlan.desiredMatches || []) {
    const current = existingByKey.get(desired.generationKey);
    if (!current) { next.push(clone(desired)); created.push(desired.generationKey); continue; }
    const conflict = detectAuxiliaryConflict(current, desired);
    if (conflict.changed) { next.push({ ...clone(desired), id: current.id, winner: current.winner ?? null, resultStatus: current.resultStatus ?? null }); updated.push(desired.generationKey); }
    else { next.push(clone(current)); unchanged.push(desired.generationKey); }
  }
  const orphaned = existing.filter((match) => !desiredKeys.has(match.generationKey));
  next.push(...clone(orphaned));
  const bracketCopy = clone(bracket);
  bracketCopy.auxiliaryMatches = next;
  return { ok: true, status: created.length ? "PLANNED" : updated.length ? "UPDATED" : "UNCHANGED", bracketCopy, auxiliaryMatches: next, created, updated, unchanged, orphaned: orphaned.map((m) => m.generationKey), conflicts: [] };
}
