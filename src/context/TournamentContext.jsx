/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { createAutoBackup } from "../services/backupService";
import { dbGetTournaments, dbSaveTournaments, runMigrationIfNeeded } from "../services/dbService";
import { updateMatchResult } from "../utils/drawEngine";

// Auto-backup counter to avoid backing up too frequently
let autoBackupCounter = 0;
const AUTO_BACKUP_INTERVAL = 5; // Backup every N important changes

const TournamentContext = createContext(null);
const TournamentDispatchContext = createContext(null);

// Không còn dùng localStorage key trực tiếp - SQLite quản lý

// Initial state
const initialState = {
  tournaments: [],
  currentTournament: null,
  currentCategory: null,
};

function normalizeCategoryImportKey(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildImportedCategory(cat, existingCategory = null) {
  return {
    ...(existingCategory || {}),
    id: existingCategory?.id || uuidv4(),
    name: cat.name,
    type: cat.type,
    isTeam: cat.isTeam || false,
    weightClass: cat.weightClass || "",
    ageGroup: cat.ageGroup || "",
    gender: cat.gender || "male",
    athletes: existingCategory?.athletes || [],
    bracket: existingCategory?.bracket || null,
    format: cat.format || existingCategory?.format || "single_elimination",
  };
}

function getParticipantRestoreKey(athlete) {
  if (athlete?.id) return `id:${athlete.id}`;
  return [
    "fallback",
    athlete?.name || "",
    athlete?.club || "",
    athlete?.birthDate || athlete?.birthYear || "",
  ]
    .join("|")
    .normalize("NFC")
    .toLowerCase();
}

function normalizeRestoredAthlete(athlete, fallbackClub = "") {
  return {
    id: athlete.id || uuidv4(),
    name: athlete.name || "",
    gender: athlete.gender || null,
    birthDate: athlete.birthDate || null,
    birthYear: athlete.birthYear || null,
    club: athlete.club || fallbackClub || "",
    country: athlete.country || "VN",
    weight: athlete.weight || null,
    isTeam: athlete.isTeam || false,
    seed: athlete.seed || null,
    flagUrl: athlete.flagUrl || null,
  };
}

function extractAthletesFromBracket(bracket) {
  const restored = new Map();
  const addAthlete = (athlete, fallbackClub = "") => {
    if (!athlete?.name) return;
    const normalized = normalizeRestoredAthlete(athlete, fallbackClub);
    restored.set(getParticipantRestoreKey(normalized), normalized);
  };

  (bracket?.matches || []).forEach((match) => {
    [match.athlete1, match.athlete2, match.winner].forEach((participant) => {
      if (!participant) return;
      if (Array.isArray(participant.members) && participant.members.length > 0) {
        participant.members.forEach((member) => addAthlete(member, participant.club || participant.name));
      } else if (!participant.isTeam) {
        addAthlete(participant);
      }
    });
  });

  return Array.from(restored.values());
}

function syncParticipantAthlete(participant, updatedAthlete) {
  if (!participant) return { participant, changed: false };
  let changed = false;
  let nextParticipant = participant;

  if (participant.id === updatedAthlete.id) {
    nextParticipant = { ...nextParticipant, ...updatedAthlete };
    changed = true;
  }

  if (Array.isArray(participant.members)) {
    const nextMembers = participant.members.map((member) => {
      if (member.id !== updatedAthlete.id) return member;
      changed = true;
      return { ...member, ...updatedAthlete };
    });
    if (changed) nextParticipant = { ...nextParticipant, members: nextMembers };
  }

  return { participant: nextParticipant, changed };
}

function removeAthleteFromParticipant(participant, athleteId) {
  if (!participant) return { participant, changed: false };

  if (Array.isArray(participant.members)) {
    const nextMembers = participant.members.filter((member) => member.id !== athleteId);
    if (nextMembers.length === participant.members.length) {
      return { participant, changed: false };
    }
    if (nextMembers.length === 0) {
      return { participant: null, changed: true };
    }
    return {
      participant: { ...participant, members: nextMembers },
      changed: true,
    };
  }

  if (participant.id === athleteId) {
    return { participant: null, changed: true };
  }

  return { participant, changed: false };
}

function syncAthleteInBracket(bracket, updatedAthlete) {
  if (!bracket?.matches) return bracket;
  const updatedMatches = bracket.matches.map((match) => {
    let changed = false;
    const nextMatch = { ...match };

    ["athlete1", "athlete2", "winner"].forEach((field) => {
      const synced = syncParticipantAthlete(match[field], updatedAthlete);
      if (synced.changed) {
        nextMatch[field] = synced.participant;
        changed = true;
      }
    });

    return changed ? nextMatch : match;
  });

  return { ...bracket, matches: updatedMatches };
}

function removeAthleteFromBracket(bracket, athleteId) {
  if (!bracket?.matches) return bracket;
  const updatedMatches = bracket.matches.map((match) => {
    let changed = false;
    const nextMatch = { ...match };

    ["athlete1", "athlete2", "winner"].forEach((field) => {
      const removed = removeAthleteFromParticipant(match[field], athleteId);
      if (removed.changed) {
        nextMatch[field] = removed.participant;
        changed = true;
      }
    });

    if (match.winnerId === athleteId) {
      nextMatch.winnerId = null;
      nextMatch.winner = null;
      changed = true;
    }

    return changed ? nextMatch : match;
  });

  return { ...bracket, matches: updatedMatches };
}

function bracketHasParticipants(bracket) {
  return (bracket?.matches || []).some(
    (match) => match?.athlete1 || match?.athlete2 || match?.winner || match?.winnerId
  );
}

function addAthleteToExistingTeamBracket(bracket, athlete) {
  if (!bracket?.isTeamBracket || !bracket.matches || !athlete?.club) return bracket;

  const clubKey = athlete.club.trim().toLowerCase();
  const teamIds = new Set();
  bracket.matches.forEach((match) => {
    ["athlete1", "athlete2", "winner"].forEach((field) => {
      const participant = match[field];
      const participantClub = (participant?.club || participant?.name || "").trim().toLowerCase();
      if (participant?.isTeam && participantClub === clubKey) {
        teamIds.add(participant.id || participant.name);
      }
    });
  });

  if (teamIds.size !== 1) return bracket;
  const [targetTeamId] = Array.from(teamIds);

  const updatedMatches = bracket.matches.map((match) => {
    let changed = false;
    const nextMatch = { ...match };

    ["athlete1", "athlete2", "winner"].forEach((field) => {
      const participant = match[field];
      const participantId = participant?.id || participant?.name;
      if (!participant?.isTeam || participantId !== targetTeamId) return;

      const members = Array.isArray(participant.members) ? participant.members : [];
      if (members.some((member) => member.id === athlete.id)) return;

      nextMatch[field] = {
        ...participant,
        members: [...members, athlete],
      };
      changed = true;
    });

    return changed ? nextMatch : match;
  });

  return { ...bracket, matches: updatedMatches };
}

// Actions
const ACTIONS = {
  LOAD_DATA: "LOAD_DATA",
  ADD_TOURNAMENT: "ADD_TOURNAMENT",
  UPDATE_TOURNAMENT: "UPDATE_TOURNAMENT",
  DELETE_TOURNAMENT: "DELETE_TOURNAMENT",
  SET_CURRENT_TOURNAMENT: "SET_CURRENT_TOURNAMENT",
  ADD_CATEGORY: "ADD_CATEGORY",
  UPDATE_CATEGORY: "UPDATE_CATEGORY",
  DELETE_CATEGORY: "DELETE_CATEGORY",
  SET_CURRENT_CATEGORY: "SET_CURRENT_CATEGORY",
  ADD_ATHLETE: "ADD_ATHLETE",
  UPDATE_ATHLETE: "UPDATE_ATHLETE",
  DELETE_ATHLETE: "DELETE_ATHLETE",
  REMOVE_WITHDRAWN_ATHLETES: "REMOVE_WITHDRAWN_ATHLETES",
  SET_BRACKET: "SET_BRACKET",
  UPDATE_MATCH: "UPDATE_MATCH",
  IMPORT_ATHLETES: "IMPORT_ATHLETES",
  IMPORT_CATEGORIES: "IMPORT_CATEGORIES",
  UPDATE_SCHEDULE: "UPDATE_SCHEDULE",
  UPDATE_CUSTOM_EVENTS: "UPDATE_CUSTOM_EVENTS",
  UPDATE_SPONSOR_LOGOS: "UPDATE_SPONSOR_LOGOS",
  UPDATE_CLUB_REGISTRATIONS: "UPDATE_CLUB_REGISTRATIONS",
  MOVE_ATHLETE: "MOVE_ATHLETE",
  SYNC_MATCH_RESULT: "SYNC_MATCH_RESULT",
  SYNC_CATEGORY_MEDALS: "SYNC_CATEGORY_MEDALS",
  CLEAR_TOURNAMENT_ATHLETES: "CLEAR_TOURNAMENT_ATHLETES",
  RESTORE_ATHLETES_FROM_BRACKET: "RESTORE_ATHLETES_FROM_BRACKET",
};

function tournamentReducer(state, action) {
  let newState;

  switch (action.type) {
    case ACTIONS.CLEAR_TOURNAMENT_ATHLETES:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload
            ? {
                ...t,
                categories: t.categories.map((c) => ({
                  ...c,
                  athletes: [],
                  bracket: null, // Also reset brackets to be safe
                })),
                clubRegistrations: {}, // Also reset registrations
              }
            : t
        ),
      };
      if (state.currentTournament?.id === action.payload) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload
        );
      }
      break;
    case ACTIONS.LOAD_DATA: {
      return {
        ...state,
        ...action.payload,
      };
    }

    case ACTIONS.ADD_TOURNAMENT:
      newState = {
        ...state,
        tournaments: [
          ...state.tournaments,
          {
            id: uuidv4(),
            name: action.payload.name,
            date: action.payload.date || action.payload.startDate,
            startDate: action.payload.startDate || action.payload.date,
            endDate:
              action.payload.endDate ||
              action.payload.startDate ||
              action.payload.date,
            location: action.payload.location,
            categories: [],
            createdAt: new Date().toISOString(),
          },
        ],
      };
      break;

    case ACTIONS.UPDATE_TOURNAMENT:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.id ? { ...t, ...action.payload } : t
        ),
      };
      if (state.currentTournament?.id === action.payload.id) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.id
        );
      }
      break;

    case ACTIONS.DELETE_TOURNAMENT:
      newState = {
        ...state,
        tournaments: state.tournaments.filter((t) => t.id !== action.payload),
        currentTournament:
          state.currentTournament?.id === action.payload
            ? null
            : state.currentTournament,
      };
      break;

    case ACTIONS.SET_CURRENT_TOURNAMENT:
      newState = {
        ...state,
        currentTournament:
          state.tournaments.find((t) => t.id === action.payload) || null,
        currentCategory: null,
      };
      break;

    case ACTIONS.ADD_CATEGORY:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? {
                ...t,
                categories: [
                  ...t.categories,
                  {
                    id: uuidv4(),
                    name: action.payload.name,
                    type: action.payload.type, // 'kumite' or 'kata'
                    weightClass: action.payload.weightClass,
                    ageGroup: action.payload.ageGroup,
                    gender: action.payload.gender,
                    athletes: [],
                    bracket: null,
                    format: action.payload.format || "single_elimination", // or 'repechage'
                  },
                ],
              }
            : t
        ),
      };
      // Update currentTournament if it matches
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.IMPORT_CATEGORIES:
      // Import hạng mục theo kiểu sync: Excel là danh sách nguồn.
      // Trùng tên thì cập nhật và giữ VĐV/bracket cũ; không còn trong Excel thì bỏ khỏi danh sách.
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => {
          if (t.id !== action.payload.tournamentId) return t;

          const existingByName = new Map();
          t.categories.forEach((cat) => {
            const key = normalizeCategoryImportKey(cat.name);
            if (key) existingByName.set(key, cat);
          });

          const syncedCategories = Array.from(
            new Map(
              (action.payload.categories || [])
                .map((cat) => [normalizeCategoryImportKey(cat.name), cat])
                .filter(([key]) => key)
            ).entries()
          ).map(([key, cat]) => buildImportedCategory(cat, existingByName.get(key)));

          return {
            ...t,
            categories: syncedCategories,
          };
        }),
      };
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.UPDATE_CATEGORY:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) =>
            c.id === action.payload.id ? { ...c, ...action.payload } : c
          ),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory?.id === action.payload.id) {
        newState.currentCategory = {
          ...state.currentCategory,
          ...action.payload,
        };
      }
      break;

    case ACTIONS.DELETE_CATEGORY:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.filter((c) => c.id !== action.payload),
        })),
        currentCategory:
          state.currentCategory?.id === action.payload
            ? null
            : state.currentCategory,
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      break;

    case ACTIONS.SET_CURRENT_CATEGORY:
      const category = state.currentTournament?.categories.find(
        (c) => c.id === action.payload
      );
      newState = {
        ...state,
        currentCategory: category || null,
      };
      break;

    case ACTIONS.ADD_ATHLETE: {
      const newAthlete = {
        id: uuidv4(),
        name: action.payload.name,
        gender: action.payload.gender || null,
        birthDate: action.payload.birthDate || null,
        club: action.payload.club,
        country: action.payload.country || "VN",
        weight: action.payload.weight || null,
        isTeam: action.payload.isTeam || false,
        seed: action.payload.seed || null,
        flagUrl: action.payload.flagUrl || null,
      };
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) =>
            c.id === action.payload.categoryId
              ? {
                  ...c,
                  athletes: [...c.athletes, newAthlete],
                  bracket: addAthleteToExistingTeamBracket(c.bracket, newAthlete),
                }
              : c
          ),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory?.id === action.payload.categoryId) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === action.payload.categoryId
        );
      }
      break;
    }

    case ACTIONS.UPDATE_ATHLETE: {
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            athletes: c.athletes.map((a) =>
              a.id === action.payload.id ? { ...a, ...action.payload } : a
            ),
            bracket: syncAthleteInBracket(c.bracket, action.payload),
          })),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === state.currentCategory.id
        );
      }
      break;
    }

    case ACTIONS.DELETE_ATHLETE:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => {
            const athletes = c.athletes.filter((a) => a.id !== action.payload);
            const bracket = removeAthleteFromBracket(c.bracket, action.payload);
            return {
              ...c,
              athletes,
              bracket: athletes.length === 0 && !bracketHasParticipants(bracket) ? null : bracket,
            };
          }),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === state.currentCategory.id
        );
      }
      break;

    case ACTIONS.REMOVE_WITHDRAWN_ATHLETES: {
      const { tournamentId, athleteIds } = action.payload;
      const removedIds = new Set(athleteIds || []);
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => {
          if (t.id !== tournamentId) return t;

          const categories = t.categories.map((c) => {
            const removedAthleteIds = c.athletes
              .filter((a) => removedIds.has(a.id))
              .map((a) => a.id);
            if (removedAthleteIds.length === 0) return c;

            const athletes = c.athletes.filter(
              (a) => !removedIds.has(a.id)
            );
            const bracket = removedAthleteIds.reduce(
              (currentBracket, athleteId) =>
                removeAthleteFromBracket(currentBracket, athleteId),
              c.bracket
            );

            return {
              ...c,
              athletes,
              bracket:
                athletes.length === 0 && !bracketHasParticipants(bracket)
                  ? null
                  : bracket,
            };
          });

          return { ...t, categories };
        }),
      };
      if (state.currentTournament?.id === tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === tournamentId
        );
        if (state.currentCategory) {
          newState.currentCategory = newState.currentTournament?.categories.find(
            (c) => c.id === state.currentCategory.id
          );
        }
      }
      break;
    }

    case ACTIONS.MOVE_ATHLETE: {
      const { athleteId, newCategoryId } = action.payload;
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => {
          let athleteToMove = null;
          t.categories.forEach((c) => {
            const found = c.athletes.find((a) => a.id === athleteId);
            if (found) athleteToMove = found;
          });
          if (!athleteToMove) return t;

          return {
            ...t,
            categories: t.categories.map((c) => {
              if (c.id === newCategoryId) {
                if (c.athletes.some((a) => a.id === athleteId)) return c;
                return {
                  ...c,
                  athletes: [...c.athletes, athleteToMove],
                  bracket: addAthleteToExistingTeamBracket(c.bracket, athleteToMove),
                };
              }
              return {
                ...c,
                athletes: c.athletes.filter((a) => a.id !== athleteId),
                bracket: (() => {
                  if (!c.athletes.some((a) => a.id === athleteId)) return c.bracket;
                  const athletes = c.athletes.filter((a) => a.id !== athleteId);
                  const bracket = removeAthleteFromBracket(c.bracket, athleteId);
                  return athletes.length === 0 && !bracketHasParticipants(bracket) ? null : bracket;
                })(),
              };
            }),
          };
        }),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === state.currentCategory.id
        );
      }
      break;
    }

    case ACTIONS.IMPORT_ATHLETES:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) =>
            c.id === action.payload.categoryId
              ? {
                  ...c,
                  athletes: [
                    ...c.athletes,
                    ...action.payload.athletes
                      .filter(newA => !c.athletes.some(oldA => 
                        oldA.name.trim().normalize("NFC").toLowerCase() === newA.name.trim().normalize("NFC").toLowerCase() && 
                        (oldA.club || "").trim().normalize("NFC").toLowerCase() === (newA.club || "").trim().normalize("NFC").toLowerCase()
                      ))
                      .map((a) => ({
                        id: uuidv4(),
                        cloudAthleteId: a.cloudAthleteId || a.id || null,
                        name: a.name,
                        gender: a.gender || null,
                        birthDate: a.birthDate || null,
                        birthYear: a.birthYear || null,
                        club: a.club,
                        country: a.country || "VN",
                        weight: a.weight || null,
                        isTeam: a.isTeam || false,
                        seed: a.seed || null,
                        flagUrl: null,
                      })),
                  ],
                }
              : c
          ),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory?.id === action.payload.categoryId) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === action.payload.categoryId
        );
      }
      break;

    case ACTIONS.RESTORE_ATHLETES_FROM_BRACKET:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => {
            if (c.id !== action.payload.categoryId) return c;
            const restoredAthletes = extractAthletesFromBracket(c.bracket);
            if (restoredAthletes.length === 0) return c;
            return {
              ...c,
              athletes: restoredAthletes,
              restoredAthletesFromBracket: true,
            };
          }),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory?.id === action.payload.categoryId) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === action.payload.categoryId
        );
      }
      break;

    case ACTIONS.SET_BRACKET:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) =>
            c.id === action.payload.categoryId
              ? { ...c, bracket: action.payload.bracket }
              : c
          ),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory?.id === action.payload.categoryId) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === action.payload.categoryId
        );
      }
      break;

    case ACTIONS.UPDATE_MATCH:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => {
            if (!c.bracket) return c;
            return {
              ...c,
              bracket: {
                ...c.bracket,
                matches: c.bracket.matches.map((m) =>
                  m.id === action.payload.matchId
                    ? { ...m, ...action.payload.updates }
                    : m
                ),
              },
            };
          }),
        })),
      };
      if (state.currentTournament) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === state.currentTournament.id
        );
      }
      if (state.currentCategory) {
        newState.currentCategory = newState.currentTournament?.categories.find(
          (c) => c.id === state.currentCategory.id
        );
      }
      break;

    case ACTIONS.UPDATE_SCHEDULE:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? { ...t, schedule: action.payload.schedule }
            : t
        ),
      };
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.UPDATE_CUSTOM_EVENTS:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? { ...t, customEvents: action.payload.customEvents }
            : t
        ),
      };
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.UPDATE_SPONSOR_LOGOS:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? { ...t, sponsorLogos: action.payload.sponsorLogos }
            : t
        ),
      };
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.UPDATE_CLUB_REGISTRATIONS:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? { ...t, clubRegistrations: action.payload.clubRegistrations }
            : t
        ),
      };
      if (state.currentTournament?.id === action.payload.tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === action.payload.tournamentId
        );
      }
      break;

    case ACTIONS.SYNC_CATEGORY_MEDALS: {
      const { tournamentId, categoryId, categoryName, medals, syncedAt } = action.payload;
      if (!tournamentId || !medals) return state;

      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => {
          if (t.id !== tournamentId) return t;
          const category = t.categories.find(
            (c) => c.id === categoryId || (categoryName && c.name === categoryName)
          );
          if (!category) return t;
          return {
            ...t,
            categoryResults: {
              ...(t.categoryResults || {}),
              [category.id]: {
                first: medals.gold?.name || "",
                club1: medals.gold?.club || "",
                second: medals.silver?.name || "",
                club2: medals.silver?.club || "",
                third1: medals.bronze1?.name || "",
                club3a: medals.bronze1?.club || "",
                third2: medals.bronze2?.name || "",
                club3b: medals.bronze2?.club || "",
                _lanSyncedAt: syncedAt || new Date().toISOString(),
              },
            },
          };
        }),
      };
      if (state.currentTournament?.id === tournamentId) {
        newState.currentTournament = newState.tournaments.find((t) => t.id === tournamentId);
      }
      break;
    }
    case ACTIONS.SYNC_MATCH_RESULT: {
      const { matchId, matchCode, score1, score2, winnerId, tournamentId } = action.payload;
      
      console.log(`[SYNC] Processing match ${matchId} (${matchCode || 'N/A'}) for tournament ${tournamentId}`);

      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => {
          if (t.id !== tournamentId) return t;

          let found = false;
          const updatedCategories = t.categories.map((c) => {
            if (!c.bracket?.matches) return c;
            
            // 1. Try finding by matchId (UUID)
            let match = c.bracket.matches.find((m) => m.id === matchId);
            
            // 2. Fallback: Try finding by matchCode if available (e.g., "M6")
            // This handles cases where ID might have changed but structure is same
            if (!match && matchCode) {
              match = c.bracket.matches.find((m) => m.matchCode === matchCode);
              if (match) {
                console.log(`[SYNC] Match found by matchCode: ${matchCode}`);
              } else {
                return c; // Not in this category
              }
            } else if (!match) {
              return c; // Not in this category
            }

            found = true;
            const targetMatchId = match.id; // Use the actual ID in the bracket
            
            const updatedBracket = updateMatchResult(
              c.bracket,
              targetMatchId,
              score1,
              score2,
              winnerId
            );
            return { ...c, bracket: updatedBracket };
          });

          if (!found) {
            console.warn(`[SYNC] Match ${matchId}/${matchCode} not found in tournament ${tournamentId}`);
            return t;
          }
          return { ...t, categories: updatedCategories };
        }),
      };
      
      if (state.currentTournament?.id === tournamentId) {
        newState.currentTournament = newState.tournaments.find(
          (t) => t.id === tournamentId
        );
        if (state.currentCategory) {
          newState.currentCategory = newState.currentTournament.categories.find(
            (c) => c.id === state.currentCategory.id
          );
        }
      }
      break;
    }

    default:
      return state;
  }

  // Save to localStorage
  saveToStorage(newState, action.type);
  return newState;
}

