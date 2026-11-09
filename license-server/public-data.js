/* global require, module */
const crypto = require("crypto");

const text = (value, maxLength = 300) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

// Lịch thi đấu cũ có thể lưu số thảm là number, còn một số bản xuất file
// dùng matId/matNumber/tatamiId. Dữ liệu public cần chấp nhận các dạng này,
// nếu không website sẽ chỉ nhận được nhãn "Thảm" mà không có số thảm.
const matNumber = (assignment = {}, category = {}) => {
  const value = assignment.mat ?? category.matId ?? category.matNumber ?? category.tatamiId;
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, 20);
};

const publicId = (...parts) =>
  crypto.createHash("sha256").update(parts.map((part) => String(part || "")).join("\u001f")).digest("hex").slice(0, 20);

const slugify = (value) =>
  text(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "giai-dau";

const isoDate = (value) => {
  const normalized = text(value, 50);
  if (!normalized) return "";
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
};

const numberOrUndefined = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const participantName = (participant) => text(participant?.name || participant?.teamName, 200);
const participantClub = (participant) => text(participant?.club || participant?.unit, 200);
const participantId = (participant) => text(participant?.athleteId || participant?.id, 300);

function tournamentFromBackup(backupData, tournamentId) {
  const tournaments = backupData?.data?.tournaments;
  if (!Array.isArray(tournaments)) return null;
  return tournaments.find((item) => String(item?.id) === String(tournamentId)) || tournaments[0] || null;
}

function eventStatus(startDate, endDate, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  if (startDate && today < startDate) return "Sắp diễn ra";
  if (endDate && today > endDate) return "Đã kết thúc";
  return "Đang diễn ra";
}

function filterPublicRanking(items, query = {}) {
  const event = text(query.event || query.eventSlug, 300);
  const season = text(query.season, 10);
  const category = text(query.category, 300);
  const athleteId = text(query.athleteId, 300);
  return (Array.isArray(items) ? items : []).filter((item) =>
    (!event || item.eventSlug === event || item.eventId === event) &&
    (!season || String(item.season) === season) &&
    (!category || item.category === category) &&
    (!athleteId || item.athleteId === athleteId)
  );
}

const normalizedLookupValue = (value) => text(value, 300)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[đĐ]/g, "d")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

// Club labels in exported registrations are sometimes stored with an
// administrative prefix (for example, "Xã Lạc Sơn") and sometimes without it
// ("Lạc Sơn"). They identify the same club for a single tournament, while
// the original label remains the public display value.
const publicClubIdentity = (value) => normalizedLookupValue(value)
  .replace(/^(xa|phuong|thi tran)\s+/i, "");

function athleteProfileIdentity(athlete, club) {
  const stableId = text(
    athlete?.profileId || athlete?.personId || athlete?.athleteId || athlete?.sourceAthleteId,
    300,
  );
  if (stableId) return `source:${stableId}`;

  // Older tournament exports create a registration ID for every category.
  // The public profile must still stay within one athlete, club and
  // tournament. Birth year/gender only strengthen the internal hash; neither
  // value is included in the public DTO.
  const birthYear = text(athlete?.birthYear || athlete?.yearOfBirth || athlete?.birthDate, 50);
  const gender = text(athlete?.gender || athlete?.sex, 30);
  return `registration:${normalizedLookupValue(participantName(athlete))}\u001f${publicClubIdentity(club)}\u001f${birthYear}\u001f${normalizedLookupValue(gender)}`;
}

