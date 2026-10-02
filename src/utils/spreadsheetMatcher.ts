import * as XLSX from 'xlsx';
import {
  PhotoRecord,
  SpreadsheetConfig,
  CrossConferenceResults,
  MissingSpreadsheetItem,
  UnlistedWhatsItem,
  MultiGroupItem,
} from '../types';

/**
 * Normaliza chave para cruzamento determinístico:
 * 1. Converte para string e maiúsculas
 * 2. Remove acentuação (NFD)
 * 3. Remove caracteres de pontuação, espaços, hífens e underlines
 * 4. Remove zeros à esquerda em blocos numéricos (ex: BSO-003 -> BSO3, BSO 03 -> BSO3)
 */
export function normalizeSpreadsheetKey(key: any): string {
  if (key === null || key === undefined) return '';
  let str = String(key).trim().toUpperCase();

  // Remove acentos
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remove espaços, traços, sublinhados, barras e pontos
  str = str.replace(/[\s\-_./\\()]/g, '');

  // Remove zeros à esquerda após letras (ex: BSO003 -> BSO3, DRE05 -> DRE5)
  str = str.replace(/([A-Z]+)0+(\d+)/g, '$1$2');

  return str;
}

export const NORMALIZATION_EXPLANATION =
  'Regra aplicada: 1. Maiúsculas · 2. Sem acentuação · 3. Remoção de hífens, barras e espaços · 4. Remoção de zeros à esquerda em sufixos numéricos (Ex: "BSO-003" e "bso 3" → "BSO3").';

/**
 * Lê o arquivo da planilha (Buffer ou ArrayBuffer) usando SheetJS
 */
export function parseSpreadsheetBuffer(
  buffer: ArrayBuffer,
  fileName: string
): { sheetNames: string[]; getSheetData: (sheetName: string) => { headers: string[]; rows: any[] } } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  return {
    sheetNames,
    getSheetData: (sheetName: string) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return { headers: [], rows: [] };

      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (!jsonRows.length) return { headers: [], rows: [] };

      const headers = Object.keys(jsonRows[0]);
      return { headers, rows: jsonRows };
    },
  };
}

/**
 * Cruza os registros de fotos do WhatsApp com a planilha carregada
 * e gera as 3 listas de conferência obrigatórias (a, b, c).
 */
export function crossReferenceWhatsAppWithSpreadsheet(
  photoRecords: PhotoRecord[],
  config: SpreadsheetConfig | null
): {
  updatedPhotos: PhotoRecord[];
  conference: CrossConferenceResults;
} {
  // Se não houver planilha configurada, apenas computa a lista C (multi-grupo)
  const multiGroupMap = new Map<string, PhotoRecord[]>();

  for (const photo of photoRecords) {
    if (photo.code && photo.code !== 'Não identificado') {
      const existing = multiGroupMap.get(photo.code) || [];
      existing.push(photo);
      multiGroupMap.set(photo.code, existing);
    }
  }

  const multiGroupItems: MultiGroupItem[] = [];
  multiGroupMap.forEach((records, code) => {
    const distinctGroups = Array.from(new Set(records.map((r) => r.groupName)));
    if (distinctGroups.length > 1) {
      multiGroupItems.push({
        code,
        groups: distinctGroups,
        totalPhotos: records.length,
        records,
      });
    }
  });

  if (!config || !config.keyColumn || !config.normalizedKeyMap.size) {
    const updatedPhotos = photoRecords.map((p) => ({
      ...p,
      crossStatus: (p.code === 'Não identificado' ? 'unidentified' : 'no_spreadsheet_match') as any,
    }));

    return {
      updatedPhotos,
      conference: {
        missingInWhatsApp: [],
        unlistedInSpreadsheet: [],
        multiGroupItems,
      },
    };
  }

  // Com planilha ativa:
  const matchedSpreadsheetKeys = new Set<string>();
  const unlistedCodeMap = new Map<string, PhotoRecord[]>();

  const updatedPhotos = photoRecords.map((photo) => {
    if (photo.code === 'Não identificado') {
      return {
        ...photo,
        crossStatus: 'unidentified' as const,
        matchedSpreadsheetRow: undefined,
      };
    }

    const normCode = normalizeSpreadsheetKey(photo.code);
    const matchedRow = config.normalizedKeyMap.get(normCode);

    if (matchedRow) {
      matchedSpreadsheetKeys.add(normCode);
      return {
        ...photo,
        crossStatus: 'matched' as const,
        matchedSpreadsheetRow: matchedRow,
      };
    } else {
      // Registrado no WhatsApp mas não encontrado na planilha
      const list = unlistedCodeMap.get(photo.code) || [];
      list.push(photo);
      unlistedCodeMap.set(photo.code, list);

      return {
        ...photo,
        crossStatus: 'no_spreadsheet_match' as const,
        matchedSpreadsheetRow: undefined,
      };
    }
  });

  // Lista A: itens da planilha SEM nenhum registro fotográfico no período
  const missingInWhatsApp: MissingSpreadsheetItem[] = [];
  for (const row of config.rows) {
    const rawVal = row[config.keyColumn];
    const normKey = normalizeSpreadsheetKey(rawVal);
    if (normKey && !matchedSpreadsheetKeys.has(normKey)) {
      missingInWhatsApp.push({
        key: String(rawVal),
        normalizedKey: normKey,
        row,
      });
    }
  }

  // Lista B: registros do WhatsApp com código que NÃO existe na planilha
  const unlistedInSpreadsheet: UnlistedWhatsItem[] = [];
  unlistedCodeMap.forEach((records, code) => {
    unlistedInSpreadsheet.push({
      code,
      records,
    });
  });

  return {
    updatedPhotos,
    conference: {
      missingInWhatsApp,
      unlistedInSpreadsheet,
      multiGroupItems,
    },
  };
}
