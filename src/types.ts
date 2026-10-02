export interface WhatsAppRawMessage {
  id: string;
  groupName: string;
  sender: string;
  timestamp: Date;
  dateStr: string;
  timeStr: string;
  text: string;
  mediaFileNames: string[];
}

export interface PhotoRecord {
  id: string;
  fileName: string;
  originalFileName: string;
  groupName: string;
  sender: string;
  timestamp: Date;
  isoWeek: number;
  isoYear: number;
  weekLabel: string; // e.g. "Semana 38-2026"
  dateKey: string; // "YYYY-MM-DD"

  // Field attributes extracted
  code: string; // normalized, e.g. "BSO 03" or "Não identificado"
  rawCodeMatched: string;
  km: string;
  rodovia: string;
  empresa: string;
  equipe: string;
  servico: string;
  messageText: string;
  contextMessageTimeDiffMinutes?: number;

  // Media data
  blob: Blob;
  dataUrl?: string;
  sizeBytes: number;

  // Cross reference with spreadsheet
  matchedSpreadsheetRow?: Record<string, any>;
  crossStatus: 'matched' | 'no_spreadsheet_match' | 'unidentified';
}

export interface SpreadsheetConfig {
  fileName: string;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  keyColumn: string;
  selectedColumns: string[];
  rows: Record<string, any>[];
  normalizedKeyMap: Map<string, Record<string, any>>;
}

export interface MissingSpreadsheetItem {
  key: string;
  normalizedKey: string;
  row: Record<string, any>;
}

export interface UnlistedWhatsItem {
  code: string;
  records: PhotoRecord[];
}

export interface MultiGroupItem {
  code: string;
  groups: string[];
  totalPhotos: number;
  records: PhotoRecord[];
}

export interface CrossConferenceResults {
  missingInWhatsApp: MissingSpreadsheetItem[]; // Lista A
  unlistedInSpreadsheet: UnlistedWhatsItem[];  // Lista B
  multiGroupItems: MultiGroupItem[];           // Lista C
}

export interface ParsingFileProgress {
  fileName: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  totalPhotosFound: number;
  errorDetail?: string;
}

export interface ExportConfig {
  namingPrefix: string; // Default "CONS_"
  groupingScheme: 'semana-item' | 'empresa-equipe-data' | 'item-semana' | 'mes-item' | 'grupo-item';
  maxZipMb: number; // Default 200
  includeIndexXlsx: boolean;
  includeAuditSheets: boolean;
}
