import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getAppBaseUrl } from "./pdfService";
import { getTeamsFromAthletes } from "../utils/teamDraw";

/**
 * Certificate Service
 * Handles: data extraction, template rendering, print & PDF export
 */

// ============================================================
// DATA EXTRACTION
// ============================================================

/**
 * Compute results for a single category from bracket data (mirrors StatisticsPage logic)
 */
function computeBracketResults(cat) {
  const bracket = cat?.bracket;
  if (!bracket?.matches) return null;

  const finalMatch = bracket.matches.find(
    (m) => m.round === bracket.numRounds
  );
  if (!finalMatch?.winner) return null;

  const getLoser = (match) => {
    if (!match?.winner) return null;
    if (match.athlete1?.id === match.winner.id) return match.athlete2;
    if (match.athlete2?.id === match.winner.id) return match.athlete1;
    return null;
  };

  const champion = finalMatch.winner;
  const silver = getLoser(finalMatch);
  const semiFinalRound = bracket.numRounds - 1;
  const semiFinals = bracket.matches.filter(
    (m) => m.round === semiFinalRound && !m.isBye
  );
  const bronzes = semiFinals.map((m) => getLoser(m)).filter(Boolean);

  // Fallback: find bronzes from quarter finals
  if (bronzes.length < 2 && semiFinalRound > 1) {
    const quarterRound = semiFinalRound - 1;
    const quarterFinals = bracket.matches.filter(
      (m) => m.round === quarterRound && !m.isBye && m.winner
    );
    const autoAdvanceSemis = semiFinals.filter(
      (m) => m.winner && (!m.athlete1 || !m.athlete2)
    );
    autoAdvanceSemis.forEach((semi) => {
      const advancedAthlete = semi.winner || semi.athlete1 || semi.athlete2;
      if (!advancedAthlete) return;
      const qMatch = quarterFinals.find(
        (m) => m.winner?.id === advancedAthlete.id
      );
      if (qMatch) {
        const qLoser = getLoser(qMatch);
        if (qLoser && !bronzes.some((b) => b.id === qLoser.id)) {
          bronzes.push(qLoser);
        }
      }
    });
    if (bronzes.length < 2) {
      quarterFinals.forEach((qm) => {
        const qLoser = getLoser(qm);
        if (
          qLoser &&
          qLoser.id !== champion?.id &&
          qLoser.id !== silver?.id &&
          !bronzes.some((b) => b.id === qLoser.id)
        ) {
          bronzes.push(qLoser);
        }
      });
    }
  }

  return {
    first: champion?.name || "",
    club1: champion?.club || "",
    second: silver?.name || "",
    club2: silver?.club || "",
    third1: bronzes[0]?.name || "",
    club3a: bronzes[0]?.club || "",
    third2: bronzes[1]?.name || "",
    club3b: bronzes[1]?.club || "",
  };
}

/**
 * Get full results for a category (saved results merged with bracket auto-compute)
 */
function getCategoryResults(tournament, categoryId) {
  const saved = tournament.categoryResults?.[categoryId];
  const cat = tournament.categories.find((c) => c.id === categoryId);
  const computed = computeBracketResults(cat);

  if (!saved && !computed) return null;
  if (!saved) return computed;
  if (!computed) return saved;

  const fields = [
    "first", "second", "third1", "third2",
    "club1", "club2", "club3a", "club3b",
  ];
  const merged = {};
  fields.forEach((f) => {
    merged[f] =
      saved[f] && saved[f].trim() !== "" ? saved[f] : computed[f] || "";
  });
  return merged;
}

/**
 * Detect if a category is a team category
 */
function isTeamCategory(cat) {
  const name = (cat.name || "").toLowerCase();
  return (
    cat.isTeam ||
    name.includes("đồng đội") ||
    name.includes("hỗn hợp") ||
    (cat.athletes || []).some((a) => a.isTeam)
  );
}

