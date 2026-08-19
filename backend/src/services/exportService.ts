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
  loggedDate: Date;
  totalMl: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExportWeightLog {
  loggedDate: Date;
  weightKg: number;
}

export interface ExportBodyLog {
  loggedDate: Date;
  bodyPart: string;
  valueCm: number;
}

export interface ExportBodyFatLog {
  loggedDate: Date;
  fatPercent: number;
}

export interface ExportWorkout {
  startedAt: Date;
  title: string | null;
  activityType: string;
  durationMin: number;
  activeEnergyKcal: number | null;
  distanceKm: number | null;
}

export interface ExportNote {
  loggedDate: Date;
  content: string;
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
  weightLogs: ExportWeightLog[];
  bodyLogs: ExportBodyLog[];
  fatLogs: ExportBodyFatLog[];
  workouts: ExportWorkout[];
  notes: ExportNote[];
  user: ExportUserProfile;
}

// ─── Konstansok ───────────────────────────────────────────────────────────────

const MEAL_LABELS: Record<string, string> = {
  BREAKFAST: 'Reggeli',
  TIZORAI: 'Tízórai',
  LUNCH: 'Ebéd',
  UZSONNA: 'Uzsonna',
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

const BODY_LABELS: Record<string, string> = {
  ARM: 'Kar',
  THIGH: 'Comb',
  WAIST: 'Derék',
  FOREARM: 'Alkar',
  HIP: 'Csípő',
  CHEST: 'Mellkas',
  CALF: 'Vádli',
};

const BRAND_ORANGE = 'FFFF6B35';
const BRAND_LIGHT = 'FFFFF0EA';
const PROTEIN_BLUE = 'FF4A90D9';
const CARBS_YELLOW = 'FFF5A623';
const FAT_GREEN = 'FF2ECC71';
const FIBER_PURPLE = 'FF9B59B6';
const WATER_BLUE = 'FF7EC8E3';
const HEADER_DARK = 'FF1A1A2E';
const WHITE = 'FFFFFFFF';
const LIGHT_GRAY = 'FFF8F8F8';
const MID_GRAY = 'FFE8E8E8';
const SKY = 'FFE3F2FD';
const ON_TARGET = 'FFC8E6C9';
const OVER_GOAL = 'FFFFE0B2';
const UNDER_GOAL = 'FFBBDEFB';

export const EXPORT_SHEET_NAMES = [
  'Összefoglaló',
  'Napló',
  'Napi összesítők',
  'Vízfogyasztás',
  'Testsúly',
  'Testméretek',
  'Testzsír',
  'Edzések',
  'Jegyzetek',
  'Profil',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('hu-HU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (d.getTime() <= end.getTime()) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
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

function writeTitle(ws: ExcelJS.Worksheet, cols: number, text: string, color: string) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = text;
  t.font = { bold: true, size: 13, color: { argb: WHITE } };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;
}

function writeHeaders(ws: ExcelJS.Worksheet, headers: string[], widths: number[], color: string) {
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = widths[i];
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    styleHeader(cell, color);
  });
  ws.getRow(2).height = 26;
}

function applyRow(ws: ExcelJS.Worksheet, row: number, values: Array<string | number>, shade: boolean) {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    styleDataCell(cell, shade);
    if (typeof v === 'number') cell.alignment = { horizontal: 'right', vertical: 'middle' };
    if (i === 0) cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
}

// ─── Sheet: Összefoglaló ──────────────────────────────────────────────────────

