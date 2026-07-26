const normalizeAthleteText = (value) => String(value || '')
  .trim()
  .normalize('NFKC')
  .replace(/\s+/g, ' ')
  .toLowerCase();

const normalizeBirth = (athlete) => {
  const value = String(athlete?.birthDate || athlete?.birthYear || '').trim();
  if (!value) return { year: '', date: '' };

  const isoDate = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoDate) {
    return {
      year: isoDate[1],
      date: `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`,
    };
  }

  const vietnameseDate = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (vietnameseDate) {
    return {
      year: vietnameseDate[3],
      date: `${vietnameseDate[3]}-${vietnameseDate[2].padStart(2, '0')}-${vietnameseDate[1].padStart(2, '0')}`,
    };
  }

  const year = value.match(/\b(19|20)\d{2}\b/)?.[0] || '';
  return { year, date: '' };
};

const sameBirth = (left, right) => {
  const a = normalizeBirth(left);
  const b = normalizeBirth(right);
  if (!a.year || !b.year) return false;
  if (a.date && b.date) return a.date === b.date;
  return a.year === b.year;
};

const sameEvent = (cloudAthlete, ref) => {
  const cloudEventId = cloudAthlete?.eventId || cloudAthlete?.categoryId;
  const refEventId = ref?.eventId || ref?.categoryId;
  if (cloudEventId && refEventId && String(cloudEventId) === String(refEventId)) {
    return true;
  }

  const cloudEventName = cloudAthlete?.eventName || cloudAthlete?.categoryName;
  const refEventName = ref?.eventName || ref?.categoryName;
  return Boolean(
    cloudEventName
    && refEventName
    && normalizeAthleteText(cloudEventName) === normalizeAthleteText(refEventName)
  );
};

/**
 * Match each selected local athlete to at most one Cloud athlete. Imported
 * athletes used to receive a new local id, so old data needs a conservative
 * fallback based on the fields that both copies still share.
 */
export function findAthleteRemovalIndexes(cloudAthletes, athleteRefs) {
  const availableIndexes = new Set(cloudAthletes.map((_, index) => index));
  const matchedIndexes = [];

  for (const ref of athleteRefs) {
    const cloudId = ref?.cloudAthleteId || ref?.sourceAthleteId;
    if (cloudId) {
      const idMatches = [...availableIndexes].filter(
        (index) => String(cloudAthletes[index]?.id || '') === String(cloudId)
      );
      if (idMatches.length === 1) {
        matchedIndexes.push(idMatches[0]);
        availableIndexes.delete(idMatches[0]);
        continue;
      }
    }

    const name = normalizeAthleteText(ref?.name);
    if (!name) continue;
    const nameMatches = [...availableIndexes].filter(
      (index) => normalizeAthleteText(cloudAthletes[index]?.name) === name
    );

    let candidates = nameMatches;
    if (candidates.length > 1) {
      const birthAndEventMatches = candidates.filter(
        (index) => sameBirth(cloudAthletes[index], ref) && sameEvent(cloudAthletes[index], ref)
      );
      const eventMatches = candidates.filter((index) => sameEvent(cloudAthletes[index], ref));
      const birthMatches = candidates.filter((index) => sameBirth(cloudAthletes[index], ref));
      if (birthAndEventMatches.length === 1) candidates = birthAndEventMatches;
      else if (eventMatches.length === 1) candidates = eventMatches;
      else if (birthMatches.length === 1) candidates = birthMatches;
    }

    // A unique name within one club is sufficient. This also handles an admin
    // correcting the birth date or moving the athlete to a renamed category.
    if (candidates.length !== 1) continue;
    matchedIndexes.push(candidates[0]);
    availableIndexes.delete(candidates[0]);
  }

  return matchedIndexes;
}
