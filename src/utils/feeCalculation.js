const normalizeText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const isTeamFeeCategory = (category) => {
  const name = normalizeText(category?.name);
  return Boolean(
    category?.isTeam ||
      name.includes("đồng đội") ||
      name.includes("dong doi") ||
      name.includes("hỗn hợp") ||
      name.includes("hon hop") ||
      name.includes("team")
  );
};

export const calculateClubFeeSummary = ({ categories = [], clubs = [], feeSettings = {} }) => {
  const individualFee = Number(feeSettings.individualFee) || 0;
  const teamFee = Number(feeSettings.teamFee) || 0;
  const surchargeFee = Number(feeSettings.surchargeFee) || 0;
  const enableSurcharge = Boolean(feeSettings.enableSurcharge);

  return clubs.map((club) => {
    const normalizedClub = String(club || "").trim();
    let teamEntries = 0;
    let individualCount = 0;
    const individualEventsByAthlete = new Map();

    categories.forEach((category) => {
      const clubAthletes = (category?.athletes || []).filter(
        (athlete) => String(athlete?.club || "").trim() === normalizedClub
      );
      if (isTeamFeeCategory(category)) {
        if (clubAthletes.length > 0) teamEntries += 1;
        return;
      }
      individualCount += clubAthletes.length;
      clubAthletes.forEach((athlete, index) => {
        const athleteName = normalizeText(athlete?.name);
        const athleteKey = athleteName || `__unnamed_${category?.id || category?.name || "category"}_${index}`;
        const eventKey = String(category?.id || category?.name || `category_${index}`);
        if (!individualEventsByAthlete.has(athleteKey)) individualEventsByAthlete.set(athleteKey, new Set());
        individualEventsByAthlete.get(athleteKey).add(eventKey);
      });
    });

    let extraEventsForSurcharge = 0;
    if (enableSurcharge) {
      individualEventsByAthlete.forEach((events) => {
        extraEventsForSurcharge += Math.max(0, events.size - 1);
      });
    }
    const teamFeeTotal = teamEntries * teamFee;
    const individualFeeTotal = individualCount * individualFee;
    const surchargeTotal = extraEventsForSurcharge * surchargeFee;
    return { club: normalizedClub, teamEntries, teamFeeTotal, individualCount, individualFeeTotal, extraEventsForSurcharge, surchargeTotal, totalFee: teamFeeTotal + individualFeeTotal + surchargeTotal };
  }).sort((a, b) => a.club.localeCompare(b.club, "vi"));
};
