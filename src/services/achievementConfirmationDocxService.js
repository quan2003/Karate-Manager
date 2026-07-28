import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { getAwardedAthletes } from "./certificateService";

const FONT = "Times New Roman";
const BODY_SIZE = 26;
const PAGE_WIDTH_TWIPS = 11906;
const PAGE_HEIGHT_TWIPS = 16838;

const normalizeSpace = (value) => String(value || "").replace(/\s+/g, " ").trim();

const normalizeWeight = (value) => {
  const weight = normalizeSpace(value);
  if (!weight) return "";
  return weight
    .replace(/\s*kg$/i, " kg")
    .replace(/^([+-]?\d+(?:[.,]\d+)?)\s*kg$/i, "$1 kg");
};

function buildAchievementSentence(record, category) {
  const categoryName = normalizeSpace(category?.name);
  const categoryNameLower = categoryName.toLocaleLowerCase("vi");
  const discipline =
    category?.type === "kumite" || categoryNameLower.includes("kumite")
      ? "Kumite"
      : "Kata";
  const isTeam =
    Boolean(category?.isTeam) ||
    categoryNameLower.includes("đồng đội") ||
    categoryNameLower.includes("hỗn hợp") ||
    (category?.athletes || []).some((athlete) => athlete.isTeam);
  const gender =
    category?.gender === "male"
      ? "nam"
      : category?.gender === "female"
      ? "nữ"
      : category?.gender === "mixed"
      ? "hỗn hợp"
      : "";
  const weight = discipline === "Kumite" ? normalizeWeight(category?.weightClass) : "";
  const ageGroup = normalizeSpace(category?.ageGroup);
  const rawMedal = normalizeSpace(record.achievement).toLocaleLowerCase("vi");
  const medal = rawMedal.includes("vàng")
    ? "Huy chương vàng"
    : rawMedal.includes("bạc")
    ? "Huy chương bạc"
    : rawMedal.includes("đồng")
    ? "Huy chương đồng"
    : normalizeSpace(record.achievement);

  return [
    medal,
    discipline,
    isTeam ? "đồng đội" : "cá nhân",
    gender,
    weight,
    ageGroup ? `lứa tuổi ${ageGroup}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildAchievementConfirmationRows(tournament, options = {}) {
  const categories = new Map(
    (tournament?.categories || []).map((category) => [category.id, category])
  );
  const selectedClubs = new Set(
    (options.clubNames || [])
      .map((clubName) => normalizeSpace(clubName).toLocaleLowerCase("vi"))
      .filter(Boolean)
  );
  const grouped = new Map();

  getAwardedAthletes(tournament).forEach((record, index) => {
    const normalizedClubName = normalizeSpace(record.clubName);
    if (
      selectedClubs.size > 0 &&
      !selectedClubs.has(normalizedClubName.toLocaleLowerCase("vi"))
    ) {
      return;
    }
    const athleteId = normalizeSpace(record.athleteId);
    const groupingKey = athleteId
      ? `athlete:${athleteId}`
      : `unresolved:${record.categoryId}:${record.id}:${index}`;
    const category = categories.get(record.categoryId);
    const achievement = buildAchievementSentence(record, category);

    if (!grouped.has(groupingKey)) {
      grouped.set(groupingKey, {
        athleteId: athleteId || null,
        athleteName: normalizeSpace(record.athleteName),
        clubName: normalizedClubName,
        achievements: [],
      });
    }
    const athlete = grouped.get(groupingKey);
    if (achievement && !athlete.achievements.includes(achievement)) {
      athlete.achievements.push(achievement);
    }
    if (!athlete.clubName && record.clubName) {
      athlete.clubName = normalizeSpace(record.clubName);
    }
  });

  return Array.from(grouped.values()).sort((a, b) =>
    a.athleteName.localeCompare(b.athleteName, "vi")
  );
}

const makeRun = (text, options = {}) =>
  new TextRun({
    text,
    font: FONT,
    size: options.size || BODY_SIZE,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
  });

const makeParagraph = (text, options = {}) =>
  new Paragraph({
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: {
      before: options.before || 0,
      after: options.after ?? 80,
      line: options.line || 276,
    },
    keepNext: Boolean(options.keepNext),
    children: [makeRun(text, options)],
  });

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
};

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    children: [
      makeParagraph(text, {
        alignment: AlignmentType.CENTER,
        bold: true,
        after: 0,
      }),
    ],
  });
}

function bodyCell(paragraphs, width, alignment = AlignmentType.LEFT) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    children: paragraphs.map((text) =>
      makeParagraph(text, { alignment, after: 0, line: 276 })
    ),
  });
}

export function createAchievementConfirmationDocument(tournament, rows) {
  const leftHeader = new TableCell({
    width: { size: 45, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      makeParagraph("[TÊN CƠ QUAN CẤP TRÊN]", {
        alignment: AlignmentType.CENTER,
        bold: true,
        after: 20,
      }),
      makeParagraph("[TÊN CƠ QUAN/ĐƠN VỊ]", {
        alignment: AlignmentType.CENTER,
        bold: true,
        after: 20,
      }),
      makeParagraph("____________________", {
        alignment: AlignmentType.CENTER,
        after: 0,
      }),
    ],
  });
  const rightHeader = new TableCell({
    width: { size: 55, type: WidthType.PERCENTAGE },
    borders: noBorders,
    children: [
      makeParagraph("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", {
        alignment: AlignmentType.CENTER,
        bold: true,
        size: 24,
        after: 20,
      }),
      makeParagraph("Độc lập - Tự do - Hạnh phúc", {
        alignment: AlignmentType.CENTER,
        bold: true,
        after: 20,
      }),
      makeParagraph("______________________________", {
        alignment: AlignmentType.CENTER,
        after: 0,
      }),
    ],
  });

  const achievementRows = rows.map(
    (athlete, index) =>
      new TableRow({
        cantSplit: true,
        children: [
          bodyCell([String(index + 1)], 6, AlignmentType.CENTER),
          bodyCell([athlete.athleteName || "[HỌ VÀ TÊN]"], 30),
          bodyCell(
            athlete.achievements.length
              ? athlete.achievements
              : ["[THÀNH TÍCH]"],
            44
          ),
          bodyCell([athlete.clubName || "[ĐƠN VỊ]"], 20, AlignmentType.CENTER),
        ],
      })
  );

  const achievementTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [6, 30, 44, 20],
    borders: cellBorders,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: [
          headerCell("TT", 6),
          headerCell("Họ và tên", 30),
          headerCell("Thành tích", 44),
          headerCell("Đơn vị", 20),
        ],
      }),
      ...achievementRows,
    ],
  });

  const signatureTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 52, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [makeParagraph("", { after: 0 })],
          }),
          new TableCell({
            width: { size: 48, type: WidthType.PERCENTAGE },
            borders: noBorders,
            children: [
              makeParagraph("[CHỨC VỤ NGƯỜI KÝ]", {
                alignment: AlignmentType.CENTER,
                bold: true,
                after: 440,
              }),
              makeParagraph("[Ký và ghi rõ họ tên]", {
                alignment: AlignmentType.CENTER,
                italics: true,
                after: 440,
              }),
              makeParagraph("[HỌ VÀ TÊN]", {
                alignment: AlignmentType.CENTER,
                bold: true,
                after: 0,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return new Document({
    creator: "K-SPORT",
    title: `Giấy xác nhận thành tích - ${tournament?.name || ""}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: BODY_SIZE },
          paragraph: { spacing: { line: 276, after: 80 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
            margin: { top: 850, right: 850, bottom: 850, left: 850 },
          },
        },
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [new TableRow({ cantSplit: true, children: [leftHeader, rightHeader] })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
              new TableRow({
                cantSplit: true,
                children: [
                  new TableCell({
                    width: { size: 45, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [makeParagraph("Số: ....../......", { before: 180, after: 0 })],
                  }),
                  new TableCell({
                    width: { size: 55, type: WidthType.PERCENTAGE },
                    borders: noBorders,
                    children: [
                      makeParagraph("[Địa điểm], ngày ... tháng ... năm 20...", {
                        alignment: AlignmentType.CENTER,
                        italics: true,
                        before: 180,
                        after: 0,
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          makeParagraph("[TÊN VĂN BẢN]", {
            alignment: AlignmentType.CENTER,
            bold: true,
            size: 32,
            before: 360,
            after: 80,
            keepNext: true,
          }),
          makeParagraph("[TÊN GIẢI / NỘI DUNG XÁC NHẬN]", {
            alignment: AlignmentType.CENTER,
            bold: true,
            size: 28,
            after: 220,
            keepNext: true,
          }),
          makeParagraph("[NỘI DUNG XÁC NHẬN - CÓ THỂ CHỈNH SỬA]", {
            alignment: AlignmentType.JUSTIFIED,
            after: 220,
            keepNext: true,
          }),
          achievementTable,
          makeParagraph("", { before: 180, after: 0 }),
          signatureTable,
        ],
      },
    ],
  });
}

function sanitizeFilename(value) {
  return normalizeSpace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "Giai_dau";
}

export async function exportAchievementConfirmationDocx(tournament, options = {}) {
  const rows = buildAchievementConfirmationRows(tournament, options);
  if (!rows.length) {
    throw new Error(
      options.clubNames?.length
        ? "Đơn vị này chưa có dữ liệu thành tích để xuất giấy xác nhận."
        : "Chưa có dữ liệu thành tích để xuất giấy xác nhận."
    );
  }

  const document = createAchievementConfirmationDocument(tournament, rows);
  const blob = await Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  const clubSuffix =
    options.clubNames?.length === 1
      ? `_${sanitizeFilename(options.clubNames[0])}`
      : "";
  anchor.download = `Giay_xac_nhan_thanh_tich_${sanitizeFilename(
    tournament?.name
  )}${clubSuffix}.docx`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { rowCount: rows.length };
}
