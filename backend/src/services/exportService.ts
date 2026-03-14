import ExcelJS from 'exceljs';

// ─── Típusok ──────────────────────────────────────────────────────────────────

export interface ExportDailyLog {
  createdAt: Date;
  foodName: string;
  amount: number;
  mealType: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  source?: string | null;
}

export interface ExportWaterLog {
  createdAt: Date;
  amountMl: number;
}

export interface ExportUserProfile {
  username: string;
  email: string;
  weightKg?: number | null;
  heightCm?: number | null;
  dailyKcalGoal?: number | null;
  dailyWaterGoalMl?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  tier: string;
}

export interface ExportOptions {
  from: Date;
  to: Date;
  logs: ExportDailyLog[];
  waterLogs: ExportWaterLog[];
  user: ExportUserProfile;
}

// ─── Konstansok ───────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: 'Reggeli',
  LUNCH: 'Ebéd',
  DINNER: 'Vacsora',
  SNACK: 'Snack',
  OTHER: 'Egyéb',
};

const GOAL_LABELS: Record<string, string> = {
  LOSE: 'Fogyás',
  MAINTAIN: 'Szinten tartás',
  GAIN: 'Tömegnövelés',
};

const ACTIVITY_LABELS: Record<string, string> = {
  SEDENTARY: 'Ülő életmód',
  LIGHT: 'Könnyű aktivitás',
  MODERATE: 'Közepes aktivitás',
  ACTIVE: 'Aktív',
  VERY_ACTIVE: 'Nagyon aktív',
};

// Brand színek
const BRAND_ORANGE  = 'FFFF6B35';
const BRAND_LIGHT   = 'FFFFF0EA';
const PROTEIN_BLUE  = 'FF4A90D9';
const CARBS_YELLOW  = 'FFF5A623';
const FAT_GREEN     = 'FF2ECC71';
const FIBER_PURPLE  = 'FF9B59B6';
const WATER_BLUE    = 'FF7EC8E3';
const HEADER_DARK   = 'FF1A1A2E';
const WHITE         = 'FFFFFFFF';
const LIGHT_GRAY    = 'FFF8F8F8';
const MID_GRAY      = 'FFE8E8E8';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('hu-HU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function styleHeader(cell: ExcelJS.Cell, bgColor = BRAND_ORANGE) {
  cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = {
    bottom: { style: 'thin', color: { argb: WHITE } },
    right: { style: 'thin', color: { argb: WHITE } },
  };
}

function styleDataCell(cell: ExcelJS.Cell, shade = false) {
  cell.fill = shade
    ? { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } }
    : { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  cell.border = {
    bottom: { style: 'hair', color: { argb: MID_GRAY } },
    right: { style: 'hair', color: { argb: MID_GRAY } },
  };
}

// ─── Sheet 1: Napló ────────────────────────────────────────────────────────────