function buildSummarySheet(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('Összefoglaló', {
    properties: { tabColor: { argb: HEADER_DARK } },
  });
  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 28;

  writeTitle(ws, 2, `VitaScan – Összefoglaló  |  ${formatDate(opts.from)} – ${formatDate(opts.to)}`, HEADER_DARK);

  const days = eachDate(opts.from, opts.to);
  const logsByDay = new Map<string, ExportDailyLog[]>();
  for (const log of opts.logs) {
    const key = ymd(log.createdAt);
    if (!logsByDay.has(key)) logsByDay.set(key, []);
    logsByDay.get(key)!.push(log);
  }
  const loggedDays = [...logsByDay.keys()].length;
  const totals = opts.logs.reduce(
    (a, l) => ({
      kcal: a.kcal + l.kcal,
      protein: a.protein + l.protein,
      carbs: a.carbs + l.carbs,
      fat: a.fat + l.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const denom = Math.max(loggedDays, 1);
  const goal = opts.user.dailyKcalGoal ?? 2000;

  const addRow = (r: number, label: string, value: string | number, accent = false) => {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, color: { argb: HEADER_DARK } };
    ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    ws.getCell(r, 2).value = value;
    ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accent ? BRAND_LIGHT : WHITE } };
    if (accent) ws.getCell(r, 2).font = { bold: true, color: { argb: BRAND_ORANGE } };
    ws.getRow(r).height = 22;
  };

  addRow(3, 'Időszak', `${formatDate(opts.from)} – ${formatDate(opts.to)}`);
  addRow(4, 'Naptári napok', days.length);
  addRow(5, 'Naplózott napok', loggedDays, true);
  addRow(6, 'Ételbejegyzések', opts.logs.length);
  addRow(7, 'Összes kalória (kcal)', round1(totals.kcal), true);
  addRow(8, 'Napi átlag kcal (naplózott napokra)', Math.round(totals.kcal / denom));
  addRow(9, 'Napi kalória cél', `${goal} kcal`);
  addRow(10, 'Átlag fehérje (g)', round1(totals.protein / denom));
  addRow(11, 'Átlag szénhidrát (g)', round1(totals.carbs / denom));
  addRow(12, 'Átlag zsír (g)', round1(totals.fat / denom));
  addRow(13, 'Vízbejegyzések', opts.waterLogs.length);
  addRow(14, 'Testsúly mérések', opts.weightLogs.length);
  addRow(15, 'Testméret mérések', opts.bodyLogs.length);
  addRow(16, 'Testzsír mérések', opts.fatLogs.length);
  addRow(17, 'Edzések', opts.workouts.length);
  addRow(18, 'Napi jegyzetek', opts.notes.length);
}

// ─── Sheet: Napló ─────────────────────────────────────────────────────────────

function buildLogsSheet(wb: ExcelJS.Workbook, logs: ExportDailyLog[], from: Date, to: Date) {
  const ws = wb.addWorksheet('Napló', {
    properties: { tabColor: { argb: BRAND_ORANGE } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  writeTitle(ws, 12, `VitaScan – Tápanyagnapló  |  ${formatDate(from)} – ${formatDate(to)}`, HEADER_DARK);

  const headers = [
    'Dátum',
    'Idő',
    'Étel neve',
    'Étkezés',
    'Mennyiség (g)',
    'Kalória (kcal)',
    'Fehérje (g)',
    'Szénhidrát (g)',
    'Zsír (g)',
    'Rost (g)',
    'Cukor (g)',
    'Forrás',
  ];
  const widths = [14, 8, 28, 13, 14, 14, 13, 15, 12, 12, 12, 11];
  writeHeaders(ws, headers, widths, HEADER_DARK);

  let row = 3;
  let prevDate = '';

  for (const log of logs) {
    const dateStr = formatDate(log.createdAt);
    if (dateStr !== prevDate && row > 3) {
      const sepRow = ws.getRow(row);
      sepRow.height = 6;
      ws.mergeCells(row, 1, row, 12);
      ws.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MID_GRAY } };
      row++;
    }

    const values: Array<string | number> = [
      dateStr,
      formatTime(log.createdAt),
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
    const shade = row % 2 === 0;
    values.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      if (i >= 4 && typeof v === 'number') cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (i === 2) cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });
    prevDate = dateStr;
    row++;
  }

  if (logs.length > 0) {
    row++;
    const totals = logs.reduce(
      (acc, l) => ({
        kcal: acc.kcal + l.kcal,
        protein: acc.protein + l.protein,
        carbs: acc.carbs + l.carbs,
        fat: acc.fat + l.fat,
        fiber: acc.fiber + (l.fiber ?? 0),
        sugar: acc.sugar + (l.sugar ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 },
    );

    ws.mergeCells(row, 1, row, 4);
    const sumLabelCell = ws.getCell(row, 1);
    sumLabelCell.value = `ÖSSZESÍTÉS (${logs.length} bejegyzés)`;
    sumLabelCell.font = { bold: true, color: { argb: WHITE } };
    sumLabelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

    [
      { col: 5, val: '' as string | number },
      { col: 6, val: round1(totals.kcal) },
      { col: 7, val: round1(totals.protein) },
      { col: 8, val: round1(totals.carbs) },
      { col: 9, val: round1(totals.fat) },
      { col: 10, val: round1(totals.fiber) },
      { col: 11, val: round1(totals.sugar) },
      { col: 12, val: '' },
    ].forEach(({ col, val }) => {
      const cell = ws.getCell(row, col);
      cell.value = val;
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_LIGHT } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'medium', color: { argb: BRAND_ORANGE } } };
    });
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  ws.autoFilter = { from: 'A2', to: 'L2' };
}