/**
 * Get all athletes belonging to a club/team name in a category.
 * For team brackets, winner/loser are stored as team objects (name = club).
 * We look up all individual athletes from that club in cat.athletes.
 */
function getMembersOfTeam(cat, teamNameOrClub, tournament) {
  if (!teamNameOrClub || !teamNameOrClub.trim()) return [];
  const normalize = (value) =>
    String(value || "").trim().toLocaleLowerCase("vi");
  const key = normalize(teamNameOrClub);
  const bracketTeams = [];
  (cat.bracket?.matches || []).forEach((match) => {
    [match.athlete1, match.athlete2, match.winner].forEach((participant) => {
      if (participant?.isTeam && participant.members?.length) {
        bracketTeams.push(participant);
      }
    });
  });
  const generatedTeams = getTeamsFromAthletes(
    cat.athletes || [],
    cat,
    tournament
  );
  const exactTeam = [...bracketTeams, ...generatedTeams].find(
    (team) => normalize(team.name) === key || normalize(team.id) === key
  );
  if (exactTeam?.members?.length) return exactTeam.members;

  return (cat.athletes || []).filter(
    (athlete) =>
      normalize(athlete.club) === key || normalize(athlete.name) === key
  );
}

/**
 * Get all awarded athletes from all categories in a tournament.
 * - Individual categories: 1 record per medal winner
 * - Team categories: 1 record per member of each winning team
 */
export function getAwardedAthletes(tournament) {
  if (!tournament?.categories) return [];
  const records = [];

  tournament.categories.forEach((cat) => {
    const result = getCategoryResults(tournament, cat.id);
    if (!result) return;

    const categoryName = cat.name || "";
    const weightClass = cat.weightClass || "";
    const tournamentName = tournament.name || "";
    const dateStr = tournament.date
      ? new Date(tournament.date).toLocaleDateString("vi-VN")
      : "";
    const isTeam = isTeamCategory(cat);

    /**
     * Push one record per person.
     * For individual: nameOrTeam = athlete name, club = club name
     * For team: nameOrTeam = club/team name → expand to all members
     */
    const push = (nameOrTeam, club, achievement) => {
      if (!nameOrTeam || !nameOrTeam.trim()) return;

      if (isTeam) {
        // Expand to individual members of the club
        // The "name" in result for team brackets is stored as the club name
        // Try matching by club field first, then fallback to name
        const membersByTeam = getMembersOfTeam(cat, nameOrTeam, tournament);
        const members = membersByTeam.length > 0
          ? membersByTeam
          : getMembersOfTeam(cat, club, tournament);

        if (members.length > 0) {
          members.forEach((member) => {
            records.push({
              id: `${cat.id}_${achievement}_${member.id || member.name}`,
              athleteId: member.id || null,
              athleteName: (member.name || "").trim(),
              clubName: (member.club || nameOrTeam).trim(),
              categoryName,
              achievement,
              gender: cat.gender || "",
              weightClass,
              tournamentName,
              tournamentDate: dateStr,
              categoryId: cat.id,
            });
          });
        } else {
          // Fallback: no members found, push the team name as one record
          records.push({
            id: `${cat.id}_${achievement}_${nameOrTeam}`,
            athleteId: null,
            athleteName: nameOrTeam.trim(),
            clubName: (club || nameOrTeam).trim(),
            categoryName,
            achievement,
            gender: cat.gender || "",
            weightClass,
            tournamentName,
            tournamentDate: dateStr,
            categoryId: cat.id,
          });
        }
      } else {
        const normalize = (value) =>
          String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
        const matchedAthlete = (cat.athletes || []).find(
          (athlete) =>
            normalize(athlete.name) === normalize(nameOrTeam) &&
            (!club || normalize(athlete.club) === normalize(club))
        );
        // Individual category: one record per person
        records.push({
          id: `${cat.id}_${achievement}_${nameOrTeam}`,
          athleteId: matchedAthlete?.id || null,
          athleteName: nameOrTeam.trim(),
          clubName: (club || "").trim(),
          categoryName,
          achievement,
          gender: cat.gender || "",
          weightClass,
          tournamentName,
          tournamentDate: dateStr,
          categoryId: cat.id,
        });
      }
    };

    push(result.first, result.club1, "Huy chương Vàng");
    push(result.second, result.club2, "Huy chương Bạc");
    push(result.third1, result.club3a, "Huy chương Đồng");
    push(result.third2, result.club3b, "Huy chương Đồng");
  });

  return records;
}


