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
  CLEAR_TOURNAMENT_ATHLETES: "CLEAR_TOURNAMENT_ATHLETES",
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
    case ACTIONS.LOAD_DATA:
      return { ...state, ...action.payload };

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
      // Import multiple categories at once
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) =>
          t.id === action.payload.tournamentId
            ? {
                ...t,
                categories: [
                  ...t.categories,
                  ...action.payload.categories.map((cat) => ({
                    id: uuidv4(),
                    name: cat.name,
                    type: cat.type,
                    isTeam: cat.isTeam || false,
                    weightClass: cat.weightClass || "",
                    ageGroup: cat.ageGroup || "",
                    gender: cat.gender || "male",
                    athletes: [],
                    bracket: null,
                    format: cat.format || "single_elimination",
                  })),
                ],
              }
            : t
        ),
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

    case ACTIONS.ADD_ATHLETE:
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
                    {
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
                    },
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

    case ACTIONS.UPDATE_ATHLETE: {
      // Helper: sync updated athlete fields into a bracket's matches
      const syncAthleteInBracket = (bracket, updatedAthlete) => {
        if (!bracket) return bracket;
        const updatedMatches = bracket.matches.map((m) => {
          let changed = false;
          const updated = { ...m };
          if (m.athlete1?.id === updatedAthlete.id) {
            updated.athlete1 = { ...m.athlete1, ...updatedAthlete };
            changed = true;
          }
          if (m.athlete2?.id === updatedAthlete.id) {
            updated.athlete2 = { ...m.athlete2, ...updatedAthlete };
            changed = true;
          }
          if (m.winner?.id === updatedAthlete.id) {
            updated.winner = { ...m.winner, ...updatedAthlete };
            changed = true;
          }
          return changed ? updated : m;
        });
        return { ...bracket, matches: updatedMatches };
      };

      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            athletes: c.athletes.map((a) =>
              a.id === action.payload.id ? { ...a, ...action.payload } : a
            ),
            // Also sync athlete info into bracket matches so sigma stays up-to-date
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
          categories: t.categories.map((c) => ({
            ...c,
            athletes: c.athletes.filter((a) => a.id !== action.payload),
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
                return { ...c, athletes: [...c.athletes, athleteToMove] };
              }
              return {
                ...c,
                athletes: c.athletes.filter((a) => a.id !== athleteId),
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
                        name: a.name,
                        gender: a.gender || null,
                        birthDate: a.birthDate || null,
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
    const tournaments = await dbGetTournaments();
    if (tournaments && tournaments.length > 0) {
      return { tournaments };
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
            type: ACTIONS.SYNC_MATCH_RESULT,
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
