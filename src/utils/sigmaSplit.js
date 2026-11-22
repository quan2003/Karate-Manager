// Shared representation of a virtual Sigma branch.  Sigma splitting used to
// exist only in PDF/scheduling, so the scoring file still received the whole
// bracket.  Keep the original match IDs: results can therefore be applied
// safely back to the original bracket.
export function getSigmaSplitCount(category, splitSettings = {}) {
  const athletes = category?.athletes || [];
  const count = athletes.length;
  const threshold = Number(splitSettings.threshold) || 20;
  if (Number(category?.sigmaCount) > 1) return Number(category.sigmaCount);
  if (category?.sigmaSplitEnabled === false || count <= 1) return 1;
  if (category?.sigmaSplitEnabled === true) return Math.max(2, Math.floor(count / threshold));
  return splitSettings.enabled && count > threshold ? Math.max(2, Math.floor(count / threshold)) : 1;
}

export function getSigmaSplitBracket(bracket, splitIndex, totalSplits) {
  if (!bracket?.matches || totalSplits <= 1) return bracket;
  const rounds = Number(bracket.numRounds) || Math.max(...bracket.matches.map((match) => Number(match.round) || 0));
  const visibleRounds = Math.max(1, rounds - Math.ceil(Math.log2(totalSplits)));
  const roundOne = bracket.matches.filter((match) => Number(match.round) === 1);
  const perSplit = Math.ceil(roundOne.length / totalSplits);
  const start = splitIndex * perSplit;
  const end = Math.min((splitIndex + 1) * perSplit, roundOne.length);

  const includedIds = new Set();
  for (let round = 1; round <= visibleRounds; round += 1) {
    const matches = bracket.matches.filter((match) => Number(match.round) === round);
    const divisor = 2 ** (round - 1);
    matches
      .slice(Math.floor(start / divisor), Math.ceil(end / divisor))
      .forEach((match) => includedIds.add(match.id));
  }

  const matches = bracket.matches
    .filter((match) => includedIds.has(match.id))
    .map((match) => ({
      ...match,
      // The last match of the branch is deliberately a local final. It must
      // not advance into another branch while Secretary is scoring it.
      nextMatchId: Number(match.round) === visibleRounds ? null : match.nextMatchId,
    }));

  return {
    ...bracket,
    matches,
    auxiliaryMatches: [],
    numRounds: visibleRounds,
    roundNames: (bracket.roundNames || []).slice(0, visibleRounds),
  };
}
