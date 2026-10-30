/* global require, module */
const crypto = require("crypto");

const text = (value, maxLength = 300) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

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

function buildMedalLookup(summary) {
  const lookup = new Map();
  const labels = [
    ["gold", "goldClub", "Huy chương vàng"],
    ["silver", "silverClub", "Huy chương bạc"],
    ["bronze1", "bronze1Club", "Huy chương đồng"],
    ["bronze2", "bronze2Club", "Huy chương đồng"],
  ];
  for (const medal of Array.isArray(summary?.medalists) ? summary.medalists : []) {
    if (!text(medal?.confirmedAt, 50)) continue;
    const category = text(medal?.categoryName, 300);
    for (const [nameKey, clubKey, label] of labels) {
      const name = text(medal?.[nameKey], 200);
      const club = text(medal?.[clubKey], 200);
      const athleteId = text(medal?.[`${nameKey}AthleteId`], 300);
      if (athleteId) lookup.set(`id:${athleteId}\u001f${category}`, label);
    }
  }
  return lookup;
}

function buildMatches(tournament, event) {
  const matches = [];
  for (const category of Array.isArray(tournament?.categories) ? tournament.categories : []) {
    const categoryName = text(category?.name || category?.eventName, 300);
    const assignment = tournament?.schedule?.[category?.id] || {};
    const date = isoDate(assignment.date || event.date);
    const time = /^\d{2}:\d{2}$/.test(text(assignment.time, 5)) ? text(assignment.time, 5) : "";
    const tatami = text(assignment.mat, 20);
    const categoryMatches = [
      ...(Array.isArray(category?.bracket?.matches) ? category.bracket.matches : []),
      ...(Array.isArray(category?.bracket?.auxiliaryMatches) ? category.bracket.auxiliaryMatches : []),
    ];

    for (const match of categoryMatches) {
      if (!match || match.isBye === true) continue;
      const red = participantName(match.athlete1);
      const blue = participantName(match.athlete2);
      if (!red && !blue) continue;
      const finished = Boolean(match.winner) && match.resultStatus !== "UNDER_APPEAL";
      const state = finished ? "Đã kết thúc" : "Sắp diễn ra";
      const item = {
        id: publicId(event.slug, category?.id, match.id || match.matchCode),
        time,
        date,
        tatami: tatami ? `Tatami ${tatami}` : "",
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

  const medalLookup = buildMedalLookup(summary);
  const competitionStats = buildAthleteCompetitionStats(tournament);
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
        const athleteId = publicId("athlete", sourceAthleteId);
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
          clubId: club ? publicId("club", club) : undefined,
          club,
          category: categoryName,
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
    schedule: buildMatches(tournament, event).filter((match) => match.state !== "Đã kết thúc"),
    results: buildMatches(tournament, event).filter((match) => match.state === "Đã kết thúc"),
    athletes,
    clubs: [...clubs.entries()].map(([name, athleteCount]) => ({
      id: publicId("club", name),
      name,
      region: "",
      athleteCount,
    })),
    ranking,
  };
}

module.exports = { createPublicTournamentData, filterPublicRanking, publicId, slugify };
