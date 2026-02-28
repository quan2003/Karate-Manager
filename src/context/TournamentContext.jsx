import { createContext, useContext, useReducer, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { createAutoBackup } from "../services/backupService";

// Auto-backup counter to avoid backing up too frequently
let autoBackupCounter = 0;
const AUTO_BACKUP_INTERVAL = 5; // Backup every N important changes

const TournamentContext = createContext(null);
const TournamentDispatchContext = createContext(null);

const STORAGE_KEY = "karate_tournament_data";

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
};

function tournamentReducer(state, action) {
  let newState;

  switch (action.type) {
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

    case ACTIONS.UPDATE_ATHLETE:
      newState = {
        ...state,
        tournaments: state.tournaments.map((t) => ({
          ...t,
          categories: t.categories.map((c) => ({
            ...c,
            athletes: c.athletes.map((a) =>
              a.id === action.payload.id ? { ...a, ...action.payload } : a
            ),
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
                    ...action.payload.athletes.map((a) => ({
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

    default:
      return state;
  }

  // Save to localStorage
  saveToStorage(newState, action.type);
  return newState;
}

let saveTimeout = null;
function saveToStorage(state, actionType) {
  // Debounce localStorage save to avoid blocking UI
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const dataToSave = {
        tournaments: state.tournaments,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));

      // Auto-backup for important changes
      const importantActions = [
        ACTIONS.DELETE_TOURNAMENT,
        ACTIONS.SET_BRACKET,
        ACTIONS.IMPORT_ATHLETES,
        ACTIONS.IMPORT_CATEGORIES,
        ACTIONS.UPDATE_MATCH,
      ];
      
      if (importantActions.includes(actionType)) {
        autoBackupCounter++;
        if (autoBackupCounter >= AUTO_BACKUP_INTERVAL) {
          autoBackupCounter = 0;
          createAutoBackup(`Auto-backup sau ${AUTO_BACKUP_INTERVAL} thay đổi quan trọng`);
        }
      }
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
    }
  }, 100);
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load from localStorage:", error);
  }
  return null;
}

export function TournamentProvider({ children }) {
  const [state, dispatch] = useReducer(tournamentReducer, initialState);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = loadFromStorage();
    if (savedData) {
      dispatch({ type: ACTIONS.LOAD_DATA, payload: savedData });
    }
  }, []);

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
