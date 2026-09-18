const normalizeKata = (value = "") =>
  String(value).normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export function validateKataRegistration({
  kataName,
  previousKatas = [],
}) {
  const kata = normalizeKata(kataName);
  const history = previousKatas.map(normalizeKata).filter(Boolean);
  if (!kata) return { valid: false, message: "Chưa nhập tên bài quyền." };

  const warnings = [];
  const usedCount = history.filter((item) => item === kata).length;

  if (history.at(-1) === kata) {
    warnings.push("Trùng Kata với vòng ngay trước.");
  }
  if (usedCount === 1) {
    warnings.push("Kata đã sử dụng 1 lần và đây là lần thứ 2.");
  } else if (usedCount > 1) {
    warnings.push(`Kata đã sử dụng ${usedCount} lần trước đó.`);
  }

  return {
    valid: true,
    warning: warnings.join(" "),
    warnings,
  };
}
