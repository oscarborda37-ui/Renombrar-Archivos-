const STORAGE_KEY = "retirementDashboardDataV5";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
let charts = {};

const $ = (selector) => document.querySelector(selector);
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
const cleanLabel = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const format = (value) => value === null || value === undefined ? "—" : value.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortLabel = (label, length = 34) => label.length > length ? `${label.slice(0, length - 1)}…` : label;
const wrapLabel = (label, length = 28) => {
  const words = label.split(" "); const lines = []; let line = "";
  words.forEach((word) => { if (`${line} ${word}`.trim().length > length && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); });
  if (line) lines.push(line); return lines;
};
const getNumber = (value, max = 10) => {
  if (typeof value === "number" && Number.isFinite(value)) return value >= 0 && value <= max ? value : null;
  const text = String(value ?? "").trim().replace(/\s/g, "").replace(/,/g, ".");
  if (!text || !/^[-+]?\d+(\.\d+)?(?:\/(?:5|10))?$/.test(text)) return null;
  const number = Number.parseFloat(text);
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null;
};
const isMarked = (value) => /^(x|si|yes|true|check|checked|ok|✓|✔|●|1)$/i.test(cleanLabel(value));
const yesNo = (value) => { const text = normalize(value); return /^(si|yes|true)$/.test(text) ? "Sí" : /^no$/.test(text) ? "No" : cleanLabel(value); };

const FORM_QUESTIONS = [
  ["Somos apasionados por los clientes y consumidores", "somos apasionados por los clientes", "Liderazgo"],
  ["Jugamos en equipo", "jugamos en equipo", "Liderazgo"],
  ["Lideramos con cercanía y confianza", "lideramos con cercania", "Liderazgo"],
  ["Trabajamos de forma ágil e innovadora", "trabajamos de forma agil", "Liderazgo"],
  ["Juntos logramos resultados", "juntos logramos resultados", "Liderazgo"],
  ["Diversidad, Equidad e Inclusión (DEI)", "estamos comprometidos con la diversidad", "Liderazgo"],
  ["Somos un lugar excepcional para trabajar", "somos un lugar excepcional para trabajar", "Experiencia general"]
];
const EXIT_REASONS = [
  ["Carga laboral", "carga laboral"], ["Situación familiar", "situacion familiar"], ["Cambio de ciudad", "cambio de ciudad"], ["Desarrollo profesional", "desarrollo profesional"],
  ["Compensación más atractiva", "compensacion mas atractiva"], ["Ambiente físico", "ambiente fisico"], ["Estilo de liderazgo del jefe inmediato", "estilo de liderazgo de jefe inmediato"],
  ["Jornada laboral", "jornada laboral"], ["Ambiente laboral / relación con compañeros", "ambiente laboral relacion con companeros"]
];

