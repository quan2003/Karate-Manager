import { BRONZE_MODES, resolveBronzeMode } from "./bronzeMode.js";
import { createGenerationKey, createStableAuxiliaryId } from "./bronzeCompetition.js";

export const MEDAL_SELECTION_STATUSES = Object.freeze({
  READY: "READY",
  NOT_READY: "NOT_READY",
  INVALID_RESULT: "INVALID_RESULT",
  LOCKED_UNDER_APPEAL: "LOCKED_UNDER_APPEAL",
  UNSUPPORTED_IN_PHASE_3: "UNSUPPORTED_IN_PHASE_3",
  SINGLE_BRONZE_IDENTITY_MISMATCH: "SINGLE_BRONZE_IDENTITY_MISMATCH",
  DUPLICATE_SINGLE_BRONZE_IDENTITY: "DUPLICATE_SINGLE_BRONZE_IDENTITY",
});

const athleteId = (athlete) => typeof athlete?.id === "string" && athlete.id.length > 0 ? athlete.id : null;
const sameAthlete = (left, right) => athleteId(left) !== null && athleteId(left) === athleteId(right);
const fail = (status, details = {}) => ({ ok: false, status, ...details });
const ready = (mode, gold, silver, bronze1, bronze2, sources) => ({
  ok: true,
  status: MEDAL_SELECTION_STATUSES.READY,
  mode,
  medals: { gold, silver, bronze1, bronze2 },
  sources,
});

export function getMatchLoser(match) {
  const firstId = athleteId(match?.athlete1);
  const secondId = athleteId(match?.athlete2);
  if (!firstId || !secondId || firstId === secondId) {
    return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { matchId: match?.id ?? null, reason: "TWO_DISTINCT_PARTICIPANTS_REQUIRED" });
  }
  if (sameAthlete(match.winner, match.athlete1)) return { ok: true, winner: match.athlete1, loser: match.athlete2 };
  if (sameAthlete(match.winner, match.athlete2)) return { ok: true, winner: match.athlete2, loser: match.athlete1 };
  return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { matchId: match?.id ?? null, reason: "WINNER_NOT_IN_MATCH" });
}

function getFinalResult(bracket) {
  if (!Array.isArray(bracket?.matches)) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "MATCHES_REQUIRED" });
  const finals = bracket.matches.filter((match) => match?.nextMatchId === null && Number(match?.round) > 0);
  if (finals.length !== 1) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: finals.length ? "MULTIPLE_FINALS" : "FINAL_NOT_FOUND", matchIds: finals.map((match) => match.id) });
  if (finals[0].resultStatus === "UNDER_APPEAL") return fail(MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL, { blockingMatchIds: [finals[0].id] });
  const outcome = getMatchLoser(finals[0]);
  return outcome.ok ? { ok: true, finalMatch: finals[0], gold: outcome.winner, silver: outcome.loser } : outcome;
}

function legacySemiLoser(match) {
  if (match?.resultStatus === "UNDER_APPEAL") return fail(MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL, { blockingMatchIds: [match.id] });
  const participantCount = Number(Boolean(athleteId(match?.athlete1))) + Number(Boolean(athleteId(match?.athlete2)));
  if (participantCount === 1 && athleteId(match?.winner) && (sameAthlete(match.winner, match.athlete1) || sameAthlete(match.winner, match.athlete2))) {
    return { ok: true, loser: null, autoAdvance: true };
  }
  return getMatchLoser(match);
}

