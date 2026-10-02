/**
 * Utilitários de data e cálculo de Semana ISO (Segunda a Domingo)
 * Suporte a todos os formatos de exportação do WhatsApp (iOS e Android, pt-BR e variações)
 */

export interface ParsedWhatsAppHeader {
  date: Date;
  dateStr: string;
  timeStr: string;
  sender: string;
  restOfLine: string;
}

// Limpa caracteres invisíveis que o WhatsApp costuma embutir (ex: \u200E, \u202F, \uFEFF)
export function cleanWhatsAppInvisibleChars(str: string): string {
  return str.replace(/[\u200E\u200F\u202A-\u202E\u202F\uFEFF]/g, '').trim();
}

/**
 * Tenta fazer o parse de uma linha do WhatsApp nos dois formatos obrigatórios:
 * Formato 1: [dd/mm/aa, hh:mm:ss] Remetente: mensagem  OU [dd/mm/aaaa, hh:mm:ss]
 * Formato 2: dd/mm/aaaa hh:mm - Remetente: mensagem   OU dd/mm/aa, hh:mm - Remetente: mensagem
 * Tolera AM/PM, segundos presentes ou ausentes, e traço ou dois-pontos.
 */
export function parseWhatsAppHeaderLine(rawLine: string): ParsedWhatsAppHeader | null {
  const line = cleanWhatsAppInvisibleChars(rawLine);
  if (!line) return null;

  // Regex para Formato 1: [dd/mm/yy(yy), hh:mm(:ss)( am/pm)?] Remetente: mensagem
  // Ex: [24/09/26, 14:30:15] Carlos Fiscal: segue foto
  const bracketRegex = /^\[(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?m\.?))?\]\s+([^:]+):\s*(.*)$/i;

  const match1 = line.match(bracketRegex);
  if (match1) {
    const day = parseInt(match1[1], 10);
    const month = parseInt(match1[2], 10) - 1;
    let year = parseInt(match1[3], 10);
    if (year < 100) year += 2000;

    let hours = parseInt(match1[4], 10);
    const minutes = parseInt(match1[5], 10);
    const seconds = match1[6] ? parseInt(match1[6], 10) : 0;
    const ampm = match1[7]?.toLowerCase().replace(/\./g, '');

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const date = new Date(year, month, day, hours, minutes, seconds);
    const dateStr = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return {
      date,
      dateStr,
      timeStr,
      sender: match1[8].trim(),
      restOfLine: match1[9] || '',
    };
  }

  // Regex para Formato 2: dd/mm/yy(yy)(,)? hh:mm(:ss)?( am/pm)? - Remetente: mensagem
  // Ex: 24/09/2026 14:30 - Carlos Fiscal: segue foto
  // Ex: 24/09/26, 14:30 - Carlos Fiscal: segue foto
  const dashRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?m\.?))?\s*[-–—]\s+([^:]+):\s*(.*)$/i;

  const match2 = line.match(dashRegex);
  if (match2) {
    const day = parseInt(match2[1], 10);
    const month = parseInt(match2[2], 10) - 1;
    let year = parseInt(match2[3], 10);
    if (year < 100) year += 2000;

    let hours = parseInt(match2[4], 10);
    const minutes = parseInt(match2[5], 10);
    const seconds = match2[6] ? parseInt(match2[6], 10) : 0;
    const ampm = match2[7]?.toLowerCase().replace(/\./g, '');

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const date = new Date(year, month, day, hours, minutes, seconds);
    const dateStr = `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return {
      date,
      dateStr,
      timeStr,
      sender: match2[8].trim(),
      restOfLine: match2[9] || '',
    };
  }

  return null;
}

/**
 * Calcula a Semana ISO 8601 (segunda-feira a domingo)
 * e o ano correspondente da semana ISO
 */
export function getISOWeekAndYear(date: Date): { isoWeek: number; isoYear: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // No ISO, segunda-feira é dia 1 e domingo é dia 7
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return {
    isoWeek,
    isoYear: d.getUTCFullYear(),
  };
}

export function formatISOWeekLabel(isoWeek: number, isoYear: number): string {
  return `Semana-${String(isoWeek).padStart(2, '0')}-${isoYear}`;
}

export function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function formatDateToDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateTimeBR(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}
