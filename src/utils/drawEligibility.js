import {
  getTeamCountFromAthletes,
  isTeamCategory,
} from "./teamDraw";

export const getTournamentDrawMinimum = (tournament) =>
  Number(tournament?.drawSettings?.minimumParticipants) === 2 ? 2 : 3;

export const getCategoryDrawParticipantCount = (category, tournament) =>
  isTeamCategory(category)
    ? getTeamCountFromAthletes(category?.athletes || [], category, tournament)
    : (category?.athletes || []).length;

export const isCategoryDrawEligible = (
  category,
  tournament,
  minimumParticipants = getTournamentDrawMinimum(tournament)
) =>
  getCategoryDrawParticipantCount(category, tournament) >=
  minimumParticipants;