function buildLogsSheet(wb: ExcelJS.Workbook, logs: ExportDailyLog[], from: Date, to: Date) {
  const ws = wb.addWorksheet('📝 Napló', {
    properties: { tabColor: { argb: BRAND_ORANGE } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // Cím
  ws.mergeCells('A1:K1');
  const titleCell = ws.getCell('A1');
  titleCell.value = `VitaScan – Tápanyagnapló  |  ${formatDate(from)} – ${formatDate(to)}`;
  titleCell.font = { bold: true, size: 14, color: { argb: WHITE } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 32;

  // Fejléc sor
  const headers = [
    { label: 'Dátum / Idő',    width: 20, color: HEADER_DARK },
    { label: 'Étel neve',       width: 28, color: HEADER_DARK },
    { label: 'Étkezés',         width: 13, color: HEADER_DARK },
    { label: 'Mennyiség (g)',    width: 14, color: HEADER_DARK },
    { label: '🔥 Kalória (kcal)',width: 16, color: BRAND_ORANGE },
    { label: '💪 Fehérje (g)',   width: 14, color: PROTEIN_BLUE },
    { label: '🌾 Szénhidrát (g)',width: 16, color: CARBS_YELLOW },
    { label: '🥑 Zsír (g)',      width: 12, color: FAT_GREEN },
    { label: '🌿 Rost (g)',      width: 12, color: FIBER_PURPLE },
    { label: '🍬 Cukor (g)',     width: 12, color: 'FFE74C3C' },
    { label: 'Forrás',           width: 11, color: HEADER_DARK },
  ];

  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = h.width;
    const cell = ws.getCell(2, i + 1);
    cell.value = h.label;
    styleHeader(cell, h.color);
  });
  ws.getRow(2).height = 28;

  // Adatok
  let row = 3;
  let prevDate = '';

  for (const log of logs) {
    const dateStr = formatDate(log.createdAt);
    const isNewDate = dateStr !== prevDate;
    const shade = Math.floor((row - 3) / 1) % 2 === 0;

    // Dátumváltásnál halvány elválasztó
    if (isNewDate && row > 3) {
      const sepRow = ws.getRow(row);
      sepRow.height = 6;
      ws.mergeCells(`A${row}:K${row}`);
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MID_GRAY } };
      row++;
    }

    const values = [
      formatDateTime(log.createdAt),
      log.foodName,
      MEAL_LABELS[log.mealType] ?? log.mealType,
      log.amount,
      round1(log.kcal),
      round1(log.protein),
      round1(log.carbs),
      round1(log.fat),
      log.fiber != null ? round1(log.fiber) : '—',
      log.sugar != null ? round1(log.sugar) : '—',
      log.source ?? 'MANUAL',
    ];

    values.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      // Szám-cellák jobbra igazítva
      if (i >= 3) cell.alignment = { horizontal: 'right', vertical: 'middle' };
      // Étel neve balra
      if (i === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    prevDate = dateStr;
    row++;
  }

  // Összesítő sor
  if (logs.length > 0) {
    row++;
    const totals = logs.reduce((acc, l) => ({
      kcal: acc.kcal + l.kcal,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
      fiber: acc.fiber + (l.fiber ?? 0),
      sugar: acc.sugar + (l.sugar ?? 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 });

    const summaryRow = ws.getRow(row);
    summaryRow.height = 24;

    ws.mergeCells(`A${row}:C${row}`);
    const sumLabelCell = ws.getCell(`A${row}`);
    sumLabelCell.value = `ÖSSZESÍTÉS (${logs.length} bejegyzés)`;
    sumLabelCell.font = { bold: true, color: { argb: WHITE } };
    sumLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

    [
      { col: 4, val: '' },
      { col: 5, val: round1(totals.kcal) },
      { col: 6, val: round1(totals.protein) },
      { col: 7, val: round1(totals.carbs) },
      { col: 8, val: round1(totals.fat) },
      { col: 9, val: round1(totals.fiber) },
      { col: 10, val: round1(totals.sugar) },
      { col: 11, val: '' },
    ].forEach(({ col, val }) => {
      const cell = ws.getCell(row, col);
      cell.value = val;
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'medium', color: { argb: BRAND_ORANGE } } };
    });
  }

  // Freeze panes
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  ws.autoFilter = { from: 'A2', to: 'K2' };
}

// ─── Sheet 2: Napi összesítők ─────────────────────────────────────────────────

function buildDailySummarySheet(wb: ExcelJS.Workbook, logs: ExportDailyLog[], from: Date, to: Date) {
  const ws = wb.addWorksheet('📊 Napi összesítők', {
    properties: { tabColor: { argb: PROTEIN_BLUE } },
  });

  // Cím
  ws.mergeCells('A1:H1');
  const t = ws.getCell('A1');
  t.value = 'Napi összesítők';
  t.font = { bold: true, size: 13, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PROTEIN_BLUE } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Fejléc
  const headers = ['Dátum', '🔥 Kalória', '💪 Fehérje (g)', '🌾 Szénhidrát (g)', '🥑 Zsír (g)', '🌿 Rost (g)', '💧 Víz (ml)', 'Bejegyzések'];
  const widths  = [14, 14, 16, 18, 14, 12, 12, 13];
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    styleHeader(cell, PROTEIN_BLUE);
  });
  ws.getRow(2).height = 26;

  // Napok csoportosítása
  const byDate = new Map<string, ExportDailyLog[]>();
  for (const log of logs) {
    const key = formatDate(log.createdAt);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(log);
  }

  let row = 3;
  const sortedDates = Array.from(byDate.keys()).sort();
  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;

  for (const date of sortedDates) {
    const dayLogs = byDate.get(date)!;
    const shade = row % 2 === 0;
    const sum = dayLogs.reduce((a, l) => ({
      kcal: a.kcal + l.kcal,
      protein: a.protein + l.protein,
      carbs: a.carbs + l.carbs,
      fat: a.fat + l.fat,
      fiber: a.fiber + (l.fiber ?? 0),
    }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });

    totalKcal += sum.kcal;
    totalProtein += sum.protein;
    totalCarbs += sum.carbs;
    totalFat += sum.fat;

    const vals = [date, round1(sum.kcal), round1(sum.protein), round1(sum.carbs), round1(sum.fat), round1(sum.fiber), '—', dayLogs.length];
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      if (i > 0) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
    row++;
  }

  // Átlag sor
  const days = sortedDates.length || 1;
  row++;
  ws.mergeCells(`A${row}:A${row}`);
  const avgLabel = ws.getCell(`A${row}`);
  avgLabel.value = 'Napi átlag';
  avgLabel.font = { bold: true };
  avgLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF8FF' } };

  [round1(totalKcal / days), round1(totalProtein / days), round1(totalCarbs / days), round1(totalFat / days)].forEach((v, i) => {
    const cell = ws.getCell(row, i + 2);
    cell.value = v;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF8FF' } };
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.border = { top: { style: 'medium', color: { argb: PROTEIN_BLUE } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet 3: Vízfogyasztás ───────────────────────────────────────────────────

function buildWaterSheet(wb: ExcelJS.Workbook, waterLogs: ExportWaterLog[], goalMl: number) {
  const ws = wb.addWorksheet('💧 Vízfogyasztás', {
    properties: { tabColor: { argb: WATER_BLUE } },
  });

  ws.mergeCells('A1:D1');
  const t = ws.getCell('A1');
  t.value = `Vízfogyasztás  |  Napi cél: ${goalMl} ml`;
  t.font = { bold: true, size: 13, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WATER_BLUE } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ['Dátum / Idő', 'Ivott (ml)', 'Napi összesen (ml)', 'Cél teljesítve?'].forEach((h, i) => {
    ws.getColumn(i + 1).width = [20, 14, 20, 17][i];
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    styleHeader(cell, WATER_BLUE);
  });
  ws.getRow(2).height = 26;

  // Napok összesítése
  const byDate = new Map<string, number>();
  for (const w of waterLogs) {
    const key = formatDate(w.createdAt);
    byDate.set(key, (byDate.get(key) ?? 0) + w.amountMl);
  }

  let row = 3;
  for (const w of waterLogs) {
    const dateKey = formatDate(w.createdAt);
    const dayTotal = byDate.get(dateKey) ?? 0;
    const done = dayTotal >= goalMl;
    const shade = row % 2 === 0;

    const vals = [formatDateTime(w.createdAt), w.amountMl, dayTotal, done ? '✅ Igen' : '❌ Nem'];
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      if (i > 0) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (i === 3 && done) cell.font = { color: { argb: 'FF2ECC71' }, bold: true };
      if (i === 3 && !done) cell.font = { color: { argb: 'FFE74C3C' } };
    });
    row++;
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet 4: Profil összefoglaló ─────────────────────────────────────────────

function buildProfileSheet(wb: ExcelJS.Workbook, user: ExportUserProfile, from: Date, to: Date) {
  const ws = wb.addWorksheet('👤 Profil', {
    properties: { tabColor: { argb: FAT_GREEN } },
  });

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 30;

  const addRow = (label: string, value: string | number, accent = false) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true, color: { argb: HEADER_DARK } };
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } };
    if (accent) {
      r.getCell(2).font = { bold: true, color: { argb: BRAND_ORANGE } };
    }
    r.height = 22;
  };

  // Fejléc
  ws.mergeCells('A1:B1');
  const t = ws.getCell('A1');
  t.value = 'VitaScan – Profil összefoglaló';
  t.font = { bold: true, size: 13, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FAT_GREEN } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;
  ws.addRow([]);

  addRow('Felhasználónév', user.username);
  addRow('Email', user.email);
  addRow('Előfizetés', user.tier === 'PREMIUM' ? '⭐ Premium' : 'Ingyenes', user.tier === 'PREMIUM');
  ws.addRow([]);
  addRow('Testsúly', user.weightKg ? `${user.weightKg} kg` : '—');
  addRow('Magasság', user.heightCm ? `${user.heightCm} cm` : '—');
  addRow('Napi kalória cél', user.dailyKcalGoal ? `${user.dailyKcalGoal} kcal` : '—');
  addRow('Napi vízcél', user.dailyWaterGoalMl ? `${user.dailyWaterGoalMl} ml` : '—');
  addRow('Cél', user.goal ? (GOAL_LABELS[user.goal] ?? user.goal) : '—');
  addRow('Aktivitás', user.activityLevel ? (ACTIVITY_LABELS[user.activityLevel] ?? user.activityLevel) : '—');
  ws.addRow([]);
  addRow('Export időszak', `${formatDate(from)} – ${formatDate(to)}`);
  addRow('Export időpontja', formatDateTime(new Date()));
  ws.addRow([]);
  addRow('Generálta', 'VitaScan Premium Export Engine');
}

// ─── Fő export függvény ───────────────────────────────────────────────────────

export async function generateExport(opts: ExportOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  wb.creator = 'VitaScan';
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  buildLogsSheet(wb, opts.logs, opts.from, opts.to);
  buildDailySummarySheet(wb, opts.logs, opts.from, opts.to);
  buildWaterSheet(wb, opts.waterLogs, opts.user.dailyWaterGoalMl ?? 2000);
  buildProfileSheet(wb, opts.user, opts.from, opts.to);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