// ─── Sheet: Napi összesítők ───────────────────────────────────────────────────

function buildDailySummarySheet(wb: ExcelJS.Workbook, opts: ExportOptions) {
  const ws = wb.addWorksheet('Napi összesítők', {
    properties: { tabColor: { argb: PROTEIN_BLUE } },
  });

  writeTitle(ws, 10, 'Napi összesítők', PROTEIN_BLUE);
  writeHeaders(
    ws,
    [
      'Dátum',
      'Kalória',
      'Fehérje (g)',
      'Szénhidrát (g)',
      'Zsír (g)',
      'Víz (ml)',
      'Testsúly (kg)',
      'Bejegyzések',
      'Eltérés a céltól',
      'Cél %',
    ],
    [14, 12, 14, 16, 12, 12, 14, 13, 16, 10],
    PROTEIN_BLUE,
  );

  const goal = opts.user.dailyKcalGoal ?? 2000;
  const logsByDay = new Map<string, ExportDailyLog[]>();
  for (const log of opts.logs) {
    const key = ymd(log.createdAt);
    if (!logsByDay.has(key)) logsByDay.set(key, []);
    logsByDay.get(key)!.push(log);
  }
  const waterByDay = new Map<string, number>();
  for (const w of opts.waterLogs) {
    waterByDay.set(isoDate(w.loggedDate), w.totalMl);
  }
  const weightByDay = new Map<string, number>();
  for (const w of opts.weightLogs) {
    weightByDay.set(isoDate(w.loggedDate), w.weightKg);
  }

  let row = 3;
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let daysWithLogs = 0;

  for (const day of eachDate(opts.from, opts.to)) {
    const key = ymd(day);
    const iso = isoDate(day);
    const dayLogs = logsByDay.get(key) ?? logsByDay.get(iso) ?? [];
    const shade = row % 2 === 0;
    const sum = dayLogs.reduce(
      (a, l) => ({
        kcal: a.kcal + l.kcal,
        protein: a.protein + l.protein,
        carbs: a.carbs + l.carbs,
        fat: a.fat + l.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const water = waterByDay.get(key) ?? waterByDay.get(iso);
    const weight = weightByDay.get(key) ?? weightByDay.get(iso);
    const empty = dayLogs.length === 0;
    const delta = empty ? null : Math.round(sum.kcal - goal);
    const pct = empty || goal <= 0 ? null : Math.round((sum.kcal / goal) * 100);

    if (!empty) {
      totalKcal += sum.kcal;
      totalProtein += sum.protein;
      totalCarbs += sum.carbs;
      totalFat += sum.fat;
      daysWithLogs++;
    }

    const vals: Array<string | number> = [
      formatDate(day),
      empty ? '—' : round1(sum.kcal),
      empty ? '—' : round1(sum.protein),
      empty ? '—' : round1(sum.carbs),
      empty ? '—' : round1(sum.fat),
      water != null ? water : '—',
      weight != null ? round1(weight) : '—',
      dayLogs.length,
      delta == null ? '—' : delta > 0 ? `+${delta}` : String(delta),
      pct == null ? '—' : `${pct}%`,
    ];
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      if (i > 0) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });

    const kcalCell = ws.getCell(row, 2);
    if (empty) {
      kcalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    } else if (Math.abs(sum.kcal - goal) <= goal * 0.1) {
      kcalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ON_TARGET } };
    } else if (sum.kcal > goal) {
      kcalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OVER_GOAL } };
    } else {
      kcalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: UNDER_GOAL } };
    }
    row++;
  }

  const denom = Math.max(daysWithLogs, 1);
  ws.mergeCells(row, 1, row, 1);
  const avgLabel = ws.getCell(row, 1);
  avgLabel.value = 'Napi átlag (naplózott)';
  avgLabel.font = { bold: true };
  avgLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SKY } };
  [round1(totalKcal / denom), round1(totalProtein / denom), round1(totalCarbs / denom), round1(totalFat / denom)].forEach(
    (v, i) => {
      const cell = ws.getCell(row, i + 2);
      cell.value = v;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SKY } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    },
  );

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  ws.autoFilter = { from: 'A2', to: 'J2' };
}

