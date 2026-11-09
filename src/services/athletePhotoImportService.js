import { KSPORT_CLOUD_API_URL, getCloudAuthHeaders } from "./cloudSyncService.js";

const MAX_BYTES = 5 * 1024 * 1024;

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function uploadImportedCardPhoto(athleteId, photo, tournamentId, clubId) {
  if (!athleteId || !photo?.data || !photo?.type) throw new Error("Thiếu mã VĐV hoặc dữ liệu ảnh thẻ");
  const bytes = decodeBase64(photo.data);
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_BYTES) throw new Error(`Ảnh ${photo.name || ""} phải không quá 5 MB`);
  const authHeaders = await getCloudAuthHeaders();
  const path = `/api/media/athletes/${encodeURIComponent(athleteId)}`;
  const requested = await fetch(`${KSPORT_CLOUD_API_URL}${path}/upload-url`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ contentType: photo.type, sizeBytes: bytes.byteLength }),
  });
  const requestData = await requested.json().catch(() => ({}));
  if (!requested.ok) throw new Error(requestData?.message || "Không thể chuẩn bị tải ảnh thẻ");
  const put = await fetch(requestData.uploadUrl, { method: "PUT", headers: { "Content-Type": photo.type }, body: bytes });
  if (!put.ok) throw new Error(`Không thể tải ảnh ${photo.name || ""}`);
  const completed = await fetch(`${KSPORT_CLOUD_API_URL}${path}/complete`, {
    method: "POST", headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ objectKey: requestData.objectKey, contentType: photo.type, sizeBytes: bytes.byteLength }),
  });
  if (!completed.ok) throw new Error("Không thể lưu ảnh thẻ");
  if (tournamentId) {
    const linked = await fetch(`${KSPORT_CLOUD_API_URL}/api/media/tournaments/${encodeURIComponent(tournamentId)}/athletes/${encodeURIComponent(athleteId)}/photo-registration`, {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders }, body: JSON.stringify({ clubId: clubId || "excel-import" }),
    });
    if (!linked.ok) throw new Error("Không thể liên kết ảnh thẻ với giải");
  }
}