let saveTimeout = null;
async function saveToStorage(state, actionType) {
  // Debounce save to avoid blocking UI
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await dbSaveTournaments(state.tournaments);

      // Auto-backup for important changes
      const importantActions = [
        ACTIONS.DELETE_TOURNAMENT,
        ACTIONS.SET_BRACKET,
        ACTIONS.IMPORT_ATHLETES,
        ACTIONS.IMPORT_CATEGORIES,
        ACTIONS.UPDATE_MATCH,
        ACTIONS.SYNC_MATCH_RESULT,
        ACTIONS.REMOVE_WITHDRAWN_ATHLETES,
      ];
      
      if (importantActions.includes(actionType)) {
        autoBackupCounter++;
        if (autoBackupCounter >= AUTO_BACKUP_INTERVAL) {
          autoBackupCounter = 0;
          createAutoBackup(`Auto-backup sau ${AUTO_BACKUP_INTERVAL} thay đổi quan trọng`);
        }
      }
    } catch (error) {
      console.error("Failed to save to database:", error);
    }
  }, 100);
}

async function loadFromStorage() {
  try {
    const loadedTournaments = await dbGetTournaments();
    if (loadedTournaments && loadedTournaments.length > 0) {
      return { tournaments: loadedTournaments };
    }
  } catch (error) {
    console.error("Failed to load from database:", error);
  }
  return null;
}

