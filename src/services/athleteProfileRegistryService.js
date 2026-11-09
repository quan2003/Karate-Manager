import { KSPORT_CLOUD_API_URL, getCloudAuthHeaders } from "./cloudSyncService.js";

// Resolves durable athlete IDs before registrations are written to a tournament.
// The server deliberately refuses ambiguous rows instead of guessing a person.
export async function resolveAthleteProfiles(athletes) {
  const response = await fetch(`${KSPORT_CLOUD_API_URL}/api/athlete-profiles/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await getCloudAuthHeaders()) },
    body: JSON.stringify({ athletes }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.success) throw new Error(data?.message || "Không thể đối chiếu hồ sơ VĐV");

  const unresolved = data.items.filter((item) => !item.athleteId);
  if (unresolved.length) {
    const detail = unresolved.slice(0, 5).map((item) => `Dòng ${item.index + 1}: ${item.message}`).join("\n");
    throw new Error(`Có ${unresolved.length} VĐV cần kiểm tra trước khi nhập:\n${detail}`);
  }
  return athletes.map((athlete, index) => {
    const resolved = data.items.find((item) => item.index === index);
    const athleteId = resolved?.athleteId || athlete.athleteId || null;
    // Public K-SPORT surfaces identify a person by athleteCode. Keep the
    // internal profile ID separately so it is never printed as the card code.
    const athleteCode = resolved?.athleteCode || athlete.athleteCode || null;
    return { ...athlete, athleteId, athleteCode, profileId: athleteId };
  });
}