export function selectDualBronzeMedalists({ bracket }) {
  const final = getFinalResult(bracket);
  if (!final.ok) return final;
  const semiRound = Number(bracket?.numRounds) - 1;
  if (!Number.isFinite(semiRound) || semiRound < 1) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "INVALID_NUM_ROUNDS" });
  const semis = bracket.matches.filter((match) => match?.round === semiRound && match?.isBye !== true);
  if (semis.length !== 2) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "AMBIGUOUS_SEMIFINALS", matchIds: semis.map((match) => match.id) });
  const bronze = [];
  const autoAdvanceSemis = [];
  for (const semi of semis) {
    const outcome = legacySemiLoser(semi);
    if (!outcome.ok) return outcome;
    if (outcome.loser) bronze.push(outcome.loser);
    else autoAdvanceSemis.push(semi);
  }
  if (bronze.length < 2 && semiRound > 1) {
    const quarterFinals = bracket.matches.filter((match) => match?.round === semiRound - 1 && match?.isBye !== true && athleteId(match?.winner));
    const addQuarterLoser = (match) => {
      const outcome = getMatchLoser(match);
      if (!outcome.ok) return outcome;
      if (![final.gold, final.silver, ...bronze].some((athlete) => sameAthlete(athlete, outcome.loser))) bronze.push(outcome.loser);
      return { ok: true };
    };
    for (const semi of autoAdvanceSemis) {
      const advanced = semi.winner || semi.athlete1 || semi.athlete2;
      const candidates = quarterFinals.filter((match) => sameAthlete(match.winner, advanced));
      if (candidates.length > 1) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "AMBIGUOUS_QUARTERFINAL_SOURCE", matchIds: candidates.map((match) => match.id) });
      if (candidates.length === 1) {
        const added = addQuarterLoser(candidates[0]);
        if (!added.ok) return added;
      }
    }
    for (const quarterFinal of quarterFinals) {
      if (bronze.length >= 2) break;
      const added = addQuarterLoser(quarterFinal);
      if (!added.ok) return added;
    }
  }
  if (bronze.length < 2) return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "BRONZE_MEDALISTS_UNDETERMINED" });
  return ready(BRONZE_MODES.DUAL_BRONZE, final.gold, final.silver, bronze[0], bronze[1], { finalMatchId: final.finalMatch.id, bronzeMatchIds: semis.map((match) => match.id) });
}

export function getExpectedSingleBronzeIdentity(categoryId) {
  const generationKey = createGenerationKey({ categoryId, mode: BRONZE_MODES.SINGLE_BRONZE, side: null, sequence: 1 });
  return { generationKey, id: createStableAuxiliaryId(generationKey) };
}

export function findSingleBronzeMatch({ categoryId, auxiliaryMatches }) {
  const expected = getExpectedSingleBronzeIdentity(categoryId);
  const matches = Array.isArray(auxiliaryMatches) ? auxiliaryMatches : [];
  const exact = matches.filter((match) => match?.id === expected.id && match?.generationKey === expected.generationKey);
  const partial = matches.filter((match) => (match?.id === expected.id || match?.generationKey === expected.generationKey) && !exact.includes(match));
  if (exact.length > 1 || partial.length > 1 || (exact.length && partial.length)) {
    return fail(MEDAL_SELECTION_STATUSES.DUPLICATE_SINGLE_BRONZE_IDENTITY, { expected, matchIds: [...exact, ...partial].map((match) => match?.id ?? null) });
  }
  if (partial.length === 1) return fail(MEDAL_SELECTION_STATUSES.SINGLE_BRONZE_IDENTITY_MISMATCH, { expected, match: partial[0] });
  return exact.length === 1 ? { ok: true, match: exact[0], expected } : { ok: true, match: null, expected };
}

export function selectSingleBronzeMedalists({ categoryId, bracket }) {
  const final = getFinalResult(bracket);
  if (!final.ok) return final;
  const located = findSingleBronzeMatch({ categoryId, auxiliaryMatches: bracket?.auxiliaryMatches });
  if (!located.ok) return located;
  const match = located.match;
  if (match?.resultStatus === "UNDER_APPEAL") return fail(MEDAL_SELECTION_STATUSES.LOCKED_UNDER_APPEAL, { blockingMatchIds: [match.id] });
  if (!match || match.operationalStatus === "SUSPENDED_SOURCE_INCOMPLETE" || match.winner == null) {
    return fail(MEDAL_SELECTION_STATUSES.NOT_READY, { reason: !match ? "SINGLE_BRONZE_MATCH_NOT_FOUND" : "SINGLE_BRONZE_MATCH_PENDING", medals: { gold: final.gold, silver: final.silver, bronze1: null, bronze2: null } });
  }
  const outcome = getMatchLoser(match);
  if (!outcome.ok) return outcome;
  return ready(BRONZE_MODES.SINGLE_BRONZE, final.gold, final.silver, outcome.winner, null, { finalMatchId: final.finalMatch.id, bronzeMatchIds: [match.id] });
}

export function selectCategoryMedalists({ category, bracket }) {
  let mode;
  try { mode = resolveBronzeMode(category); }
  catch (error) { return fail(MEDAL_SELECTION_STATUSES.INVALID_RESULT, { reason: "INVALID_BRONZE_MODE", message: error.message }); }
  if (mode === BRONZE_MODES.DUAL_BRONZE) return selectDualBronzeMedalists({ bracket });
  if (mode === BRONZE_MODES.SINGLE_BRONZE) return selectSingleBronzeMedalists({ categoryId: category?.id, bracket });
  return fail(MEDAL_SELECTION_STATUSES.UNSUPPORTED_IN_PHASE_3, { mode });
}