function setStatus(message, type = "") { const node = $("#uploadStatus"); node.textContent = message; node.className = `upload-status ${type}`; }
function librariesAvailable() {
  if (!window.XLSX) { setStatus("No se pudo cargar el lector de archivos. Revisa tu conexión e inténtalo de nuevo.", "error"); return false; }
  if (!window.Chart) { setStatus("No se pudo cargar el componente de gráficos. Revisa tu conexión e inténtalo de nuevo.", "error"); return false; }
  return true;
}
function findHeader(headers, candidates) { return headers.find((header) => candidates.some((candidate) => normalize(header).includes(candidate))); }
function findRow(matrix, phrase) { return matrix.find((row) => row.some((cell) => normalize(cell).includes(phrase))); }
function firstValue(values) { return values.map(cleanLabel).find(Boolean) || ""; }
function formatSheetDate(sheet, address) {
  const cell = sheet[address]; if (!cell) return "";
  if (typeof cell.v === "number" && window.XLSX?.SSF) {
    const date = XLSX.SSF.parse_date_code(cell.v);
    if (date) return `${String(date.d).padStart(2, "0")}/${String(date.m).padStart(2, "0")}/${date.y}`;
  }
  return cleanLabel(cell.w || cell.v);
}
function parseDate(value) {
  const text = cleanLabel(value); if (!text) return null;
  const parts = text.split(/[\/.\-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [first, second, third] = parts; const year = third < 100 ? 2000 + third : third;
  const day = first > 12 ? first : second > 12 ? second : first; const month = first > 12 ? second : second > 12 ? first : second;
  const date = new Date(year, month - 1, day); return Number.isNaN(date.getTime()) ? null : date;
}
function tenureFromDates(hireDate, retirementDate) {
  const hire = parseDate(hireDate); const retirement = parseDate(retirementDate);
  if (!hire || !retirement || retirement < hire) return { months: null, band: "Sin fecha" };
  let months = (retirement.getFullYear() - hire.getFullYear()) * 12 + retirement.getMonth() - hire.getMonth();
  if (retirement.getDate() < hire.getDate()) months -= 1;
  return { months, band: months < 6 ? "Menos de 6 meses" : months <= 12 ? "6 a 12 meses" : months <= 36 ? "1 a 3 años" : "Más de 3 años" };
}

function rowsToRecords(rows, fileName, sheetName) {
  if (!rows.length) throw new Error("La hoja no contiene filas con información.");
  const headers = Object.keys(rows[0]).filter(Boolean);
  const nameHeader = findHeader(headers, ["nombre", "persona", "colaborador", "empleado", "trabajador", "employee", "participante"]);
  const idHeader = findHeader(headers, ["no identificacion", "identificacion", "identification", "documento", "cedula", "id"]);
  const personHeader = nameHeader || idHeader;
  const questionHeader = findHeader(headers, ["pregunta", "question", "tema", "item", "aspecto", "variable"]);
  const answerHeader = findHeader(headers, ["respuesta", "answer", "calificacion", "califica", "satisfaccion", "puntuacion", "puntaje", "score", "valoracion"]);
  const records = [];
  if (questionHeader && answerHeader) {
    rows.forEach((row, index) => { const value = getNumber(row[answerHeader]); if (value !== null) records.push({ identification: cleanLabel(row[idHeader]), person: cleanLabel(row[personHeader]) || `${fileName} · ${index + 1}`, question: cleanLabel(row[questionHeader]) || "Tema sin nombre", value, scaleMax: 10, category: "Evaluación", fileName, sheetName }); });
  } else {
    const metadata = new Set([personHeader, "fecha", "date", "cargo", "area", "departamento", "motivo", "email", "correo", "id"].filter(Boolean).map(normalize));
    const scoreHeaders = headers.filter((header) => !metadata.has(normalize(header)) && rows.some((row) => getNumber(row[header]) !== null));
    rows.forEach((row, index) => scoreHeaders.forEach((header) => { const value = getNumber(row[header]); if (value !== null) records.push({ identification: cleanLabel(row[idHeader]), person: cleanLabel(row[personHeader]) || `${fileName} · ${index + 1}`, question: cleanLabel(header), value, scaleMax: 10, category: "Evaluación", fileName, sheetName }); }));
  }
  if (!records.length) throw new Error("No encontramos calificaciones numéricas en esta hoja.");
  return records;
}

function scoreFromFormRow(row) {
  const options = row.slice(6, 11); // Las columnas G:K corresponden a 1–5 en el formato suministrado.
  for (let index = 0; index < options.length; index += 1) {
    const value = getNumber(options[index], 5);
    if (value !== null) return value;
    if (isMarked(options[index])) return index + 1;
  }
  return null;
}
function markedReason(row, phrase) {
  const labelIndex = row.findIndex((cell) => normalize(cell).includes(phrase));
  if (labelIndex < 0) return false;
  const nextLabel = row.findIndex((cell, index) => index > labelIndex && EXIT_REASONS.some(([, key]) => normalize(cell).includes(key)));
  const responseCells = row.slice(labelIndex + 1, nextLabel > -1 ? nextLabel : undefined);
  return responseCells.some(isMarked);
}
function textResponse(row, phrase) {
  const labelIndex = row.findIndex((cell) => normalize(cell).includes(phrase));
  return labelIndex < 0 ? "" : firstValue(row.slice(labelIndex + 1));
}

function extractRetirementForm(sheet, fileName, sheetName) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const matchCount = FORM_QUESTIONS.filter(([, key]) => findRow(matrix, key)).length;
  const isForm = matrix.some((row) => row.some((cell) => normalize(cell).includes("entrevista de retiro"))) && matchCount >= 3;
  if (!isForm) return { isForm: false };
  const nameRow = findRow(matrix, "nombres y apellidos");
  const person = firstValue(nameRow?.slice(1, 9) || []) || `${fileName} · ${sheetName}`;
  const identificationRow = findRow(matrix, "no identificacion");
  const identificationIndex = identificationRow ? identificationRow.findIndex((cell) => normalize(cell).includes("no identificacion")) : -1;
  const identification = identificationIndex >= 0 ? firstValue(identificationRow.slice(identificationIndex + 1)) : "";
  const positionRow = findRow(matrix, "cargo desempenado");
  const position = firstValue(positionRow?.slice(1, 2) || []);
  const retirementDateRow = findRow(matrix, "fecha retiro");
  const retirementDate = formatSheetDate(sheet, "D13") || firstValue(retirementDateRow?.slice(3, 9) || []);
  const hireDateRow = findRow(matrix, "fecha de ingreso");
  const hireDate = formatSheetDate(sheet, "M13") || firstValue(hireDateRow?.slice(10) || []);
  const cityRow = findRow(matrix, "ciudad");
  const city = firstValue(cityRow?.slice(3, 9) || []);
  const phoneRow = findRow(matrix, "no telefonico");
  const phone = firstValue(phoneRow?.slice(1, 2) || []);
  const tenure = tenureFromDates(hireDate, retirementDate);
  const personData = { identification, person, position, retirementDate, hireDate, city, phone, tenureMonths: tenure.months, tenureBand: tenure.band, fileName, sheetName };
  const records = FORM_QUESTIONS.flatMap(([question, key, category]) => {
    const row = findRow(matrix, key); const value = row ? scoreFromFormRow(row) : null;
    return value === null ? [] : [{ ...personData, question, value, scaleMax: 5, category }];
  });
  const reasons = EXIT_REASONS.flatMap(([reason, key]) => {
    const row = findRow(matrix, key);
    return row && markedReason(row, key) ? [{ ...personData, reason }] : [];
  });
  const employerResponses = [["Volvería a trabajar en la compañía", "volverias a trabajar"], ["Recomendaría la compañía", "recomendarias a"]].flatMap(([question, key]) => {
    const response = textResponse(findRow(matrix, key) || [], key);
    return response ? [{ ...personData, question, answer: yesNo(response) }] : [];
  });
  const comments = [["Recomendaciones para atraer talento", "que recomendarias para que"], ["Mensaje para futuros candidatos", "que le dirias a alguien"]].flatMap(([question, key]) => {
    const response = textResponse(findRow(matrix, key) || [], key);
    return response ? [{ ...personData, question, response }] : [];
  });
  return { isForm: true, hasData: Boolean(records.length || reasons.length || employerResponses.length || comments.length), records, reasons, employerResponses, comments, interviews: 1 };
}

async function readFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const output = { records: [], reasons: [], employerResponses: [], comments: [], interviews: 0, fileNames: [file.name] };
  let tableError;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]; if (!sheet?.["!ref"]) continue;
    const form = extractRetirementForm(sheet, file.name, sheetName);
    if (form.isForm) {
      if (form.hasData) { output.records.push(...form.records); output.reasons.push(...form.reasons); output.employerResponses.push(...form.employerResponses); output.comments.push(...form.comments); output.interviews += form.interviews; }
      continue;
    }
    try { const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }); const records = rowsToRecords(rows, file.name, sheetName); output.records.push(...records); output.interviews += new Set(records.map((item) => item.person)).size; }
    catch (error) { tableError = error; }
  }
  if (!output.records.length && !output.reasons.length && !output.employerResponses.length && !output.comments.length) throw tableError || new Error("No encontramos respuestas diligenciadas en este formato.");
  return output;
}

