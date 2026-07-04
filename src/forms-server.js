import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { google } from "googleapis";
import { getAuthClient } from "./auth.js";

const auth = await getAuthClient();
const forms = google.forms({ version: "v1", auth });
const drive = google.drive({ version: "v3", auth });

const server = new McpServer({ name: "mcp-maru-forms", version: "1.0.0" });

// ── Helpers ──

function formIdFromUrl(input) {
  const m = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input;
}

function buildChoiceQuestion(type, options, shuffle) {
  return {
    choiceQuestion: {
      type: type.toUpperCase(),
      options: options.map((o) => {
        const opt = { value: o.value };
        if (o.goToSectionId) opt.goToSectionId = o.goToSectionId;
        if (o.goToAction) opt.goToAction = o.goToAction;
        if (o.isOther) opt.isOther = true;
        return opt;
      }),
      ...(shuffle !== undefined && { shuffle }),
    },
  };
}

// ── Tools ──

server.tool("create_form", "Tạo Google Form mới", {
  title: z.string(),
  description: z.string().optional(),
  folderId: z.string().optional().describe("ID folder Drive để cất form"),
  isQuiz: z.boolean().optional().describe("Bật chế độ quiz (chấm điểm)"),
}, async ({ title, description, folderId, isQuiz }) => {
  const form = await forms.forms.create({ requestBody: { info: { title, documentTitle: title } } });
  const formId = form.data.formId;
  const requests = [];

  if (description) {
    requests.push({ updateFormInfo: { info: { description }, updateMask: "description" } });
  }
  if (isQuiz) {
    requests.push({ updateSettings: { settings: { quizSettings: { isQuiz: true } }, updateMask: "quizSettings.isQuiz" } });
  }
  if (requests.length > 0) {
    await forms.forms.batchUpdate({ formId, requestBody: { requests } });
  }
  if (folderId) {
    const file = await drive.files.get({ fileId: formId, fields: "parents", supportsAllDrives: true });
    await drive.files.update({
      fileId: formId,
      addParents: folderId,
      removeParents: (file.data.parents || []).join(","),
      supportsAllDrives: true,
    });
  }
  return { content: [{ type: "text", text: `✓ Tạo form "${title}" — ID: ${formId}\nhttps://docs.google.com/forms/d/${formId}/edit\n${isQuiz ? "📝 Chế độ quiz BẬT" : ""}` }] };
});