// Registration imports can assign a different source ID when the same person
// enters an individual event and a team event.  Build one identity map for a
// tournament before creating public IDs so those entries lead to one profile.
// We only do this when the name/club group has no conflicting biographical
// details; competitors with the same name at the same club remain separate.
function buildPublicProfileIdentityResolver(tournament) {
  const groups = new Map();
  for (const category of Array.isArray(tournament?.categories) ? tournament.categories : []) {
    for (const athlete of Array.isArray(category?.athletes) ? category.athletes : []) {
      const name = normalizedLookupValue(participantName(athlete));
      const club = publicClubIdentity(participantClub(athlete));
      if (!name || !club) continue;
      const key = `${name}\u001f${club}`;
      if (!groups.has(key)) groups.set(key, { birthYears: new Set(), genders: new Set() });
      const group = groups.get(key);
      const birthYear = text(athlete?.birthYear || athlete?.yearOfBirth || athlete?.birthDate, 50);
      const gender = normalizedLookupValue(athlete?.gender || athlete?.sex);
      if (birthYear) group.birthYears.add(birthYear);
      if (gender) group.genders.add(gender);
    }
  }

  return (athlete, club) => {
    const name = normalizedLookupValue(participantName(athlete));
    const clubIdentity = publicClubIdentity(club);
    const group = groups.get(`${name}\u001f${clubIdentity}`);
    if (name && clubIdentity && group && group.birthYears.size <= 1 && group.genders.size <= 1) {
    const profileId = text(athlete?.profileId || athlete?.personId, 300);
    if (profileId) return `source:${profileId}`;
    return `person:${name}\u001f${clubIdentity}`;
    }
    return athleteProfileIdentity(athlete, club);
  };
}

