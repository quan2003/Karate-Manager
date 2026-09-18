function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_CLASSIFICATION_FIELDS = [
  "isTeamEvent",
  "isTeam",
  "teamEvent",
  "competitionType",
  "categoryType",
  "eventType",
  "participationType",
  "eventFormat",
];

function classifyCompetitionValue(value, booleanField = false) {
  if (typeof value === "boolean") return value ? "team" : "individual";
  if (booleanField && (value === 1 || value === 0)) {
    return value === 1 ? "team" : "individual";
  }

  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/\b(ca nhan|individual|single|solo)\b/.test(normalized)) return "individual";
  if (/\b(dong doi|doi|team|teams|group)\b/.test(normalized)) return "team";
  if (booleanField && ["true", "yes", "co"].includes(normalized)) return "team";
  if (booleanField && ["false", "no", "khong"].includes(normalized)) return "individual";
  return null;
}

export function getCategoryCompetitionType(category = {}) {
  for (const field of TEAM_CLASSIFICATION_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(category, field)) continue;
    const classified = classifyCompetitionValue(
      category[field],
      field === "isTeamEvent" || field === "isTeam" || field === "teamEvent"
    );
    if (classified) return classified;
  }

  // Legacy data may not have a classification field. Only then use the name.
  return classifyCompetitionValue(category.name) || "individual";
}

function sanitizeIdPart(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "team";
}

export function getTeamSizeForCategory(category = {}, tournament = {}) {
  const name = normalizeText(category.name);
  const type = normalizeText(category.type);
  const isKata = type === "kata" || name.includes("kata");
  const gender = normalizeText(category.gender);
  const isFemale = gender === "female" || /\bnu\b/.test(name);
  const settings = tournament.teamMedalsSettings || {};
  const teamConfig = category.teamConfig || {};
  const categoryMain = Number(teamConfig.main);
  const categoryReserve = Number(teamConfig.reserve);
  const categorySize = categoryMain > 0
    ? categoryMain + Math.max(0, categoryReserve || 0)
    : Number(category.teamSize);
  const configuredSize = categorySize > 0
    ? categorySize
    : isKata
      ? settings.kata
      : isFemale
        ? Number(settings.kumiteFemaleMain ?? 3) + Number(settings.kumiteFemaleReserve ?? Math.max(0, Number(settings.kumiteFemale ?? settings.kumite ?? 3) - 3))
        : Number(settings.kumiteMaleMain ?? 3) + Number(settings.kumiteMaleReserve ?? Math.max(0, Number(settings.kumiteMale ?? settings.kumite ?? 3) - 3));

  const fallbackSize = 3;
  const teamSize = Number(configuredSize) || fallbackSize;
  return Math.max(1, Math.floor(teamSize));
}

export function getTeamFormationSize(category = {}, tournament = {}) {
  const name = normalizeText(category.name);
  const type = normalizeText(category.type);
  const isKata = type === "kata" || name.includes("kata");
  const gender = normalizeText(category.gender);
  const isFemale = gender === "female" || /\bnu\b/.test(name);
  const settings = tournament.teamMedalsSettings || {};
  const teamConfig = category.teamConfig || {};
  const categoryMain = Number(teamConfig.main);
  if (categoryMain > 0) return Math.max(1, Math.floor(categoryMain));

  const configuredMain = isKata
    ? settings.kata
    : isFemale
      ? (settings.kumiteFemaleMain ?? 3)
      : (settings.kumiteMaleMain ?? 3);

  const fallbackSize = 3;
  const mainSize = Number(configuredMain) || fallbackSize;
  return Math.max(1, Math.floor(mainSize));
}

export function getTeamReserveSize(category = {}, tournament = {}) {
  const name = normalizeText(category.name);
  const type = normalizeText(category.type);
  const isKata = type === "kata" || name.includes("kata");
  const gender = normalizeText(category.gender);
  const isFemale = gender === "female" || /\bnu\b/.test(name);
  const settings = tournament.teamMedalsSettings || {};
  const configuredReserve = Number(category.teamConfig?.reserve);

  if (Number.isFinite(configuredReserve) && configuredReserve >= 0) {
    return Math.floor(configuredReserve);
  }
  if (isKata) return 0;

  const reserve = isFemale
    ? settings.kumiteFemaleReserve ?? Math.max(0, Number(settings.kumiteFemale ?? settings.kumite ?? 3) - 3)
    : settings.kumiteMaleReserve ?? Math.max(0, Number(settings.kumiteMale ?? settings.kumite ?? 3) - 3);
  return Math.max(0, Math.floor(Number(reserve) || 0));
}

function getClubGroupingKey(value) {
  return normalizeText(value || "Khong CLB");
}

function splitMembersIntoTeams(members, mainSize, reserveSize) {
  const teamCount = Math.floor(members.length / mainSize);
  if (teamCount < 1) return [];

  // Registration order is: all official line-ups first, then reserves. Assigning
  // surplus athletes from the last team backwards keeps 7 athletes as
  // 3 + (3 official + 1 reserve), instead of the old incorrect 4 + 3 split.
  const teams = Array.from({ length: teamCount }, (_, index) =>
    members
      .slice(index * mainSize, (index + 1) * mainSize)
      .map((member) => ({ ...member, isReserve: false, teamRole: "main" }))
  );
  const reserves = members.slice(teamCount * mainSize);
  let reserveIndex = 0;
  for (let teamIndex = teamCount - 1; teamIndex >= 0 && reserveIndex < reserves.length; teamIndex -= 1) {
    for (let slot = 0; slot < reserveSize && reserveIndex < reserves.length; slot += 1) {
      teams[teamIndex].push({
        ...reserves[reserveIndex],
        isReserve: true,
        teamRole: "reserve",
      });
      reserveIndex += 1;
    }
  }
  return teams;
}

