const clone = (value) => JSON.parse(JSON.stringify(value));

export function athlete(id) {
  return { id, name: `Athlete ${id}` };
}

export function createCompletedBracket(size, { activeSlots = null, categoryId = `category-${size}` } = {}) {
  if (!Number.isInteger(size) || size < 4 || (size & (size - 1)) !== 0) throw new TypeError("size must be a power of two >= 4");
  const active = new Set(activeSlots || Array.from({ length: size }, (_, index) => index));
  const slots = Array.from({ length: size }, (_, index) => active.has(index) ? athlete(`a${index + 1}`) : null);
  const matches = [];
  let previous = [];
  let matchNumber = 1;
  const rounds = Math.log2(size);
  for (let round = 1; round <= rounds; round += 1) {
    const participantPairs = round === 1
      ? Array.from({ length: size / 2 }, (_, index) => [slots[index * 2], slots[index * 2 + 1]])
      : Array.from({ length: previous.length / 2 }, (_, index) => [previous[index * 2].winner, previous[index * 2 + 1].winner]);
    const current = participantPairs.map(([athlete1, athlete2], position) => {
      const count = Number(Boolean(athlete1)) + Number(Boolean(athlete2));
      const isBye = count === 1;
      const winner = athlete1 || athlete2;
      const match = {
        id: `main-r${round}-p${position}`,
        matchNumber: isBye ? null : matchNumber,
        matchCode: isBye ? null : `M${matchNumber}`,
        round,
        position,
        athlete1,
        athlete2,
        winner,
        score1: isBye ? null : 1,
        score2: isBye ? null : 0,
        isBye,
        nextMatchId: round === rounds ? null : `main-r${round + 1}-p${Math.floor(position / 2)}`,
        resultStatus: "FINAL",
      };
      if (!isBye) matchNumber += 1;
      return match;
    });
    matches.push(...current);
    previous = current;
  }
  return { categoryId, bracket: { id: `bracket-${categoryId}`, size, numRounds: rounds, matches } };
}

export function withMatchPatch(fixture, matchId, patch) {
  const result = clone(fixture);
  const match = result.bracket.matches.find((item) => item.id === matchId);
  if (!match) throw new Error(`Unknown fixture match: ${matchId}`);
  Object.assign(match, clone(patch));
  return result;
}

export function withAuxiliaryMatches(fixture, auxiliaryMatches) {
  const result = clone(fixture);
  result.bracket.auxiliaryMatches = clone(auxiliaryMatches);
  return result;
}

export const fourAthleteFixture = createCompletedBracket(4);
export const eightAthleteFixture = createCompletedBracket(8);
export const sixteenAthleteFixture = createCompletedBracket(16);
export const thirtyTwoAthleteFixture = createCompletedBracket(32);

// Six athletes in eight slots, with one valid BYE in each half.
export const sixAthleteByeFixture = createCompletedBracket(8, {
  categoryId: "category-six-with-byes",
  activeSlots: [0, 2, 3, 4, 6, 7],
});

// Ten athletes in sixteen slots, with BYEs distributed across both halves.
export const tenAthleteByeFixture = createCompletedBracket(16, {
  categoryId: "category-ten-with-byes",
  activeSlots: [0, 2, 4, 6, 7, 8, 10, 12, 13, 15],
});

// Finalist A receives a first-round BYE while finalist B fights every round.
export const asymmetricFinalistPathsFixture = createCompletedBracket(8, {
  categoryId: "category-asymmetric-paths",
  activeSlots: [0, 2, 3, 4, 5, 6, 7],
});

export function reverseMatchArray(fixture) {
  const result = clone(fixture);
  result.bracket.matches.reverse();
  return result;
}

export function snapshotFixture(fixture) {
  return clone(fixture);
}