function normalizeData(data = {}) { return { records: data.records || [], reasons: data.reasons || [], employerResponses: data.employerResponses || [], comments: data.comments || [], interviews: data.interviews || new Set((data.records || []).map((item) => item.person)).size, fileNames: data.fileNames || (data.sheetName ? [data.sheetName] : []) }; }
function mergeData(base, additions) {
  const all = [normalizeData(base), ...additions.map(normalizeData)];
  return { records: all.flatMap((item) => item.records), reasons: all.flatMap((item) => item.reasons), employerResponses: all.flatMap((item) => item.employerResponses), comments: all.flatMap((item) => item.comments), interviews: all.reduce((sum, item) => sum + item.interviews, 0), fileNames: [...new Set(all.flatMap((item) => item.fileNames))] };
}
function calculate(raw) {
  const data = normalizeData(raw); const scaleMax = data.records.length && data.records.every((item) => item.scaleMax === 10) ? 10 : 5;
  const groupScores = (key) => Object.entries(data.records.reduce((groups, item) => { (groups[item[key]] ??= []).push(item.value / item.scaleMax * scaleMax); return groups; }, {})).map(([label, values]) => ({ label, count: values.length, average: average(values) }));
  const questions = groupScores("question").sort((a, b) => a.average - b.average);
  const percentByCategory = (category) => average(data.records.filter((item) => item.category === category).map((item) => item.value / item.scaleMax * 100));
  const leadershipIndex = percentByCategory("Liderazgo"); const experienceIndex = percentByCategory("Experiencia general");
  const satisfactionIndex = leadershipIndex !== null && experienceIndex !== null ? leadershipIndex * .7 + experienceIndex * .3 : average(data.records.map((item) => item.value / item.scaleMax * 100));
  const recommendation = data.employerResponses.filter((item) => normalize(item.question).includes("recomendaria"));
  const numericRecommendation = recommendation.map((item) => getNumber(item.answer, 10)).filter((value) => value !== null);
  const enps = numericRecommendation.length ? ((numericRecommendation.filter((value) => value >= 9).length - numericRecommendation.filter((value) => value <= 6).length) / numericRecommendation.length) * 100 : (() => { const answers = recommendation.map((item) => yesNo(item.answer)); const valid = answers.filter((answer) => answer === "Sí" || answer === "No"); return valid.length ? ((valid.filter((answer) => answer === "Sí").length - valid.filter((answer) => answer === "No").length) / valid.length) * 100 : null; })();
  const enpsCaption = numericRecommendation.length ? "eNPS: promotores menos detractores" : recommendation.length ? "proxy: intención de recomendar Sí/No" : "sin respuestas de recomendación";
  const interviewGroups = Object.values(data.records.reduce((groups, item) => { const key = `${item.fileName}|${item.sheetName}|${item.identification}|${item.person}`; (groups[key] ??= []).push(item); return groups; }, {}));
  const tenure = ["Menos de 6 meses", "6 a 12 meses", "1 a 3 años", "Más de 3 años"].map((band) => {
    const interviews = interviewGroups.filter((items) => items[0].tenureBand === band);
    const values = interviews.map((items) => { const lead = average(items.filter((item) => item.category === "Liderazgo").map((item) => item.value / item.scaleMax * 100)); const exp = average(items.filter((item) => item.category === "Experiencia general").map((item) => item.value / item.scaleMax * 100)); return lead !== null && exp !== null ? lead * .7 + exp * .3 : average(items.map((item) => item.value / item.scaleMax * 100)); }).filter((value) => value !== null);
    return { band, count: values.length, index: average(values) };
  });
  return { ...data, scaleMax, average: average(data.records.map((item) => item.value / item.scaleMax * scaleMax)), questions, people: groupScores("person"), leadershipIndex, experienceIndex, satisfactionIndex, enps, enpsCaption, tenure };
}
function destroyCharts() { Object.values(charts).forEach((chart) => chart.destroy()); charts = {}; }
function reading(value, scaleMax) { return value / scaleMax < .6 ? ["Prioridad alta", "alert"] : value / scaleMax < .8 ? ["Oportunidad", "alert"] : ["Fortaleza", ""]; }
function renderTopicsTable(topics, scaleMax) {
  const table = $("#topicsTable"); table.replaceChildren();
  topics.forEach((topic) => { const [text, className] = reading(topic.average, scaleMax); const row = document.createElement("tr"); const cells = [document.createElement("td"), document.createElement("td"), document.createElement("td"), document.createElement("td")]; cells[0].textContent = topic.label; cells[0].title = topic.label; cells[1].textContent = topic.count; cells[2].textContent = `${format(topic.average)} / ${scaleMax}`; cells[2].className = "score"; const badge = document.createElement("span"); badge.className = `reading ${className}`; badge.textContent = text; cells[3].append(badge); row.append(...cells); table.append(row); });
}
function reasonSummary(reasons) { return Object.entries(reasons.reduce((groups, item) => { groups[item.reason] = (groups[item.reason] || 0) + 1; return groups; }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count); }
function brandSummary(responses) { return Object.entries(responses.reduce((groups, item) => { const answer = yesNo(item.answer); (groups[item.question] ??= { yes: 0, no: 0, other: 0 })[answer === "Sí" ? "yes" : answer === "No" ? "no" : "other"] += 1; return groups; }, {})).map(([label, values]) => ({ label, ...values })); }
function downloadReport() {
  const stored = normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  if (!stored.records.length && !stored.reasons.length && !stored.employerResponses.length && !stored.comments.length) { setStatus("No hay datos para incluir en el reporte.", "error"); return; }
  const groups = new Map();
  const addToGroup = (item) => {
    const key = `${item.fileName}|${item.sheetName}|${item.identification}|${item.person}`;
    if (!groups.has(key)) groups.set(key, { ...item, records: [], reasons: [], employer: {}, comments: {} });
    return groups.get(key);
  };
  stored.records.forEach((item) => addToGroup(item).records.push(item));
  stored.reasons.forEach((item) => addToGroup(item).reasons.push(item.reason));
  stored.employerResponses.forEach((item) => { addToGroup(item).employer[item.question] = item.answer; });
  stored.comments.forEach((item) => { addToGroup(item).comments[item.question] = item.response; });
  const questionColumns = [...new Set([...FORM_QUESTIONS.map(([label]) => label), ...stored.records.map((item) => item.question)])];
  const reportRows = [...groups.values()].map((interview) => {
    const scores = Object.fromEntries(interview.records.map((item) => [item.question, item.value]));
    const lead = average(interview.records.filter((item) => item.category === "Liderazgo").map((item) => item.value / item.scaleMax * 100));
    const experience = average(interview.records.filter((item) => item.category === "Experiencia general").map((item) => item.value / item.scaleMax * 100));
    const individualIndex = lead !== null && experience !== null ? lead * .7 + experience * .3 : average(interview.records.map((item) => item.value / item.scaleMax * 100));
    const row = { "No identificación": interview.identification || "Sin dato", "Nombre completo": interview.person || "", Cargo: interview.position || "", "Fecha de ingreso": interview.hireDate || "", "Fecha de retiro": interview.retirementDate || "", Antigüedad: interview.tenureBand || "Sin fecha", "Meses de antigüedad": interview.tenureMonths ?? "", Ciudad: interview.city || "", Teléfono: interview.phone || "", "Índice de satisfacción laboral": individualIndex === null ? "" : Number(individualIndex.toFixed(1)) };
    questionColumns.forEach((question) => { row[question] = scores[question] ?? ""; });
    row["Motivos de retiro"] = [...new Set(interview.reasons)].join("; ");
    row["Volvería a trabajar en la compañía"] = interview.employer["Volvería a trabajar en la compañía"] || "";
    row["Recomendaría la compañía"] = interview.employer["Recomendaría la compañía"] || "";
    row["Recomendaciones para atraer talento"] = interview.comments["Recomendaciones para atraer talento"] || "";
    row["Mensaje para futuros candidatos"] = interview.comments["Mensaje para futuros candidatos"] || "";
    row.Archivo = interview.fileName || ""; row.Hoja = interview.sheetName || "";
    return row;
  });
  const workbook = XLSX.utils.book_new(); const sheet = XLSX.utils.json_to_sheet(reportRows);
  sheet["!cols"] = Object.keys(reportRows[0]).map((key) => ({ wch: Math.min(Math.max(key.length + 3, 15), 42) }));
  XLSX.utils.book_append_sheet(workbook, sheet, "Reporte consolidado");
  XLSX.writeFile(workbook, `Reporte_entrevistas_retiro_${new Date().toISOString().slice(0, 10)}.xlsx`);
  setStatus("El reporte consolidado, en una sola hoja, se descargó correctamente.", "success");
}
async function downloadPdf() {
  if (!window.html2canvas || !window.jspdf) { setStatus("No se pudo cargar el componente para exportar PDF. Revisa tu conexión e inténtalo de nuevo.", "error"); return; }
  const dashboard = $("#dashboard"); if (dashboard.hidden) { setStatus("Primero carga al menos una entrevista para exportar el dashboard.", "error"); return; }
  const button = $("#downloadPdf"); button.disabled = true; button.textContent = "Generando PDF…";
  try {
    const canvas = await html2canvas(dashboard, { scale: 2, useCORS: true, backgroundColor: "#fbf6f6", scrollY: -window.scrollY });
    const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const imageHeight = canvas.height * pageWidth / canvas.width; const image = canvas.toDataURL("image/png");
    let renderedHeight = 0;
    while (renderedHeight < imageHeight) { if (renderedHeight) pdf.addPage(); pdf.addImage(image, "PNG", 0, -renderedHeight, pageWidth, imageHeight); renderedHeight += pageHeight; }
    pdf.save(`Dashboard_entrevistas_retiro_${new Date().toISOString().slice(0, 10)}.pdf`);
    setStatus("El dashboard se exportó correctamente en PDF.", "success");
  } catch (error) { console.error(error); setStatus("No fue posible generar el PDF.", "error"); }
  finally { button.disabled = false; button.textContent = "Exportar PDF"; }
}

function renderDashboard(rawData) {
  const data = calculate(rawData); $("#emptyState").hidden = true; $("#dashboard").hidden = false;
  $("#dataSummary").textContent = `${data.fileNames.length} archivo${data.fileNames.length === 1 ? "" : "s"} · ${data.interviews} entrevista${data.interviews === 1 ? "" : "s"} · escala 1 a ${data.scaleMax}.`;
  $("#peopleMetric").textContent = data.interviews; $("#peopleCaption").textContent = `${data.fileNames.length} archivo${data.fileNames.length === 1 ? "" : "s"} cargado${data.fileNames.length === 1 ? "" : "s"}`;
  $("#satisfactionMetric").textContent = data.satisfactionIndex === null ? "—" : `${format(data.satisfactionIndex)}%`; $("#satisfactionCaption").textContent = data.leadershipIndex !== null && data.experienceIndex !== null ? "ponderado: liderazgo 70% · experiencia 30%" : "promedio de dimensiones disponibles"; $("#enpsMetric").textContent = data.enps === null ? "—" : `${data.enps >= 0 ? "+" : ""}${Math.round(data.enps)}`; $("#enpsCaption").textContent = data.enpsCaption; $("#scaleLegend").textContent = `Promedio / ${data.scaleMax}`;
  $("#responsesMetric").textContent = data.records.length; $("#responsesCaption").textContent = `${data.questions.length} dimensión${data.questions.length === 1 ? "" : "es"} evaluada${data.questions.length === 1 ? "" : "s"}`;
  const opportunity = data.questions[0]; $("#opportunityMetric").textContent = opportunity ? opportunity.label : "—"; $("#opportunityCaption").textContent = opportunity ? `${format(opportunity.average)} / ${data.scaleMax} · ${opportunity.count} respuesta${opportunity.count === 1 ? "" : "s"}` : "sin calificaciones registradas";
  destroyCharts();
  const questionData = [...data.questions].reverse();
  charts.questions = new Chart($("#overallSatisfactionChart"), { type: "bar", data: { labels: questionData.length ? questionData.map((item) => wrapLabel(item.label)) : ["Sin calificaciones"], datasets: [{ data: questionData.length ? questionData.map((item) => item.average) : [0], backgroundColor: questionData.length ? questionData.map((item) => item.average / data.scaleMax < .6 ? "#b4232c" : item.average / data.scaleMax < .8 ? "#d87a22" : "#8f1c25") : ["#e5cfd2"], borderRadius: 6, maxBarThickness: 32 }] }, options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => questionData[items[0].dataIndex]?.label || "Sin calificaciones", label: (context) => `${format(context.raw)} / ${data.scaleMax}` } } }, scales: { x: { min: 0, max: data.scaleMax, grid: { color: "#f0e5e6" }, ticks: { stepSize: 1 } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } } } });
  const reasons = reasonSummary(data.reasons).slice(0, 6);
  charts.reasons = new Chart($("#distributionChart"), { type: "doughnut", data: { labels: reasons.length ? reasons.map((item) => shortLabel(item.label, 25)) : ["Sin motivos registrados"], datasets: [{ data: reasons.length ? reasons.map((item) => item.count) : [1], backgroundColor: reasons.length ? ["#8f1c25", "#ba2530", "#d87a22", "#b4232c", "#a44c56", "#bd8a8f"] : ["#e5d7d9"], borderWidth: 4, borderColor: "#fff" }] }, options: { maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { boxWidth: 9, usePointStyle: true, padding: 14, font: { size: 10 } } } } } });
  const brand = brandSummary(data.employerResponses);
  charts.brand = new Chart($("#perPersonChart"), { type: "bar", data: { labels: brand.length ? brand.map((item) => shortLabel(item.label, 28)) : ["Sin respuestas registradas"], datasets: [{ label: "Sí", data: brand.length ? brand.map((item) => item.yes) : [0], backgroundColor: "#8f1c25", borderRadius: 4 }, { label: "No", data: brand.length ? brand.map((item) => item.no) : [0], backgroundColor: "#b4232c", borderRadius: 4 }, { label: "Otra respuesta", data: brand.length ? brand.map((item) => item.other) : [0], backgroundColor: "#d87a22", borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { beginAtZero: true, grid: { color: "#f0e5e6" }, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { font: { size: 10 } } } } } });
  charts.tenure = new Chart($("#tenureChart"), { type: "bar", data: { labels: data.tenure.map((item) => item.band), datasets: [{ label: "Índice de satisfacción", data: data.tenure.map((item) => item.index ?? 0), backgroundColor: data.tenure.map((item) => item.count ? "#8f1c25" : "#ead7d9"), borderRadius: 5 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${format(context.raw)}% · ${data.tenure[context.dataIndex].count} entrevista${data.tenure[context.dataIndex].count === 1 ? "" : "s"}` } } }, scales: { y: { min: 0, max: 100, grid: { color: "#f0e5e6" }, ticks: { callback: (value) => `${value}%` } }, x: { grid: { display: false } } } } });
  renderTopicsTable(data.questions, data.scaleMax);
}

async function handleFiles(fileList) {
  const files = [...fileList]; if (!files.length) return; if (!librariesAvailable()) return;
  const allowed = files.filter((file) => { if (file.size <= MAX_FILE_SIZE) return true; setStatus(`“${file.name}” supera el límite de 15 MB.`, "error"); return false; }); if (!allowed.length) return;
  setStatus(`Leyendo ${allowed.length} archivo${allowed.length === 1 ? "" : "s"}…`); $("#dropzone").classList.add("loading");
  try {
    const results = await Promise.allSettled(allowed.map(readFile)); const loaded = results.filter((result) => result.status === "fulfilled").map((result) => result.value); const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || "archivo no válido");
    if (!loaded.length) throw new Error(errors.join(" "));
    const combined = mergeData(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"), loaded); localStorage.setItem(STORAGE_KEY, JSON.stringify(combined)); renderDashboard(combined);
    setStatus(`${loaded.length} archivo${loaded.length === 1 ? "" : "s"} incorporado${loaded.length === 1 ? "" : "s"}. ${errors.length ? `${errors.length} no se pudo procesar.` : ""}`, errors.length ? "error" : "success");
  } catch (error) { console.error(error); setStatus(error.message || "No fue posible leer los archivos.", "error"); }
  finally { $("#dropzone").classList.remove("loading"); $("#excelFile").value = ""; }
}

window.addEventListener("DOMContentLoaded", () => {
  $("#excelFile").addEventListener("change", (event) => handleFiles(event.target.files));
  ["dragenter", "dragover"].forEach((eventName) => $("#dropzone").addEventListener(eventName, (event) => { event.preventDefault(); $("#dropzone").classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((eventName) => $("#dropzone").addEventListener(eventName, (event) => { event.preventDefault(); $("#dropzone").classList.remove("dragging"); }));
  $("#dropzone").addEventListener("drop", (event) => handleFiles(event.dataTransfer.files));
  $("#downloadReport").addEventListener("click", downloadReport);
  $("#downloadPdf").addEventListener("click", downloadPdf);
  $("#clearData").addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); destroyCharts(); $("#dashboard").hidden = true; $("#emptyState").hidden = false; setStatus("Los datos guardados se eliminaron de este navegador."); });
  try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); if ((stored?.records?.length || stored?.reasons?.length) && librariesAvailable()) { renderDashboard(stored); setStatus("Se restauró la última carga guardada en este navegador.", "success"); } } catch { localStorage.removeItem(STORAGE_KEY); }
});