/**
 * Get unique clubs from tournament
 */
export function getClubsList(tournament) {
  const set = new Set();
  (tournament?.categories || []).forEach((cat) => {
    (cat.athletes || []).forEach((a) => {
      if (a.club) set.add(a.club.trim());
    });
  });
  return Array.from(set).sort();
}

// ============================================================
// TEMPLATE RENDERING
// ============================================================

/** Map token to actual data value */
function resolveToken(token, data) {
  const map = {
    "[Tên VĐV]": data.athleteName,
    "[Câu lạc bộ]": data.clubName,
    "[Nội dung thi đấu]": data.categoryName,
    "[Hạng cân]": data.weightClass,
    "[Thành tích]": data.achievement,
    "[Giải đấu]": data.tournamentName,
    "[Ngày]": data.tournamentDate,
  };
  return map[token] ?? token;
}

/** Resolve field text (variable or custom text) */
function resolveFieldText(field, data) {
  if (field.type === "variable") return resolveToken(field.token, data);
  return field.text || "";
}

/**
 * Build CSS for a template field positioned absolutely on the certificate canvas
 */
function buildFieldStyle(field, canvasW, canvasH) {
  const x = (field.x / 100) * canvasW;
  const y = (field.y / 100) * canvasH;
  const fontSize = field.fontSize || 24;
  const color = field.color || "#000000";
  const fontFamily = field.fontFamily || "Times New Roman";
  const bold = field.bold ? "bold" : "normal";
  const italic = field.italic ? "italic" : "normal";
  const align = field.align || "center";

  let transformOrigin = "top left";
  let translateX = "0";
  if (align === "center") {
    transformOrigin = "top center";
    translateX = "-50%";
  } else if (align === "right") {
    transformOrigin = "top right";
    translateX = "-100%";
  }

  return `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    transform: translateX(${translateX});
    font-size: ${fontSize}px;
    color: ${color};
    font-family: '${fontFamily}', serif;
    font-weight: ${bold};
    font-style: ${italic};
    text-align: ${align};
    white-space: nowrap;
    line-height: 1.2;
    pointer-events: none;
    max-width: ${canvasW * 0.9}px;
    white-space: pre-wrap;
    word-break: break-word;
  `;
}

// A4 dimensions in px at 96dpi
const A4_PORTRAIT_W = 794;
const A4_PORTRAIT_H = 1123;
const A4_LANDSCAPE_W = 1123;
const A4_LANDSCAPE_H = 794;

/**
 * Get canvas dimensions for a template
 */
export function getCanvasDimensions(template) {
  if (template?.orientation === "landscape") {
    return { w: A4_LANDSCAPE_W, h: A4_LANDSCAPE_H };
  }
  return { w: A4_PORTRAIT_W, h: A4_PORTRAIT_H };
}

/**
 * Render a single certificate as an HTML string
 */
export function renderCertificateHTML(template, data) {
  const { w, h } = getCanvasDimensions(template);
  const bg = template?.backgroundImage
    ? `background-image: url('${template.backgroundImage}'); background-size: 100% 100%; background-repeat: no-repeat;`
    : "background: #fff;";

  const fieldsHTML = (template?.fields || [])
    .map((field) => {
      const text = resolveFieldText(field, data);
      if (!text) return "";
      const style = buildFieldStyle(field, w, h);
      return `<div style="${style.replace(/\s+/g, " ").trim()}">${text}</div>`;
    })
    .join("");

  return `
    <div style="
      position: relative;
      width: ${w}px;
      height: ${h}px;
      overflow: hidden;
      ${bg}
      box-sizing: border-box;
    ">
      ${fieldsHTML}
    </div>
  `;
}