// ─── Sheet: Víz ───────────────────────────────────────────────────────────────

function buildWaterSheet(wb: ExcelJS.Workbook, waterLogs: ExportWaterLog[], goalMl: number) {
  const ws = wb.addWorksheet('Vízfogyasztás', {
    properties: { tabColor: { argb: WATER_BLUE } },
  });

  writeTitle(ws, 4, `Vízfogyasztás  |  Napi cél: ${goalMl} ml`, WATER_BLUE);
  writeHeaders(ws, ['Dátum', 'Ivott (ml)', 'Napi cél (ml)', 'Cél teljesítve?'], [16, 14, 16, 18], WATER_BLUE);

  let row = 3;
  for (const w of waterLogs) {
    const dayTotal = w.totalMl;
    const done = dayTotal >= goalMl;
    const shade = row % 2 === 0;
    const vals: Array<string | number> = [formatDate(w.loggedDate), dayTotal, goalMl, done ? 'Igen' : 'Nem'];
    vals.forEach((v, i) => {
      const cell = ws.getCell(row, i + 1);
      cell.value = v;
      styleDataCell(cell, shade);
      if (i > 0) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (i === 3 && done) cell.font = { color: { argb: FAT_GREEN }, bold: true };
      if (i === 3 && !done) cell.font = { color: { argb: 'FFE74C3C' } };
    });
    row++;
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet: Testsúly ──────────────────────────────────────────────────────────

function buildWeightSheet(wb: ExcelJS.Workbook, logs: ExportWeightLog[]) {
  const ws = wb.addWorksheet('Testsúly', {
    properties: { tabColor: { argb: FAT_GREEN } },
  });
  writeTitle(ws, 3, 'Testsúly', FAT_GREEN);
  writeHeaders(ws, ['Dátum', 'Testsúly (kg)', 'Változás (kg)'], [16, 16, 16], FAT_GREEN);

  const sorted = [...logs].sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
  let row = 3;
  let prev: number | null = null;
  for (const w of sorted) {
    const delta = prev == null ? '—' : round1(w.weightKg - prev);
    applyRow(ws, row, [formatDate(w.loggedDate), round1(w.weightKg), delta], row % 2 === 0);
    prev = w.weightKg;
    row++;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet: Testméretek ───────────────────────────────────────────────────────

function buildBodySheet(wb: ExcelJS.Workbook, logs: ExportBodyLog[]) {
  const ws = wb.addWorksheet('Testméretek', {
    properties: { tabColor: { argb: FIBER_PURPLE } },
  });
  writeTitle(ws, 3, 'Testméretek', FIBER_PURPLE);
  writeHeaders(ws, ['Dátum', 'Testrész', 'Érték (cm)'], [16, 18, 14], FIBER_PURPLE);

  const sorted = [...logs].sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
  let row = 3;
  for (const b of sorted) {
    applyRow(
      ws,
      row,
      [formatDate(b.loggedDate), BODY_LABELS[b.bodyPart] ?? b.bodyPart, round1(b.valueCm)],
      row % 2 === 0,
    );
    row++;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet: Testzsír ──────────────────────────────────────────────────────────

function buildFatSheet(wb: ExcelJS.Workbook, logs: ExportBodyFatLog[]) {
  const ws = wb.addWorksheet('Testzsír', {
    properties: { tabColor: { argb: 'FF81C784' } },
  });
  writeTitle(ws, 3, 'Testzsír', 'FF81C784');
  writeHeaders(ws, ['Dátum', 'Testzsír (%)', 'Változás (%)'], [16, 16, 16], 'FF81C784');

  const sorted = [...logs].sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
  let row = 3;
  let prev: number | null = null;
  for (const f of sorted) {
    const delta = prev == null ? '—' : round1(f.fatPercent - prev);
    applyRow(ws, row, [formatDate(f.loggedDate), round1(f.fatPercent), delta], row % 2 === 0);
    prev = f.fatPercent;
    row++;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

function buildWorkoutSheet(wb: ExcelJS.Workbook, logs: ExportWorkout[]) {
  const ws = wb.addWorksheet('Edzések', {
    properties: { tabColor: { argb: BRAND_ORANGE } },
  });
  writeTitle(ws, 6, 'Edzések', BRAND_ORANGE);
  writeHeaders(
    ws,
    ['Dátum / idő', 'Típus', 'Cím', 'Időtartam (perc)', 'Energia (kcal)', 'Távolság (km)'],
    [20, 18, 24, 16, 16, 16],
    BRAND_ORANGE,
  );

  const sorted = [...logs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  let row = 3;
  for (const w of sorted) {
    applyRow(
      ws,
      row,
      [
        formatDateTime(w.startedAt),
        w.activityType,
        w.title ?? '—',
        round1(w.durationMin),
        w.activeEnergyKcal != null ? round1(w.activeEnergyKcal) : '—',
        w.distanceKm != null ? round1(w.distanceKm) : '—',
      ],
      row % 2 === 0,
    );
    row++;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet: Jegyzetek ─────────────────────────────────────────────────────────

function buildNotesSheet(wb: ExcelJS.Workbook, notes: ExportNote[]) {
  const ws = wb.addWorksheet('Jegyzetek', {
    properties: { tabColor: { argb: CARBS_YELLOW } },
  });
  writeTitle(ws, 2, 'Napi jegyzetek', CARBS_YELLOW);
  writeHeaders(ws, ['Dátum', 'Jegyzet'], [16, 70], CARBS_YELLOW);

  const sorted = [...notes].sort((a, b) => a.loggedDate.getTime() - b.loggedDate.getTime());
  let row = 3;
  for (const n of sorted) {
    const shade = row % 2 === 0;
    const dateCell = ws.getCell(row, 1);
    dateCell.value = formatDate(n.loggedDate);
    styleDataCell(dateCell, shade);
    const textCell = ws.getCell(row, 2);
    textCell.value = n.content;
    styleDataCell(textCell, shade);
    textCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
    ws.getRow(row).height = Math.min(80, 18 + Math.floor(n.content.length / 60) * 14);
    row++;
  }
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
}

// ─── Sheet: Profil ────────────────────────────────────────────────────────────

function buildProfileSheet(wb: ExcelJS.Workbook, user: ExportUserProfile, from: Date, to: Date) {
  const ws = wb.addWorksheet('Profil', {
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

  writeTitle(ws, 2, 'VitaScan – Profil összefoglaló', FAT_GREEN);
  ws.addRow([]);

  addRow('Felhasználónév', user.username);
  addRow('Email', user.email);
  addRow('Előfizetés', user.tier === 'PREMIUM' ? 'Premium' : 'Ingyenes', user.tier === 'PREMIUM');
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
}

// ─── Fő export függvény ───────────────────────────────────────────────────────

export async function generateExport(opts: ExportOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  wb.creator = 'VitaScan';
  wb.created = new Date();
  wb.modified = new Date();
  wb.properties.date1904 = false;

  buildSummarySheet(wb, opts);
  buildLogsSheet(wb, opts.logs, opts.from, opts.to);
  buildDailySummarySheet(wb, opts);
  buildWaterSheet(wb, opts.waterLogs, opts.user.dailyWaterGoalMl ?? 2000);
  buildWeightSheet(wb, opts.weightLogs);
  buildBodySheet(wb, opts.bodyLogs);
  buildFatSheet(wb, opts.fatLogs);
  buildWorkoutSheet(wb, opts.workouts);
  buildNotesSheet(wb, opts.notes);
  buildProfileSheet(wb, opts.user, opts.from, opts.to);

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
