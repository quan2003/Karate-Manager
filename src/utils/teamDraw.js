function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  const configuredSize = isKata
    ? settings.kata
    : isFemale
      ? settings.kumiteFemale ?? settings.kumite
      : settings.kumiteMale ?? settings.kumite;

  const fallbackSize = 3;
  const teamSize = Number(configuredSize) || fallbackSize;
  return Math.max(1, Math.floor(teamSize));
}

function splitMembersIntoFullTeams(members, targetSize) {
  const teams = [];
  const fullTeamCount = Math.floor(members.length / targetSize);

  for (let index = 0; index < fullTeamCount; index += 1) {
    const start = index * targetSize;
    teams.push(members.slice(start, start + targetSize));
  }

  return teams;
}

export function isTeamCategory(category = {}) {
  const name = normalizeText(category.name);
  return (
    category.isTeam ||
    name.includes("dong doi") ||
    name.includes("hon hop") ||
    name.includes("team") ||
    (category.athletes || []).some((athlete) => athlete.isTeam)
  );
}

export function getTeamsFromAthletes(athletes = [], category = {}, tournament = {}) {
  const targetSize = getTeamSizeForCategory(category, tournament);
  const clubMap = new Map();

  athletes.forEach((athlete) => {
    const clubKey = (athlete.club || "Khong CLB").trim();
    if (!clubMap.has(clubKey)) clubMap.set(clubKey, []);
    clubMap.get(clubKey).push(athlete);
  });

  const teams = [];
  clubMap.forEach((members, clubKey) => {
    const memberGroups = splitMembersIntoFullTeams(members, targetSize);
    memberGroups.forEach((teamMembers, index) => {
      const teamNumber = index + 1;
      const idMembers = teamMembers.map((member) => member.id || member.name).join("_");

      teams.push({
        id: `team_${sanitizeIdPart(clubKey)}_${teamNumber}_${sanitizeIdPart(idMembers)}`,
        name: memberGroups.length > 1 ? `${clubKey} - Đội ${teamNumber}` : clubKey,
        club: clubKey,
        country: teamMembers[0]?.country || "VN",
        gender: teamMembers[0]?.gender,
        isTeam: true,
        teamNumber: memberGroups.length > 1 ? teamNumber : null,
        targetTeamSize: targetSize,
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
    );
  });
}

export function syncTeamBracketMembers(bracket, athletes = [], category = {}, tournament = {}) {
  if (!bracket?.isTeamBracket || !Array.isArray(bracket.matches)) return bracket;

  const teamsByClub = new Map();
  getTeamsFromAthletes(athletes, category, tournament).forEach((team) => {
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