/**
 * Build a full printable HTML document for one or more certificate records
 */
function buildPrintDocument(template, records) {
  const { w, h } = getCanvasDimensions(template);
  const orientation =
    template?.orientation === "landscape" ? "landscape" : "portrait";

  const pages = records
    .map((data) => {
      const inner = renderCertificateHTML(template, data);
      return `
        <div style="
          page-break-after: always;
          page-break-inside: avoid;
          width: ${w}px;
          height: ${h}px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ${inner}
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 ${orientation}; margin: 0; }
    body { margin: 0; padding: 0; }
    * { box-sizing: border-box; }
  </style>
</head>
<body>${pages}</body>
</html>`;
}

// ============================================================
// PRINT
// ============================================================

/**
 * Print certificates directly via iframe (like StatisticsPage pattern)
 */
export function printCertificates(template, records, onStart, onDone) {
  if (!records.length) return;
  if (onStart) onStart();

  const html = buildPrintDocument(template, records);
  const printFrame = document.createElement("iframe");
  printFrame.style.position = "fixed";
  printFrame.style.left = "-9999px";
  printFrame.style.top = "0";
  const { w, h } = getCanvasDimensions(template);
  printFrame.style.width = w + "px";
  printFrame.style.height = h + "px";
  printFrame.style.border = "none";
  document.body.appendChild(printFrame);

  const doc = printFrame.contentDocument || printFrame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const doAfterLoad = () => {
    setTimeout(() => {
      if (onDone) onDone();
      printFrame.contentWindow.print();
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
      }, 2000);
    }, 500);
  };

  if (printFrame.contentDocument?.readyState === "complete") {
    doAfterLoad();
  } else {
    printFrame.onload = doAfterLoad;
    setTimeout(() => {
      if (onDone) onDone();
      try {
        printFrame.contentWindow.print();
      } catch (e) {}
      setTimeout(() => {
        if (document.body.contains(printFrame))
          document.body.removeChild(printFrame);
      }, 2000);
    }, 8000);
  }
}

// ============================================================
// PDF EXPORT
// ============================================================

/**
 * Export certificates to a multi-page PDF using html2canvas + jsPDF
 */
export async function exportCertificatePDF(
  template,
  records,
  filename = "giaychungnhan.pdf",
  onProgress = null
) {
  if (!records.length) return;

  const { w, h } = getCanvasDimensions(template);
  const orientation =
    template?.orientation === "landscape" ? "landscape" : "portrait";

  const A4_MM_W = orientation === "landscape" ? 297 : 210;
  const A4_MM_H = orientation === "landscape" ? 210 : 297;

  let pdf = null;

  for (let i = 0; i < records.length; i++) {
    if (onProgress) onProgress(i + 1, records.length);

    const data = records[i];
    const html = renderCertificateHTML(template, data);

    // Create temp container
    const tempDiv = document.createElement("div");
    tempDiv.style.position = "absolute";
    tempDiv.style.left = "-9999px";
    tempDiv.style.top = "0";
    tempDiv.style.width = w + "px";
    tempDiv.style.height = h + "px";
    tempDiv.innerHTML = html;
    document.body.appendChild(tempDiv);

    try {
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: w,
        height: h,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      if (i === 0) {
        pdf = new jsPDF({
          orientation,
          unit: "mm",
          format: "a4",
        });
      } else {
        pdf.addPage([A4_MM_W, A4_MM_H], orientation);
      }

      pdf.addImage(imgData, "JPEG", 0, 0, A4_MM_W, A4_MM_H);
    } finally {
      document.body.removeChild(tempDiv);
    }
  }

  if (pdf) {
    pdf.save(filename);
  }
}
