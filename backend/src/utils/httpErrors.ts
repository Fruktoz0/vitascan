import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export type MappedHttpError = {
  status: number;
  error: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: 'név',
  nameHu: 'magyar név',
  nameEn: 'angol név',
  brand: 'márka',
  barcode: 'vonalkód',
  externalId: 'külső azonosító',
  kcal: 'kalória',
  protein: 'fehérje',
  carbs: 'szénhidrát',
  fat: 'zsír',
  fiber: 'rost',
  sugar: 'cukor',
  servingSize: 'adag mérete',
  servingUnit: 'adag egysége',
  email: 'email',
  username: 'felhasználónév',
  password: 'jelszó',
  amountMl: 'mennyiség',
  weightKg: 'súly',
  valueCm: 'méret',
};

function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function formatZodError(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return 'Érvénytelen adatok.';

  const field = issue.path.length ? String(issue.path[0]) : '';
  const label = field ? labelForField(field) : '';

  switch (issue.code) {
    case 'too_small':
      if (issue.type === 'string') {
        return label
          ? `A(z) ${label} mező túl rövid.`
          : 'Az egyik megadott érték túl rövid.';
      }
      return label
        ? `A(z) ${label} értéke túl kicsi.`
        : 'Az egyik megadott érték túl kicsi.';
    case 'too_big':
      if (issue.type === 'string') {
        return label
          ? `A(z) ${label} mező túl hosszú.`
          : 'Az egyik megadott érték túl hosszú.';
      }
      return label
        ? `A(z) ${label} értéke túl nagy.`
        : 'Az egyik megadott érték túl nagy.';
    case 'invalid_type':
      if (issue.received === 'undefined' || issue.received === 'null') {
        return label ? `A(z) ${label} megadása kötelező.` : 'Hiányzó kötelező mező.';
      }
      return label
        ? `A(z) ${label} mező formátuma hibás.`
        : 'Egy mező formátuma hibás.';
    case 'invalid_enum_value':
      return label
        ? `A(z) ${label} értéke nem megengedett.`
        : 'Érvénytelen választott érték.';
    case 'invalid_string':
      return label
        ? `A(z) ${label} formátuma hibás.`
        : 'Hibás szöveges formátum.';
    default:
      if (issue.message && !/^Required$/i.test(issue.message) && issue.message.length < 120) {
        return label ? `${label}: ${issue.message}` : issue.message;
      }
      return 'Érvénytelen adatok. Ellenőrizd a megadott értékeket.';
  }
}

function uniqueConstraintMessage(target: string[] | string | undefined): string {
  const fields = Array.isArray(target) ? target : target ? [target] : [];
  if (fields.includes('barcode')) {
    return 'Már létezik étel ezzel a vonalkóddal az adatbázisban.';
  }
  if (fields.includes('externalId')) {
    return 'Ez az étel már szerepel az adatbázisban.';
  }
  if (fields.includes('email')) {
    return 'Ez az email cím már regisztrálva van.';
  }
  if (fields.includes('username')) {
    return 'Ez a felhasználónév már foglalt.';
  }
  if (fields.some((f) => f.includes('userId') && f.includes('foodId'))) {
    return 'Ez az elem már hozzá van adva.';
  }
  if (fields.some((f) => /date|day|loggedAt|measuredAt/i.test(f))) {
    return 'Erre a napra már van bejegyzés.';
  }
  return 'Ez az adat már létezik, nem menthető újra.';
}

function isUserFacingMessage(message: string): boolean {
  const m = message.trim();
  if (!m || m.length > 220) return false;
  if (/Internal Server Error|Prisma|ZodError|ECONN|stack|at\s+\S+\s+\(/i.test(m)) return false;
  // Prefer Hungarian / short product messages already set on thrown errors
  return true;
}

/** Map any thrown error to a stable HTTP status + Hungarian user-facing `error` string. */
export function mapErrorToHttp(err: unknown): MappedHttpError {
  if (err instanceof ZodError) {
    return { status: 400, error: formatZodError(err) };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? undefined;
      return { status: 409, error: uniqueConstraintMessage(target) };
    }
    if (err.code === 'P2025') {
      return { status: 404, error: 'A kért elem nem található.' };
    }
    if (err.code === 'P2003') {
      return { status: 400, error: 'Érvénytelen hivatkozás — a kapcsolódó elem nem létezik.' };
    }
    return { status: 400, error: 'Az adatbázis elutasította a műveletet. Ellenőrizd az adatokat.' };
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, error: 'Érvénytelen adatok az adatbázis művelethez.' };
  }

  const anyErr = err as {
    statusCode?: number;
    status?: number;
    code?: string;
    validation?: unknown;
    message?: string;
  };

  // Fastify validation / schema errors
  if (anyErr.validation || anyErr.code === 'FST_ERR_VALIDATION') {
    return { status: 400, error: 'Érvénytelen kérés. Ellenőrizd a megadott adatokat.' };
  }

  if (anyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return { status: 413, error: 'A kép túl nagy. Próbálj kisebb felbontású fotót.' };
  }

  const status =
    typeof anyErr.statusCode === 'number' && Number.isFinite(anyErr.statusCode)
      ? anyErr.statusCode
      : typeof anyErr.status === 'number' && Number.isFinite(anyErr.status)
        ? anyErr.status
        : 500;

  const rawMessage = typeof anyErr.message === 'string' ? anyErr.message.trim() : '';

  if (status >= 400 && status < 500 && rawMessage && isUserFacingMessage(rawMessage)) {
    return { status, error: rawMessage };
  }

  if (status === 401) {
    return { status, error: rawMessage && isUserFacingMessage(rawMessage) ? rawMessage : 'Bejelentkezés szükséges.' };
  }
  if (status === 403) {
    return { status, error: rawMessage && isUserFacingMessage(rawMessage) ? rawMessage : 'Nincs jogosultság ehhez a művelethez.' };
  }
  if (status === 404) {
    return { status, error: rawMessage && isUserFacingMessage(rawMessage) ? rawMessage : 'A kért elem nem található.' };
  }
  if (status === 429) {
    return {
      status,
      error: rawMessage && isUserFacingMessage(rawMessage) ? rawMessage : 'Túl sok kérés. Kérjük várjon egy kicsit.',
    };
  }
  if (status >= 400 && status < 500) {
    return {
      status,
      error: rawMessage && isUserFacingMessage(rawMessage) ? rawMessage : 'A kérés nem teljesíthető.',
    };
  }

  return { status: 500, error: 'Váratlan szerverhiba történt. Próbáld újra később.' };
}