const sameLookupValue = (left, right) => {
  const normalizedLeft = normalizedLookupValue(left);
  const normalizedRight = normalizedLookupValue(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

function isTeamCategory(category) {
  return /\b(dong doi|team|teams)\b/.test(normalizedLookupValue(category?.name || category?.eventName));
}

function configuredTeamSize(category, tournament) {
  const configured = Number(category?.teamConfig?.main ?? category?.teamSize ?? tournament?.teamMedalsSettings?.kata);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 3;
}

function generatedTeamMembersForMedal(category, tournament, teamName, club) {
  if (!isTeamCategory(category)) return [];
  const members = Array.isArray(category?.athletes) ? category.athletes : [];
  const byClub = new Map();
  for (const member of members) {
    const memberClub = participantClub(member);
    if (!memberClub) continue;
    const key = normalizedLookupValue(memberClub);
    if (!byClub.has(key)) byClub.set(key, { club: memberClub, members: [] });
    byClub.get(key).members.push(member);
  }

  for (const { club: sourceClub, members: clubMembers } of byClub.values()) {
    const codedTeams = new Map();
    const uncodedMembers = [];
    for (const member of clubMembers) {
      const teamCode = text(member?.teamCode, 80);
      if (teamCode) {
        const key = normalizedLookupValue(teamCode);
        if (!codedTeams.has(key)) codedTeams.set(key, { code: teamCode, members: [] });
        codedTeams.get(key).members.push(member);
      } else {
        uncodedMembers.push(member);
      }
    }
    for (const { code, members: teamMembers } of codedTeams.values()) {
      if (sameLookupValue(`${sourceClub} - Đội ${code}`, teamName) && (!club || sameLookupValue(sourceClub, club))) return teamMembers;
    }
    const teamSize = configuredTeamSize(category, tournament);
    const groupCount = Math.floor(uncodedMembers.length / teamSize);
    for (let index = 0; index < groupCount; index += 1) {
      const teamMembers = uncodedMembers.slice(index * teamSize, (index + 1) * teamSize);
      const label = groupCount > 1 || codedTeams.size > 0 ? `${sourceClub} - Đội ${index + 1}` : sourceClub;
      if (sameLookupValue(label, teamName) && (!club || sameLookupValue(sourceClub, club))) return teamMembers;
    }
  }
  return [];
}

function teamMembersForMedal(category, tournament, position, teamName, club) {
  const savedTeam = tournament?.categoryResults?.[category?.id]?.awardTeams?.[position];
  if (Array.isArray(savedTeam?.members) && savedTeam.members.length) return savedTeam.members;

  const participants = [
    ...(Array.isArray(category?.bracket?.matches) ? category.bracket.matches : []),
    ...(Array.isArray(category?.bracket?.auxiliaryMatches) ? category.bracket.auxiliaryMatches : []),
  ].flatMap((match) => [match?.athlete1, match?.athlete2, match?.winner]);
  const team = participants.find((participant) =>
    participant?.isTeam === true &&
    Array.isArray(participant?.members) &&
    participant.members.length > 0 &&
    sameLookupValue(participantName(participant), teamName) &&
    (!club || !participantClub(participant) || sameLookupValue(participantClub(participant), club))
  );
  return Array.isArray(team?.members) ? team.members : generatedTeamMembersForMedal(category, tournament, teamName, club);
}

function buildMedalLookup(summary, tournament) {
  const lookup = new Map();
  const labels = [
    ["gold", "goldClub", "Huy chương vàng", "first"],
    ["silver", "silverClub", "Huy chương bạc", "second"],
    ["bronze1", "bronze1Club", "Huy chương đồng", "third1"],
    ["bronze2", "bronze2Club", "Huy chương đồng", "third2"],
  ];
  for (const medal of Array.isArray(summary?.medalists) ? summary.medalists : []) {
    if (!text(medal?.confirmedAt, 50)) continue;
    const category = text(medal?.categoryName, 300);
    const sourceCategory = (Array.isArray(tournament?.categories) ? tournament.categories : []).find((item) =>
      (medal?.categoryId && String(item?.id) === String(medal.categoryId)) ||
      sameLookupValue(item?.name || item?.eventName, category)
    );
    for (const [nameKey, clubKey, label, position] of labels) {
      const name = text(medal?.[nameKey], 200);
      const club = text(medal?.[clubKey], 200);
      const athleteId = text(medal?.[`${nameKey}AthleteId`], 300);
      if (athleteId) lookup.set(`id:${athleteId}\u001f${category}`, label);
      // Team results store the team name rather than an individual athlete ID.
      // Publish the confirmed medal on every listed member's public profile.
      if (!athleteId && sourceCategory && name) {
        for (const member of teamMembersForMedal(sourceCategory, tournament, position, name, club)) {
          const memberId = participantId(member);
          if (memberId) lookup.set(`id:${memberId}\u001f${category}`, label);
        }
      }
    }
  }
  return lookup;
}

function completedCategoryNames(summary) {
  return new Set(
    (Array.isArray(summary?.medalists) ? summary.medalists : [])
      .filter((medal) => text(medal?.confirmedAt, 50))
      .map((medal) => text(medal?.categoryName, 300))
      .filter(Boolean)
  );
}

function hasCompletedStatus(value) {
  const normalized = text(value, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
  return ["finished", "completed", "closed", "done", "complete", "da thi dau xong", "hoan thanh", "da xong"].includes(normalized);
}

function buildMatches(tournament, event, summary) {
  const matches = [];
  const completedCategories = completedCategoryNames(summary);
  for (const category of Array.isArray(tournament?.categories) ? tournament.categories : []) {
    const categoryName = text(category?.name || category?.eventName, 300);
    const categoryCompleted = hasCompletedStatus(category?.status) || completedCategories.has(categoryName);
    const assignment = tournament?.schedule?.[category?.id] || {};
    const date = isoDate(assignment.date || event.date);
    const time = /^\d{2}:\d{2}$/.test(text(assignment.time, 5)) ? text(assignment.time, 5) : "";
    const tatami = matNumber(assignment, category);
    const categoryMatches = [
      ...(Array.isArray(category?.bracket?.matches) ? category.bracket.matches : []),
      ...(Array.isArray(category?.bracket?.auxiliaryMatches) ? category.bracket.auxiliaryMatches : []),
    ];

    for (const match of categoryMatches) {
      if (!match || match.isBye === true) continue;
      const red = participantName(match.athlete1);
      const blue = participantName(match.athlete2);
      if (!red && !blue) continue;
      // Kata can be finalized directly in the results tab, without a winner
      // assigned to every bracket row. A category with confirmed medals is no
      // longer an upcoming schedule item.
      const finished = match.resultStatus !== "UNDER_APPEAL" && (Boolean(match.winner) || categoryCompleted);
      const state = finished ? "Đã kết thúc" : "Sắp diễn ra";
      const item = {
        id: publicId(event.slug, category?.id, match.id || match.matchCode),
        time,
        date,
        tatami: tatami ? `Thảm ${tatami}` : "",
        category: categoryName,
        red,
        blue,
        state,
        eventSlug: event.slug,
        eventName: event.name,
      };
      if (finished) {
        const redScore = numberOrUndefined(match.score1 ?? match.akaScore ?? match.redScore);
        const blueScore = numberOrUndefined(match.score2 ?? match.aoScore ?? match.blueScore);
        if (redScore !== undefined) item.redScore = redScore;
        if (blueScore !== undefined) item.blueScore = blueScore;
      }
      matches.push(item);
    }
  }
  return matches;
}

function buildAthleteCompetitionStats(tournament) {
  const stats = new Map();
  const ensure = (athleteId) => {
    if (!athleteId) return null;
    if (!stats.has(athleteId)) stats.set(athleteId, { totalMatches: 0, wins: 0 });
    return stats.get(athleteId);
  };

  for (const category of Array.isArray(tournament?.categories) ? tournament.categories : []) {
    const matches = [
      ...(Array.isArray(category?.bracket?.matches) ? category.bracket.matches : []),
      ...(Array.isArray(category?.bracket?.auxiliaryMatches) ? category.bracket.auxiliaryMatches : []),
    ];
    for (const match of matches) {
      if (!match || match.isBye === true || !match.winner || match.resultStatus === "UNDER_APPEAL") continue;
      const firstId = participantId(match.athlete1);
      const secondId = participantId(match.athlete2);
      const winnerId = participantId(match.winner);
      const first = ensure(firstId);
      const second = ensure(secondId);
      if (first) first.totalMatches += 1;
      if (second) second.totalMatches += 1;
      const winner = ensure(winnerId);
      if (winner) winner.wins += 1;
    }
  }
  return stats;
}

/**
 * Convert a private cloud backup into an intentionally small public DTO.
 * Never copy arbitrary source fields here: every returned key is an allowlisted
 * website field, so birth dates, contact details, check-in/weight data, license
 * data, machine IDs and operational metadata cannot cross the public boundary.
 */
function createPublicTournamentData({ tournamentId, tournamentName, startDate, endDate, location, backupData, summary }) {
  const tournament = tournamentFromBackup(backupData, tournamentId) || {};
  const safeStartDate = isoDate(startDate || tournament.startDate || tournament.date);
  const safeEndDate = isoDate(endDate || tournament.endDate || tournament.date || safeStartDate);
  const slug = `${slugify(tournamentName || tournament.name)}-${publicId(tournamentId).slice(0, 8)}`;
  const categories = (Array.isArray(tournament.categories) ? tournament.categories : [])
    .map((category) => text(category?.name || category?.eventName, 300))
    .filter(Boolean);
  const disciplines = new Set(
    (Array.isArray(tournament.categories) ? tournament.categories : [])
      .map((category) => text(category?.type, 30).toLowerCase())
      .map((type) => type === "kata" ? "Kata" : type === "kumite" ? "Kumite" : "")
      .filter(Boolean)
  );
  const event = {
    id: publicId("event", tournamentId),
    slug,
    name: text(tournamentName || tournament.name, 500),
    discipline: [...disciplines].join(" & ") || "Karate",
    location: text(location || tournament.location, 500),
    date: safeStartDate,
    endDate: safeEndDate,
    status: eventStatus(safeStartDate, safeEndDate),
    categories,
  };

  const medalLookup = buildMedalLookup(summary, tournament);
  const competitionStats = buildAthleteCompetitionStats(tournament);
  const resolveProfileIdentity = buildPublicProfileIdentityResolver(tournament);
  const athletes = [];
  const athleteKeys = new Set();
  const clubs = new Map();
  for (const category of Array.isArray(tournament.categories) ? tournament.categories : []) {
    const categoryName = text(category?.name || category?.eventName, 300);
    for (const athlete of Array.isArray(category?.athletes) ? category.athletes : []) {
      const name = participantName(athlete);
      const club = participantClub(athlete);
      if (!name) continue;
      const sourceAthleteId = text(athlete?.athleteId || athlete?.id, 300);
      const key = `${sourceAthleteId}\u001f${categoryName}`;
      if (!athleteKeys.has(key)) {
        athleteKeys.add(key);
        const publicResult = medalLookup.get(`id:${sourceAthleteId}\u001f${categoryName}`);
        const clubIdentity = publicClubIdentity(club);
        const durableProfileId = text(athlete?.profileId || athlete?.personId, 300);
        const athleteId = publicId("athlete", durableProfileId || resolveProfileIdentity(athlete, club));
        const countryCode = text(athlete?.country || athlete?.nationality || athlete?.nation, 4)
          .toUpperCase()
          .replace(/[^A-Z]/g, "");
        const recordedStats = competitionStats.get(sourceAthleteId) || { totalMatches: 0, wins: 0 };
        // Kata is often confirmed directly by a result panel rather than a
        // head-to-head bracket. Treat one confirmed Kata result as one
        // completed performance so its public record is not shown as empty.
        const stats = recordedStats.totalMatches === 0 && publicResult && text(category?.type, 30).toLowerCase() === "kata"
          ? { totalMatches: 1, wins: 1 }
          : recordedStats;
        athletes.push({
          id: athleteId,
          athleteCode: `${countryCode || "VDV"}-${athleteId.slice(0, 8).toUpperCase()}`,
          name,
          clubId: club ? publicId("club", clubIdentity) : undefined,
          club,
          category: categoryName,
          eventId: event.id,
          eventSlug: event.slug,
          ...(text(athlete?.country || athlete?.nationality || athlete?.nation || athlete?.countryName, 100) ? { country: text(athlete?.country || athlete?.nationality || athlete?.nation || athlete?.countryName, 100) } : {}),
          totalMatches: stats.totalMatches,
          wins: stats.wins,
          winRate: stats.totalMatches > 0 ? Math.round((stats.wins / stats.totalMatches) * 1000) / 10 : null,
          ...(publicResult ? { publicResult } : {}),
        });
      }
      if (club) clubs.set(club, (clubs.get(club) || 0) + 1);
    }
  }

  const ranking = athletes
    .filter((athlete) => athlete.publicResult)
    .map((athlete) => ({
      eventId: event.id,
      eventSlug: event.slug,
      eventName: event.name,
      eventDate: event.date,
      season: safeStartDate.slice(0, 4) || null,
      athleteId: athlete.id,
      name: athlete.name,
      clubId: athlete.clubId,
      club: athlete.club,
      category: athlete.category,
      medals: {
        gold: athlete.publicResult === "Huy chương vàng" ? 1 : 0,
        silver: athlete.publicResult === "Huy chương bạc" ? 1 : 0,
        bronze: athlete.publicResult === "Huy chương đồng" ? 1 : 0,
      },
      previousRank: null,
      rankDelta: null,
      points: athlete.publicResult === "Huy chương vàng" ? 3 : athlete.publicResult === "Huy chương bạc" ? 2 : 1,
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "vi") || b.points - a.points || a.name.localeCompare(b.name, "vi") || a.athleteId.localeCompare(b.athleteId));

  let previousCategory = null;
  let categoryRank = 0;
  ranking.forEach((entry) => {
    if (entry.category !== previousCategory) {
      previousCategory = entry.category;
      categoryRank = 0;
    }
    categoryRank += 1;
    entry.rank = categoryRank;
  });

  return {
    schemaVersion: 2,
    event,
    schedule: buildMatches(tournament, event, summary).filter((match) => match.state !== "Đã kết thúc"),
    results: buildMatches(tournament, event, summary).filter((match) => match.state === "Đã kết thúc"),
    athletes,
    clubs: [...clubs.entries()].map(([name, athleteCount]) => ({
      id: publicId("club", publicClubIdentity(name)),
      name,
      region: "",
      athleteCount,
    })),
    ranking,
  };
}

module.exports = { createPublicTournamentData, filterPublicRanking, publicId, slugify };
