// RG9 : numéro de reçu unique et continu par compte, ex. « CG-2026-000123 ».
// La séquence (incrément atomique par compte+année) est gérée en base ; ici on ne
// fait que formater le numéro à partir du préfixe du compte, de l'année et du rang.

export function formatReceiptNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}
