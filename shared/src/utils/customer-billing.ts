import { SAT_CFDI_USES, SAT_TAX_REGIMES, type PersonType } from "../constants";

/**
 * Datos de facturación del cliente como **receptor** de un CFDI 4.0. Lógica
 * pura compartida entre Back (valida al crear/actualizar) y Front (valida antes
 * de mandar y pinta etiquetas). Copia duplicada; mantener ambas en sync.
 *
 * No emite facturas: solo guarda lo que el SAT exige para timbrar. Regla
 * todo-o-nada: con RFC son obligatorios razón social, régimen, uso de CFDI y
 * CP fiscal; el correo de facturación siempre es opcional.
 */

export const BILLING_FIELDS = [
  "taxId",
  "legalName",
  "taxRegime",
  "cfdiUse",
  "taxPostalCode",
  "billingEmail",
] as const;

export type BillingField = (typeof BILLING_FIELDS)[number];

export type CustomerBillingInfo = Record<BillingField, string | null>;

/** Lo que llega de un formulario o de un body: cualquier campo puede faltar. */
export type BillingInput = Partial<Record<BillingField, string | null | undefined>>;

/** 3–4 letras (Ñ y & incluidos), fecha AAMMDD y homoclave. 12 = moral, 13 = física. */
export const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const POSTAL_CODE_REGEX = /^\d{5}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Límite del SAT para el nombre del receptor. */
export const LEGAL_NAME_MAX_LENGTH = 254;

const PERSON_LABEL: Record<PersonType, string> = { fisica: "física", moral: "moral" };

/** Solo los campos de facturación presentes en `source` (undefined no cuenta). */
export function pickBillingFields(source: BillingInput | Record<string, unknown>): BillingInput {
  const picked: BillingInput = {};
  for (const field of BILLING_FIELDS) {
    const value = (source as Record<string, unknown>)[field];
    if (value !== undefined) picked[field] = value as string | null;
  }
  return picked;
}

/** True si el body trae al menos un campo de facturación (aunque sea vacío). */
export function hasBillingFields(source: BillingInput | Record<string, unknown>): boolean {
  return Object.keys(pickBillingFields(source)).length > 0;
}

function cleanText(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

/**
 * Deja los datos como se guardan: vacío → null, RFC en mayúsculas sin espacios
 * ni guiones, claves del SAT en mayúsculas, correo en minúsculas. La razón
 * social se respeta tal cual (debe coincidir con la Constancia).
 */
export function normalizeBillingInfo(input: BillingInput): CustomerBillingInfo {
  const taxId = cleanText(input.taxId);
  const taxRegime = cleanText(input.taxRegime);
  const cfdiUse = cleanText(input.cfdiUse);
  const taxPostalCode = cleanText(input.taxPostalCode);
  const billingEmail = cleanText(input.billingEmail);
  return {
    taxId: taxId ? taxId.toUpperCase().replace(/[\s-]/g, "") : null,
    legalName: cleanText(input.legalName),
    taxRegime: taxRegime ? taxRegime.toUpperCase() : null,
    cfdiUse: cfdiUse ? cfdiUse.toUpperCase() : null,
    taxPostalCode: taxPostalCode ? taxPostalCode.replace(/\s/g, "") : null,
    billingEmail: billingEmail ? billingEmail.toLowerCase() : null,
  };
}

/** Tipo de contribuyente que dice el RFC, o null si el RFC no es válido. */
export function personTypeFromTaxId(taxId: string | null | undefined): PersonType | null {
  const rfc = normalizeBillingInfo({ taxId }).taxId;
  if (!rfc || !RFC_REGEX.test(rfc)) return null;
  return rfc.length === 12 ? "moral" : "fisica";
}

/** Régimen fiscal vs. tipo de persona: el SAT rechaza la combinación equivocada. */
export function taxRegimesFor(person: PersonType | null) {
  if (!person) return [...SAT_TAX_REGIMES];
  return SAT_TAX_REGIMES.filter((regime) => (regime.persons as readonly string[]).includes(person));
}

export function cfdiUsesFor(person: PersonType | null) {
  if (!person) return [...SAT_CFDI_USES];
  return SAT_CFDI_USES.filter((use) => (use.persons as readonly string[]).includes(person));
}

export function taxRegimeLabel(code: string | null | undefined): string | null {
  const regime = SAT_TAX_REGIMES.find((item) => item.code === code);
  return regime ? `${regime.code} · ${regime.label}` : null;
}

export function cfdiUseLabel(code: string | null | undefined): string | null {
  const use = SAT_CFDI_USES.find((item) => item.code === code);
  return use ? `${use.code} · ${use.label}` : null;
}

/** Un cliente "tiene facturación" cuando tiene RFC: el resto viene con él. */
export function hasBillingInfo(customer: { taxId?: string | null } | null | undefined): boolean {
  return Boolean(customer?.taxId);
}

/**
 * Valida los datos **ya normalizados**. Devuelve el mensaje de error para
 * mostrar al usuario, o null si todo está bien (incluido "sin facturación").
 */
export function validateBillingInfo(info: CustomerBillingInfo): string | null {
  const { taxId, legalName, taxRegime, cfdiUse, taxPostalCode, billingEmail } = info;
  const anyFilled = BILLING_FIELDS.some((field) => info[field]);
  if (!anyFilled) return null;

  if (!taxId) return "Para guardar datos de facturación captura el RFC";
  if (!RFC_REGEX.test(taxId)) {
    return "El RFC no tiene un formato válido (12 caracteres para persona moral, 13 para persona física)";
  }
  const person = taxId.length === 12 ? "moral" : "fisica";

  const missing: string[] = [];
  if (!legalName) missing.push("razón social");
  if (!taxRegime) missing.push("régimen fiscal");
  if (!cfdiUse) missing.push("uso de CFDI");
  if (!taxPostalCode) missing.push("código postal fiscal");
  if (missing.length) return `Para facturar faltan: ${missing.join(", ")}`;

  if (legalName!.length > LEGAL_NAME_MAX_LENGTH) {
    return `La razón social no puede pasar de ${LEGAL_NAME_MAX_LENGTH} caracteres`;
  }

  const regime = SAT_TAX_REGIMES.find((item) => item.code === taxRegime);
  if (!regime) return "El régimen fiscal no está en el catálogo del SAT";
  if (!(regime.persons as readonly string[]).includes(person)) {
    return `El régimen ${regime.code} (${regime.label}) no aplica a una persona ${PERSON_LABEL[person]}`;
  }

  const use = SAT_CFDI_USES.find((item) => item.code === cfdiUse);
  if (!use) return "El uso de CFDI no está en el catálogo del SAT";
  if (!(use.persons as readonly string[]).includes(person)) {
    return `El uso de CFDI ${use.code} (${use.label}) no aplica a una persona ${PERSON_LABEL[person]}`;
  }

  if (!POSTAL_CODE_REGEX.test(taxPostalCode!)) return "El código postal fiscal debe tener 5 dígitos";
  if (billingEmail && !EMAIL_REGEX.test(billingEmail)) return "El correo de facturación no es válido";

  return null;
}
