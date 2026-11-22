export const TOURNAMENT_TIER_OPTIONS = [
  { value: "national", label: "Quốc gia / Quốc tế (× 2.0)", multiplier: 2.0 },
  { value: "regional", label: "Tỉnh / Khu vực / Cúp CLB mạnh (× 1.5)", multiplier: 1.5 },
  { value: "club", label: "CLB / Sinh viên / Mở rộng (× 1.0)", multiplier: 1.0 },
];

export function suggestTournamentTier(name) {
  const normalized = String(name || "").trim();
  if (!normalized) return "club";

  if (
    /quốc\s*gia|quốc\s*tế|toàn\s*quốc|sea\s*games|wkf|châu\s*á|thế\s*giới|quoc\s*gia|quoc\s*te|toan\s*quoc/i.test(
      normalized
    )
  ) {
    return "national";
  }

  if (
    /tỉnh|thành\s*phố|\btp\.?\s|đại\s*hội\s*tdtt|khu\s*vực|miền\s*(bắc|trung|nam)|cúp\s*(các\s*)?clb\s*mạnh|tinh\b|dai\s*hoi/i.test(
      normalized
    )
  ) {
    return "regional";
  }

  return "club";
}

export function getTierMultiplier(tier) {
  const found = TOURNAMENT_TIER_OPTIONS.find((item) => item.value === tier);
  return found ? found.multiplier : 1.0;
}