server.tool("get_form", "Đọc cấu trúc form: tiêu đề, câu hỏi, sections, settings", {
  formId: z.string().describe("Form ID hoặc URL"),
}, async ({ formId }) => {
  const fid = formIdFromUrl(formId);
  const form = await forms.forms.get({ formId: fid });
  const d = form.data;
  const lines = [`📋 ${d.info.title}`, `📝 ${d.info.description || "(không có mô tả)"}`, `🔗 ${d.responderUri}`, ""];

  if (d.settings?.quizSettings?.isQuiz) lines.push("⚡ Chế độ QUIZ đang BẬT\n");

  for (const item of d.items || []) {
    const idx = item.itemId;
    if (item.pageBreakItem !== undefined) {
      lines.push(`── SECTION [${idx}]: ${item.title || "(không tiêu đề)"} ──`);
      if (item.description) lines.push(`   ${item.description}`);
      continue;
    }
    if (item.textItem !== undefined) {
      lines.push(`📄 [${idx}] TEXT: ${item.title || ""}`);
      continue;
    }
    if (item.imageItem) {
      lines.push(`🖼️ [${idx}] IMAGE: ${item.title || ""}`);
      continue;
    }
    if (item.videoItem) {
      lines.push(`🎬 [${idx}] VIDEO: ${item.title || ""}`);
      continue;
    }
    if (item.questionGroupItem) {
      const qg = item.questionGroupItem;
      lines.push(`📊 [${idx}] GRID: ${item.title || ""} (${qg.questions?.length || 0} hàng)`);
      if (qg.grid) {
        const cols = qg.grid.columns?.options?.map((o) => o.value) || [];
        lines.push(`   Cột: ${cols.join(" | ")}`);
      }
      continue;
    }
    if (item.questionItem) {
      const q = item.questionItem.question;
      const req = q.required ? " *BẮT BUỘC*" : "";
      if (q.choiceQuestion) {
        const cq = q.choiceQuestion;
        const opts = cq.options.map((o) => {
          let s = o.isOther ? "(Khác)" : o.value;
          if (o.goToSectionId) s += ` → section ${o.goToSectionId}`;
          if (o.goToAction) s += ` → ${o.goToAction}`;
          return s;
        });
        lines.push(`❓ [${idx}] ${cq.type}: ${item.title}${req}`);
        lines.push(`   Lựa chọn: ${opts.join(" | ")}`);
      } else if (q.textQuestion) {
        const tq = q.textQuestion;
        lines.push(`✏️ [${idx}] ${tq.paragraph ? "PARAGRAPH" : "SHORT_TEXT"}: ${item.title}${req}`);
      } else if (q.scaleQuestion) {
        const sq = q.scaleQuestion;
        lines.push(`📏 [${idx}] SCALE ${sq.low}→${sq.high}: ${item.title}${req}`);
        if (sq.lowLabel || sq.highLabel) lines.push(`   ${sq.lowLabel || ""} ← → ${sq.highLabel || ""}`);
      } else if (q.dateQuestion) {
        lines.push(`📅 [${idx}] DATE: ${item.title}${req}`);
      } else if (q.timeQuestion) {
        lines.push(`⏰ [${idx}] TIME: ${item.title}${req}`);
      } else if (q.fileUploadQuestion) {
        lines.push(`📎 [${idx}] FILE_UPLOAD: ${item.title}${req}`);
      }
      if (q.grading) {
        lines.push(`   🏆 Điểm: ${q.grading.pointValue} — Đáp án: ${JSON.stringify(q.grading.correctAnswers?.answers?.map((a) => a.value))}`);
      }
    }
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

server.tool("add_question", "Thêm câu hỏi vào form", {
  formId: z.string(),
  title: z.string().describe("Nội dung câu hỏi"),
  type: z.enum(["SHORT_TEXT", "PARAGRAPH", "RADIO", "CHECKBOX", "DROP_DOWN", "SCALE", "DATE", "TIME"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  index: z.number().optional().describe("Vị trí chèn (0 = đầu). Bỏ trống = cuối form."),
  options: z.array(z.object({
    value: z.string(),
    goToSectionId: z.string().optional().describe("ID section để nhảy tới khi chọn option này (branching)"),
    goToAction: z.enum(["NEXT_SECTION", "RESTART_FORM", "SUBMIT_FORM"]).optional(),
    isOther: z.boolean().optional(),
  })).optional().describe("Danh sách lựa chọn — BẮT BUỘC cho RADIO/CHECKBOX/DROP_DOWN"),
  scaleLow: z.number().optional().describe("Giá trị thấp nhất (SCALE). Mặc định 1."),
  scaleHigh: z.number().optional().describe("Giá trị cao nhất (SCALE). Mặc định 5."),
  scaleLowLabel: z.string().optional(),
  scaleHighLabel: z.string().optional(),
  shuffle: z.boolean().optional().describe("Xáo trộn lựa chọn (RADIO/CHECKBOX/DROP_DOWN)"),
  points: z.number().optional().describe("Điểm quiz cho câu hỏi"),
  correctAnswers: z.array(z.string()).optional().describe("Đáp án đúng (quiz mode)"),
}, async ({ formId, title, type, description, required, index, options, scaleLow, scaleHigh, scaleLowLabel, scaleHighLabel, shuffle, points, correctAnswers }) => {
  const fid = formIdFromUrl(formId);
  let question = { required: required || false };

  if (type === "SHORT_TEXT") {
    question.textQuestion = { paragraph: false };
  } else if (type === "PARAGRAPH") {
    question.textQuestion = { paragraph: true };
  } else if (["RADIO", "CHECKBOX", "DROP_DOWN"].includes(type)) {
    if (!options || options.length === 0) throw new Error(`${type} cần ít nhất 1 option`);
    question = { ...question, ...buildChoiceQuestion(type, options, shuffle) };
  } else if (type === "SCALE") {
    question.scaleQuestion = {
      low: scaleLow ?? 1,
      high: scaleHigh ?? 5,
      lowLabel: scaleLowLabel || "",
      highLabel: scaleHighLabel || "",
    };
  } else if (type === "DATE") {
    question.dateQuestion = { includeTime: false, includeYear: true };
  } else if (type === "TIME") {
    question.timeQuestion = { duration: false };
  }

  if (points !== undefined || correctAnswers) {
    question.grading = {};
    if (points !== undefined) question.grading.pointValue = points;
    if (correctAnswers) question.grading.correctAnswers = { answers: correctAnswers.map((v) => ({ value: v })) };
  }

  const item = { title, description: description || "", questionItem: { question } };
  const request = { createItem: { item, location: {} } };
  if (index !== undefined) request.createItem.location.index = index;

  const res = await forms.forms.batchUpdate({ formId: fid, requestBody: { requests: [request] } });
  const itemId = res.data.replies?.[0]?.createItem?.itemId || "?";
  return { content: [{ type: "text", text: `✓ Thêm câu hỏi "${title}" [${type}] — itemId: ${itemId}` }] };
});

server.tool("add_section", "Thêm section (ngắt trang) — dùng để chia form thành nhiều phần + tạo branching", {
  formId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  index: z.number().optional(),
}, async ({ formId, title, description, index }) => {
  const fid = formIdFromUrl(formId);
  const item = { title: title || "", description: description || "", pageBreakItem: {} };
  const request = { createItem: { item, location: {} } };
  if (index !== undefined) request.createItem.location.index = index;

  const res = await forms.forms.batchUpdate({ formId: fid, requestBody: { requests: [request] } });
  const itemId = res.data.replies?.[0]?.createItem?.itemId || "?";
  return { content: [{ type: "text", text: `✓ Thêm section "${title || "(không tiêu đề)"}" — itemId: ${itemId}\n💡 Dùng itemId này làm goToSectionId trong add_question để tạo branching.` }] };
});

server.tool("add_text_item", "Thêm đoạn text mô tả (không phải câu hỏi)", {
  formId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  index: z.number().optional(),
}, async ({ formId, title, description, index }) => {
  const fid = formIdFromUrl(formId);
  const item = { title, description: description || "", textItem: {} };
  const request = { createItem: { item, location: {} } };
  if (index !== undefined) request.createItem.location.index = index;

  await forms.forms.batchUpdate({ formId: fid, requestBody: { requests: [request] } });
  return { content: [{ type: "text", text: `✓ Thêm text: "${title}"` }] };
});

server.tool("add_image_item", "Thêm ảnh vào form", {
  formId: z.string(),
  title: z.string().optional(),
  imageUrl: z.string().describe("URL ảnh (phải public)"),
  index: z.number().optional(),
}, async ({ formId, title, imageUrl, index }) => {
  const fid = formIdFromUrl(formId);
  const item = { title: title || "", imageItem: { image: { sourceUri: imageUrl } } };
  const request = { createItem: { item, location: {} } };
  if (index !== undefined) request.createItem.location.index = index;

  await forms.forms.batchUpdate({ formId: fid, requestBody: { requests: [request] } });
  return { content: [{ type: "text", text: `✓ Thêm ảnh: "${title || "(không tiêu đề)"}"` }] };
});

server.tool("add_grid_question", "Thêm câu hỏi lưới (grid) — hàng × cột", {
  formId: z.string(),
  title: z.string(),
  rows: z.array(z.string()).describe("Tên các hàng"),
  columns: z.array(z.string()).describe("Tên các cột"),
  type: z.enum(["RADIO", "CHECKBOX"]).optional().describe("Loại grid. Mặc định RADIO."),
  required: z.boolean().optional(),
  index: z.number().optional(),
}, async ({ formId, title, rows, columns, type, required, index }) => {
  const fid = formIdFromUrl(formId);
  const item = {
    title,
    questionGroupItem: {
      grid: { columns: { type: (type || "RADIO").toUpperCase(), options: columns.map((c) => ({ value: c })) } },
      questions: rows.map((r) => ({ rowQuestion: { title: r }, required: required || false })),
    },
  };
  const request = { createItem: { item, location: {} } };
  if (index !== undefined) request.createItem.location.index = index;

  await forms.forms.batchUpdate({ formId: fid, requestBody: { requests: [request] } });
  return { content: [{ type: "text", text: `✓ Thêm grid "${title}" (${rows.length} hàng × ${columns.length} cột)` }] };
});

server.tool("update_item", "Sửa câu hỏi/item đã có (theo itemId từ get_form)", {
  formId: z.string(),
  itemId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({
    value: z.string(),
    goToSectionId: z.string().optional(),
    goToAction: z.enum(["NEXT_SECTION", "RESTART_FORM", "SUBMIT_FORM"]).optional(),
    isOther: z.boolean().optional(),
  })).optional().describe("Thay đổi danh sách lựa chọn (RADIO/CHECKBOX/DROP_DOWN)"),
  shuffle: z.boolean().optional(),
}, async ({ formId, itemId, title, description, required, options, shuffle }) => {
  const fid = formIdFromUrl(formId);
  const form = await forms.forms.get({ formId: fid });
  const itemIndex = (form.data.items || []).findIndex((i) => i.itemId === itemId);
  if (itemIndex === -1) throw new Error(`Không tìm thấy item ${itemId}`);
  const existing = form.data.items[itemIndex];

  const updateMask = [];
  const updatedItem = { ...existing };
  if (title !== undefined) { updatedItem.title = title; updateMask.push("title"); }
  if (description !== undefined) { updatedItem.description = description; updateMask.push("description"); }

  if (existing.questionItem) {
    if (required !== undefined) {
      updatedItem.questionItem.question.required = required;
      updateMask.push("questionItem.question.required");
    }
    if (options && existing.questionItem.question.choiceQuestion) {
      const cqType = existing.questionItem.question.choiceQuestion.type;
      updatedItem.questionItem.question.choiceQuestion = buildChoiceQuestion(cqType, options, shuffle).choiceQuestion;
      updateMask.push("questionItem.question.choiceQuestion");
    }
  }

  await forms.forms.batchUpdate({
    formId: fid,
    requestBody: {
      requests: [{ updateItem: { item: updatedItem, location: { index: itemIndex }, updateMask: updateMask.join(",") } }],
    },
  });
  return { content: [{ type: "text", text: `✓ Cập nhật item ${itemId}: ${updateMask.join(", ")}` }] };
});

server.tool("delete_item", "Xoá 1 item khỏi form", {
  formId: z.string(),
  itemId: z.string(),
}, async ({ formId, itemId }) => {
  const fid = formIdFromUrl(formId);
  const form = await forms.forms.get({ formId: fid });
  const itemIndex = (form.data.items || []).findIndex((i) => i.itemId === itemId);
  if (itemIndex === -1) throw new Error(`Không tìm thấy item ${itemId}`);

  await forms.forms.batchUpdate({
    formId: fid,
    requestBody: { requests: [{ deleteItem: { location: { index: itemIndex } } }] },
  });
  return { content: [{ type: "text", text: `✓ Xoá item ${itemId}` }] };
});

server.tool("move_item", "Đổi vị trí item trong form", {
  formId: z.string(),
  itemId: z.string(),
  newIndex: z.number().describe("Vị trí mới (0 = đầu form)"),
}, async ({ formId, itemId, newIndex }) => {
  const fid = formIdFromUrl(formId);
  const form = await forms.forms.get({ formId: fid });
  const oldIndex = (form.data.items || []).findIndex((i) => i.itemId === itemId);
  if (oldIndex === -1) throw new Error(`Không tìm thấy item ${itemId}`);

  await forms.forms.batchUpdate({
    formId: fid,
    requestBody: { requests: [{ moveItem: { originalLocation: { index: oldIndex }, newLocation: { index: newIndex } } }] },
  });
  return { content: [{ type: "text", text: `✓ Di chuyển item ${itemId}: vị trí ${oldIndex} → ${newIndex}` }] };
});

server.tool("update_form_info", "Sửa tiêu đề và mô tả form", {
  formId: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
}, async ({ formId, title, description }) => {
  const fid = formIdFromUrl(formId);
  const info = {};
  const masks = [];
  if (title) { info.title = title; info.documentTitle = title; masks.push("title"); }
  if (description !== undefined) { info.description = description; masks.push("description"); }

  await forms.forms.batchUpdate({
    formId: fid,
    requestBody: { requests: [{ updateFormInfo: { info, updateMask: masks.join(",") } }] },
  });
  return { content: [{ type: "text", text: `✓ Cập nhật form: ${masks.join(", ")}` }] };
});

server.tool("set_quiz", "Bật/tắt chế độ quiz (chấm điểm)", {
  formId: z.string(),
  isQuiz: z.boolean(),
}, async ({ formId, isQuiz }) => {
  const fid = formIdFromUrl(formId);
  await forms.forms.batchUpdate({
    formId: fid,
    requestBody: { requests: [{ updateSettings: { settings: { quizSettings: { isQuiz } }, updateMask: "quizSettings.isQuiz" } }] },
  });
  return { content: [{ type: "text", text: `✓ Quiz mode: ${isQuiz ? "BẬT" : "TẮT"}` }] };
});

server.tool("list_responses", "Đọc danh sách câu trả lời (responses)", {
  formId: z.string(),
  limit: z.number().optional().describe("Số response tối đa. Mặc định 50."),
}, async ({ formId, limit }) => {
  const fid = formIdFromUrl(formId);
  const res = await forms.forms.responses.list({ formId: fid, pageSize: limit || 50 });
  const responses = res.data.responses || [];
  if (responses.length === 0) return { content: [{ type: "text", text: "📭 Chưa có response nào." }] };

  const lines = [`📊 ${responses.length} responses:\n`];
  for (const r of responses) {
    lines.push(`── Response ${r.responseId} (${r.lastSubmittedTime}) ──`);
    for (const [qId, answer] of Object.entries(r.answers || {})) {
      const vals = answer.textAnswers?.answers?.map((a) => a.value).join(", ") || JSON.stringify(answer);
      lines.push(`  [${qId}]: ${vals}`);
    }
    if (r.totalScore !== undefined) lines.push(`  🏆 Điểm: ${r.totalScore}`);
    lines.push("");
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

server.tool("get_response", "Đọc chi tiết 1 response", {
  formId: z.string(),
  responseId: z.string(),
}, async ({ formId, responseId }) => {
  const fid = formIdFromUrl(formId);
  const r = await forms.forms.responses.get({ formId: fid, responseId });
  return { content: [{ type: "text", text: JSON.stringify(r.data, null, 2) }] };
});

server.tool("batch_update", "Gửi nhiều request cùng lúc (nâng cao — dùng Forms API batchUpdate format)", {
  formId: z.string(),
  requests: z.array(z.any()).describe("Mảng request theo format Google Forms API v1 batchUpdate"),
}, async ({ formId, requests }) => {
  const fid = formIdFromUrl(formId);
  const res = await forms.forms.batchUpdate({ formId: fid, requestBody: { requests } });
  return { content: [{ type: "text", text: `✓ Batch: ${res.data.replies?.length || 0} replies` }] };
});

// ── Start ──

const transport = new StdioServerTransport();
await server.connect(transport);
