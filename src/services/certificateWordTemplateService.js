import JSZip from "jszip";
import { getCertificateRecipients } from "./certificateBatchService";

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const FIELD_ALIASES = {
  HO_TEN: ["{{HO_TEN}}", "«HO_TEN»", "«Họ_và_tên»", "«HỌ_VÀ_TÊN»"],
  DON_VI: ["{{DON_VI}}", "«DON_VI»", "«Đơn_vị»", "«ĐƠN_VỊ»"],
  HUY_CHUONG: ["{{HUY_CHUONG}}", "«HUY_CHUONG»", "«Huy_chương»", "«HUY_CHƯƠNG»"],
  HANG_MUC: ["{{HANG_MUC}}", "«HANG_MUC»", "«Hạng_mục»", "«HẠNG_MỤC»"],
  TEN_GIAI: ["{{TEN_GIAI}}", "«TEN_GIAI»", "«Tên_giải»", "«TÊN_GIẢI»"],
};

const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

const safeFilename = (value) => normalize(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D")
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "") || "Giai_dau";

function getTextNodes(root) {
  return Array.from(root.getElementsByTagNameNS("*", "t"));
}

function replaceAcrossTextNodes(root, token, replacement) {
  let replaced = false;
  while (true) {
    const nodes = getTextNodes(root);
    const text = nodes.map((node) => node.textContent || "").join("");
    const start = text.indexOf(token);
    if (start < 0) break;
    const end = start + token.length;
    let cursor = 0;
    let startNode = -1;
    let endNode = -1;
    let startOffset = 0;
    let endOffset = 0;
    nodes.forEach((node, index) => {
      const length = (node.textContent || "").length;
      if (startNode < 0 && start >= cursor && start < cursor + length) {
        startNode = index;
        startOffset = start - cursor;
      }
      if (endNode < 0 && end > cursor && end <= cursor + length) {
        endNode = index;
        endOffset = end - cursor;
      }
      cursor += length;
    });
    if (startNode < 0 || endNode < 0) break;
    const firstText = nodes[startNode].textContent || "";
    const lastText = nodes[endNode].textContent || "";
    if (startNode === endNode) {
      nodes[startNode].textContent = `${firstText.slice(0, startOffset)}${replacement}${firstText.slice(endOffset)}`;
    } else {
      nodes[startNode].textContent = `${firstText.slice(0, startOffset)}${replacement}`;
      for (let index = startNode + 1; index < endNode; index += 1) nodes[index].textContent = "";
      nodes[endNode].textContent = lastText.slice(endOffset);
    }
    replaced = true;
  }
  return replaced;
}

function replaceRecordFields(root, record, tournament) {
  const values = {
    HO_TEN: normalize(record.athleteName),
    DON_VI: normalize(record.clubName),
    HUY_CHUONG: normalize(record.achievement),
    HANG_MUC: normalize(record.categoryName),
    TEN_GIAI: normalize(record.tournamentName || tournament?.name),
  };
  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    aliases.forEach((alias) => replaceAcrossTextNodes(root, alias, values[field]));
  });
}

function hasAthleteField(root) {
  const text = getTextNodes(root).map((node) => node.textContent || "").join("");
  return FIELD_ALIASES.HO_TEN.some((alias) => text.includes(alias));
}

function appendPageBreak(documentXml, body) {
  const paragraph = documentXml.createElementNS(WORD_NAMESPACE, "w:p");
  const run = documentXml.createElementNS(WORD_NAMESPACE, "w:r");
  const pageBreak = documentXml.createElementNS(WORD_NAMESPACE, "w:br");
  pageBreak.setAttributeNS(WORD_NAMESPACE, "w:type", "page");
  run.appendChild(pageBreak);
  paragraph.appendChild(run);
  body.appendChild(paragraph);
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Không thể tạo file Word."));
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}

async function saveDocx(blob, filename) {
  if (window.electronAPI?.saveExportFile) {
    return window.electronAPI.saveExportFile(await blobToBase64(blob), filename, "docx");
  }
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { success: true };
}

export async function exportCertificateWordFromTemplate(tournament, template, categoryIds) {
  if (!template?.fileData) throw new Error("Hãy tải và chọn mẫu Word trước khi xuất.");
  const records = getCertificateRecipients(tournament, categoryIds);
  if (!records.length) throw new Error("Chưa có người nhận giấy chứng nhận trong các nội dung đã chọn.");

  const base64 = String(template.fileData).split(",")[1];
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("File Word không hợp lệ: thiếu word/document.xml.");
  const documentText = await documentFile.async("string");
  const xml = new DOMParser().parseFromString(documentText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("Không thể đọc nội dung mẫu Word.");
  const body = xml.getElementsByTagNameNS("*", "body")[0];
  if (!body) throw new Error("File Word không có phần nội dung để trộn dữ liệu.");
  if (!hasAthleteField(body)) throw new Error("Mẫu Word thiếu biến họ tên: dùng {{HO_TEN}} hoặc «Họ_và_tên».");

  const sectionProperties = Array.from(body.children).find((node) => node.localName === "sectPr") || null;
  const templateNodes = Array.from(body.childNodes)
    .filter((node) => node !== sectionProperties)
    .map((node) => node.cloneNode(true));
  while (body.firstChild) body.removeChild(body.firstChild);

  records.forEach((record, recordIndex) => {
    const holder = xml.createElementNS(WORD_NAMESPACE, "w:holder");
    templateNodes.forEach((node) => holder.appendChild(node.cloneNode(true)));
    replaceRecordFields(holder, record, tournament);
    while (holder.firstChild) body.appendChild(holder.firstChild);
    if (recordIndex < records.length - 1) appendPageBreak(xml, body);
  });
  if (sectionProperties) body.appendChild(sectionProperties);

  zip.file("word/document.xml", new XMLSerializer().serializeToString(xml));
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  const filename = `GCN_${safeFilename(tournament?.name)}_${records.length}_VDV.docx`;
  const saveResult = await saveDocx(blob, filename);
  if (saveResult?.canceled) return { rowCount: 0, filename, canceled: true };
  if (saveResult?.success === false) {
    throw new Error(saveResult.error || "Không thể lưu file Word.");
  }
  return { rowCount: records.length, filename, canceled: false };
}