export function TournamentProvider({ children }) {
  const [state, dispatch] = useReducer(tournamentReducer, initialState);

  // Load data from SQLite on mount (run migration first if needed)
  useEffect(() => {
    const initialize = async () => {
      // 1. Migrate localStorage -> SQLite (chỉ chạy 1 lần)
      await runMigrationIfNeeded();
      // 2. Load data từ SQLite
      const savedData = await loadFromStorage();
      if (savedData) {
        dispatch({ type: ACTIONS.LOAD_DATA, payload: savedData });
      }
    };
    initialize();
  }, []);

  // Listen for LAN match results (Admin side)
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.receive) {
      const cleanup = window.electronAPI.receive("lan:receive-result", (data) => {
        console.log("Received match result via LAN:", data);
        
        // Use tournamentId from payload if provided, fallback to current
        const targetTournamentId = data.tournamentId || state.currentTournament?.id;
        
        if (targetTournamentId) {
          dispatch({
            type: data.syncType === "category-medals"
              ? ACTIONS.SYNC_CATEGORY_MEDALS
              : ACTIONS.SYNC_MATCH_RESULT,
            payload: {
              ...data,
              tournamentId: targetTournamentId,
            },
          });
        } else {
          console.warn("Received match result but no target tournament identified.");
        }
      });
      return cleanup;
    }
  }, [state.currentTournament?.id]); // Keep dependency to allow fallback to current if payload missing id

  return (
    <TournamentContext.Provider value={state}>
      <TournamentDispatchContext.Provider value={dispatch}>
        {children}
      </TournamentDispatchContext.Provider>
    </TournamentContext.Provider>
  );
}

export function useTournament() {
  const context = useContext(TournamentContext);
  if (context === null) {
    throw new Error("useTournament must be used within a TournamentProvider");
  }
  return context;
}

export function useTournamentDispatch() {
  const context = useContext(TournamentDispatchContext);
  if (context === null) {
    throw new Error(
      "useTournamentDispatch must be used within a TournamentProvider"
    );
  }
  return context;
}

export { ACTIONS };