export function isTeamCategory(category = {}) {
  return getCategoryCompetitionType(category) === "team";
}

export function getTeamsFromAthletes(athletes = [], category = {}, tournament = {}, options = {}) {
  const targetSize = getTeamFormationSize(category, tournament);
  const reserveSize = getTeamReserveSize(category, tournament);
  const clubMap = new Map();
  const splitClubKeys = new Set((options.splitClubs || []).map(getClubGroupingKey));
  const autoSplit = options.autoSplit ?? true;

  athletes.forEach((athlete) => {
    const clubName = String(athlete.club || "Khong CLB").trim().replace(/\s+/g, " ");
    const groupingKey = getClubGroupingKey(clubName);
    if (!clubMap.has(groupingKey)) clubMap.set(groupingKey, { clubName, members: [] });
    clubMap.get(groupingKey).members.push(athlete);
  });

  const teams = [];
  clubMap.forEach(({ clubName, members }, groupingKey) => {
    if (members.length < targetSize) return;
    const shouldSplit = autoSplit || splitClubKeys.has(groupingKey);
    const memberGroups = shouldSplit
      ? splitMembersIntoTeams(members, targetSize, reserveSize)
      : [members.map((member, index) => ({
          ...member,
          isReserve: index >= targetSize,
          teamRole: index >= targetSize ? "reserve" : "main",
        }))];
    memberGroups.forEach((teamMembers, index) => {
      const teamNumber = index + 1;
      const idMembers = teamMembers.map((member) => member.id || member.name).join("_");

      teams.push({
        id: `team_${sanitizeIdPart(clubName)}_${teamNumber}_${sanitizeIdPart(idMembers)}`,
        name: memberGroups.length > 1 ? `${clubName} - Đội ${teamNumber}` : clubName,
        club: clubName,
        country: teamMembers[0]?.country || "VN",
        gender: teamMembers[0]?.gender,
        isTeam: true,
        teamNumber: memberGroups.length > 1 ? teamNumber : null,
        targetTeamSize: targetSize,
        reserveTeamSize: reserveSize,
        mainMembers: teamMembers.filter((member) => !member.isReserve),
        reserveMembers: teamMembers.filter((member) => member.isReserve),
        members: teamMembers,
      });
    });
  });

  return teams;
}

export function getTeamCountFromAthletes(athletes = [], category = {}, tournament = {}) {
  return getTeamsFromAthletes(athletes, category, tournament).length;
}

function getClubKey(value) {
  return normalizeText(value).trim();
}

function membersMatch(currentMembers = [], nextMembers = []) {
  if (currentMembers.length !== nextMembers.length) return false;
  return currentMembers.every((member, index) => {
    const nextMember = nextMembers[index];
    return (
      (member.id && nextMember?.id && member.id === nextMember.id) ||
      (!member.id && !nextMember?.id && member.name === nextMember?.name)
    ) && Boolean(member.isReserve) === Boolean(nextMember?.isReserve);
  });
}

export function syncTeamBracketMembers(bracket, athletes = [], category = {}, tournament = {}) {
  if (!bracket?.isTeamBracket || !Array.isArray(bracket.matches)) return bracket;

  const splitClubs = new Set();
  bracket.matches.forEach((match) => {
    [match.athlete1, match.athlete2, match.winner].forEach((participant) => {
      if (participant?.isTeam && participant.teamNumber) {
        splitClubs.add(participant.club || participant.name);
      }
    });
  });

  const teamsByClub = new Map();
  getTeamsFromAthletes(athletes, category, tournament, {
    splitClubs: Array.from(splitClubs),
  }).forEach((team) => {
    const clubKey = getClubKey(team.club || team.name);
    if (!teamsByClub.has(clubKey)) teamsByClub.set(clubKey, []);
    teamsByClub.get(clubKey).push(team);
  });

  let changed = false;
  const syncedParticipants = new Map();

  const syncParticipant = (participant) => {
    if (!participant?.isTeam) return participant;

    const participantKey = participant.id || `${participant.club || participant.name}:${participant.teamNumber || ""}`;
    if (syncedParticipants.has(participantKey)) return syncedParticipants.get(participantKey);

    const clubKey = getClubKey(participant.club || participant.name);
    const clubTeams = teamsByClub.get(clubKey) || [];
    const replacement =
      clubTeams.find((team) => team.teamNumber === participant.teamNumber) ||
      (!participant.teamNumber && clubTeams.length > 0 ? clubTeams[0] : null);

    if (!replacement) {
      changed = true;
      syncedParticipants.set(participantKey, null);
      return null;
    }

    if (membersMatch(participant.members || [], replacement.members || [])) {
      syncedParticipants.set(participantKey, participant);
      return participant;
    }

    changed = true;
    const synced = {
      ...participant,
      name: replacement.name,
      club: replacement.club,
      country: replacement.country,
      gender: replacement.gender,
      teamNumber: replacement.teamNumber,
      targetTeamSize: replacement.targetTeamSize,
      reserveTeamSize: replacement.reserveTeamSize,
      mainMembers: replacement.mainMembers,
      reserveMembers: replacement.reserveMembers,
      members: replacement.members,
    };
    syncedParticipants.set(participantKey, synced);
    return synced;
  };

  const matches = bracket.matches.map((match) => {
    const athlete1 = syncParticipant(match.athlete1);
    const athlete2 = syncParticipant(match.athlete2);
    const winner = syncParticipant(match.winner);

    if (
      athlete1 === match.athlete1 &&
      athlete2 === match.athlete2 &&
      winner === match.winner
    ) {
      return match;
    }

    return {
      ...match,
      athlete1,
      athlete2,
      winner,
    };
  });

  return changed ? { ...bracket, matches } : bracket;
}
