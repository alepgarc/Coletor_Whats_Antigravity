import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { PhotoRecord, ExportConfig, CrossConferenceResults, SpreadsheetConfig } from '../types';
import { formatDateToYYYYMMDD, formatDateTimeBR } from './dateUtils';

export interface ExportProgressCallback {
  (current: number, total: number, statusText: string): void;
}

/**
 * Sanitiza nomes de pasta para compatibilidade com Windows/Linux/Mac
 */
function sanitizeFolderName(name: string): string {
  if (!name) return 'Outros';
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Outros';
}

/**
 * Gera a planilha de índice e auditoria contendo:
 * - Aba 1: Índice de Mídias
 * - Aba 2: Lista A - Sem Evidência no WhatsApp
 * - Aba 3: Lista B - WhatsApp Não Previsto na Planilha
 * - Aba 4: Lista C - Itens com Duplicidade entre Grupos
 */
export function buildIndexWorkbook(
  photos: { record: PhotoRecord; exportedFileName: string; folderPath: string }[],
  spreadsheetConfig: SpreadsheetConfig | null,
  conference: CrossConferenceResults
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. Aba Índice Geral
  const indexRows = photos.map((item, idx) => {
    const r = item.record;
    const baseObj: Record<string, any> = {
      'Nº': idx + 1,
      'Pasta': item.folderPath,
      'Arquivo Exportado': item.exportedFileName,
      'Arquivo Original': r.fileName,
      'Código / Item': r.code,
      'Data': r.dateKey,
      'Hora': r.timestamp.toTimeString().split(' ')[0],
      'Semana ISO': r.weekLabel,
      'Remetente': r.sender,
      'Grupo WhatsApp': r.groupName,
      'Empresa': r.empresa,
      'Equipe': r.equipe,
      'Km / Estaca': r.km,
      'Rodovia': r.rodovia,
      'Serviço': r.servico,
      'Status Cruzamento':
        r.crossStatus === 'matched'
          ? 'Confirmado na Planilha'
          : r.crossStatus === 'unidentified'
          ? 'Não Identificado'
          : 'Sem Par na Planilha',
      'Mensagem WhatsApp': r.messageText,
    };

    // Incorpora colunas selecionadas da planilha se houver
    if (r.matchedSpreadsheetRow && spreadsheetConfig) {
      for (const col of spreadsheetConfig.selectedColumns) {
        baseObj[`[Planilha] ${col}`] = r.matchedSpreadsheetRow[col] ?? '';
      }
    }

    return baseObj;
  });

  const wsIndex = XLSX.utils.json_to_sheet(indexRows);
  XLSX.utils.book_append_sheet(wb, wsIndex, 'Índice de Mídias');

  // 2. Aba Lista A - Sem Evidência
  if (conference.missingInWhatsApp.length > 0 && spreadsheetConfig) {
    const missingRows = conference.missingInWhatsApp.map((item, idx) => ({
      'Nº': idx + 1,
      'Chave / Código': item.key,
      ...item.row,
    }));
    const wsMissing = XLSX.utils.json_to_sheet(missingRows);
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Lista A - Sem Evidência');
  }

  // 3. Aba Lista B - Não Consta na Planilha
  if (conference.unlistedInSpreadsheet.length > 0) {
    const unlistedRows = conference.unlistedInSpreadsheet.map((item, idx) => ({
      'Nº': idx + 1,
      'Código no WhatsApp': item.code,
      'Qtd Fotos Registradas': item.records.length,
      'Grupos Envolvidos': Array.from(new Set(item.records.map((r) => r.groupName))).join(', '),
      'Remetentes': Array.from(new Set(item.records.map((r) => r.sender))).join(', '),
      'Datas': Array.from(new Set(item.records.map((r) => r.dateKey))).join(', '),
    }));
    const wsUnlisted = XLSX.utils.json_to_sheet(unlistedRows);
    XLSX.utils.book_append_sheet(wb, wsUnlisted, 'Lista B - Não na Planilha');
  }

  // 4. Aba Lista C - Multi-Grupo (Duplicidade)
  if (conference.multiGroupItems.length > 0) {
    const multiRows = conference.multiGroupItems.map((item, idx) => ({
      'Nº': idx + 1,
      'Código': item.code,
      'Grupos com Registro': item.groups.join(' | '),
      'Total Fotos': item.totalPhotos,
      'Empresas': Array.from(new Set(item.records.map((r) => r.empresa))).join(', '),
    }));
    const wsMulti = XLSX.utils.json_to_sheet(multiRows);
    XLSX.utils.book_append_sheet(wb, wsMulti, 'Lista C - Multi-Grupo');
  }

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(wbOut);
}

/**
 * Determina o caminho de pasta para cada foto conforme o esquema selecionado
 */
export function getPhotoFolderPath(photo: PhotoRecord, scheme: ExportConfig['groupingScheme']): string {
  const sanitize = sanitizeFolderName;
  const itemFolder = sanitize(photo.code || 'Nao_Identificado');
  const semanaFolder = sanitize(photo.weekLabel);
  const empresaFolder = sanitize(photo.empresa || 'Empresa_Nao_Informada');
  const equipeFolder = sanitize(photo.equipe || 'Equipe_Geral');
  const dataFolder = sanitize(photo.dateKey);
  const grupoFolder = sanitize(photo.groupName);

  switch (scheme) {
    case 'semana-item':
      return `${semanaFolder}/${itemFolder}`;
    case 'empresa-equipe-data':
      return `${empresaFolder}/${equipeFolder}/${dataFolder}`;
    case 'item-semana':
      return `${itemFolder}/${semanaFolder}`;
    case 'mes-item': {
      const monthLabel = `Mes-${photo.dateKey.substring(0, 7)}`;
      return `${monthLabel}/${itemFolder}`;
    }
    case 'grupo-item':
      return `${grupoFolder}/${itemFolder}`;
    default:
      return `${semanaFolder}/${itemFolder}`;
  }
}

export interface PreparedPhotoItem {
  record: PhotoRecord;
  folderPath: string;
  exportedFileName: string;
  ext: string;
}

export function preparePhotosNamingAndFolders(
  photos: PhotoRecord[],
  exportConfig: ExportConfig
): PreparedPhotoItem[] {
  const prefix = (exportConfig.namingPrefix || 'CONS_').trim();
  const folderCounters = new Map<string, number>();
  const preparedPhotos: PreparedPhotoItem[] = [];

  for (const photo of photos) {
    const folderPath = getPhotoFolderPath(photo, exportConfig.groupingScheme);
    const count = (folderCounters.get(folderPath) || 0) + 1;
    folderCounters.set(folderPath, count);

    const extMatch = photo.fileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

    const ymd = formatDateToYYYYMMDD(photo.timestamp);
    const seqStr = String(count).padStart(3, '0');
    const exportedFileName = `${prefix}${ymd}_${seqStr}.${ext}`;

    preparedPhotos.push({
      record: photo,
      folderPath,
      exportedFileName,
      ext,
    });
  }

  return preparedPhotos;
}

/**
 * Realiza o empacotamento em ZIP com divisão em partes se ultrapassar maxZipMb (~200MB padrão),
 * sequencial contínuo por pasta, e download automático sequencial.
 */
export async function exportPhotosToZips(
  photos: PhotoRecord[],
  exportConfig: ExportConfig,
  spreadsheetConfig: SpreadsheetConfig | null,
  conference: CrossConferenceResults,
  onProgress?: ExportProgressCallback
): Promise<number> {
  const maxBytesPerZip = (exportConfig.maxZipMb || 200) * 1024 * 1024;
  const preparedPhotos = preparePhotosNamingAndFolders(photos, exportConfig);

  // Gera o arquivo .xlsx de índice
  let indexBytes: Uint8Array | null = null;
  if (exportConfig.includeIndexXlsx) {
    onProgress?.(0, preparedPhotos.length, 'Gerando planilha índice e relatórios de conferência...');
    indexBytes = buildIndexWorkbook(preparedPhotos, spreadsheetConfig, conference);
  }

  // Particionamento de ZIPs
  interface ZipPartition {
    zip: JSZip;
    currentSizeBytes: number;
    items: typeof preparedPhotos;
  }

  const partitions: ZipPartition[] = [];
  let currentZip = new JSZip();
  let currentSize = indexBytes ? indexBytes.byteLength : 0;
  let currentItems: typeof preparedPhotos = [];

  // Se tiver índice, adiciona na raiz do zip
  if (indexBytes) {
    currentZip.file('INDICE_E_CONFERENCIA_CAMPOS.xlsx', indexBytes);
  }

  for (let i = 0; i < preparedPhotos.length; i++) {
    const item = preparedPhotos[i];
    const itemSize = item.record.sizeBytes || 200000;

    // Se adicionar este item estourar o limite de ~200MB e já tivermos arquivos
    if (currentSize + itemSize > maxBytesPerZip && currentItems.length > 0) {
      partitions.push({
        zip: currentZip,
        currentSizeBytes: currentSize,
        items: currentItems,
      });

      // Cria novo zip
      currentZip = new JSZip();
      currentSize = 0;
      currentItems = [];
      if (indexBytes) {
        currentZip.file('INDICE_E_CONFERENCIA_CAMPOS.xlsx', indexBytes);
        currentSize += indexBytes.byteLength;
      }
    }

    // Adiciona o arquivo na estrutura de pasta do ZIP
    const zipInternalPath = `${item.folderPath}/${item.exportedFileName}`;
    currentZip.file(zipInternalPath, item.record.blob);

    currentSize += itemSize;
    currentItems.push(item);

    if (i % 10 === 0 || i === preparedPhotos.length - 1) {
      onProgress?.(
        i + 1,
        preparedPhotos.length,
        `Preparando arquivos (${i + 1}/${preparedPhotos.length})...`
      );
    }
  }

  if (currentItems.length > 0) {
    partitions.push({
      zip: currentZip,
      currentSizeBytes: currentSize,
      items: currentItems,
    });
  }

  // Gera os downloads com pequeno delay entre eles
  const totalParts = partitions.length;
  for (let partIdx = 0; partIdx < totalParts; partIdx++) {
    const part = partitions[partIdx];
    const partSuffix = totalParts > 1 ? `-parte${partIdx + 1}` : '';
    const zipName = `Medicao_Conservacao_${formatDateToYYYYMMDD(new Date())}${partSuffix}.zip`;

    onProgress?.(
      partIdx + 1,
      totalParts,
      `Comprimindo e baixando ${zipName} (${partIdx + 1}/${totalParts})...`
    );

    const zipBlob = await part.zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 5 },
    });

    triggerFileDownload(zipBlob, zipName);

    // Pausa de 1 segundo entre downloads para evitar bloqueio de popup do navegador
    if (partIdx < totalParts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  return totalParts;
}

/**
 * Salva as fotos e pastas DIRETAMENTE no disco local do usuário usando a File System Access API
 * (Suportado nativamente no Google Chrome, Microsoft Edge e navegadores Chromium no Desktop)
 */
export async function exportPhotosDirectlyToDirectory(
  dirHandle: any,
  photos: PhotoRecord[],
  config: ExportConfig,
  spreadsheetConfig: SpreadsheetConfig | null,
  conference: CrossConferenceResults,
  onProgress?: ExportProgressCallback
): Promise<{ totalFilesSaved: number; folderName: string }> {
  const preparedPhotos = preparePhotosNamingAndFolders(photos, config);
  const total = preparedPhotos.length;

  const dirCache = new Map<string, any>();
  dirCache.set('', dirHandle);

  const getOrCreateNestedDir = async (path: string): Promise<any> => {
    if (dirCache.has(path)) return dirCache.get(path);
    const parts = path.split('/').filter(Boolean);
    let current = dirHandle;
    let accPath = '';
    for (const part of parts) {
      accPath = accPath ? `${accPath}/${part}` : part;
      if (dirCache.has(accPath)) {
        current = dirCache.get(accPath);
      } else {
        current = await current.getDirectoryHandle(part, { create: true });
        dirCache.set(accPath, current);
      }
    }
    return current;
  };

  for (let i = 0; i < total; i++) {
    const item = preparedPhotos[i];
    const targetDir = await getOrCreateNestedDir(item.folderPath);
    const fileHandle = await targetDir.getFileHandle(item.exportedFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(item.record.blob);
    await writable.close();

    if (i % 5 === 0 || i === total - 1) {
      onProgress?.(
        i + 1,
        total,
        `Salvando arquivo ${i + 1} de ${total}: ${item.exportedFileName}...`
      );
    }
  }

  // Salva a planilha de índice no diretório raiz
  if (config.includeIndexXlsx) {
    onProgress?.(total, total, 'Gerando e gravando INDICE_E_CONFERENCIA_CAMPOS.xlsx...');
    const indexBytes = buildIndexWorkbook(preparedPhotos, spreadsheetConfig, conference);
    const xlsxHandle = await dirHandle.getFileHandle('INDICE_E_CONFERENCIA_CAMPOS.xlsx', { create: true });
    const writable = await xlsxHandle.createWritable();
    await writable.write(indexBytes);
    await writable.close();
  }

  return { totalFilesSaved: total, folderName: dirHandle.name || 'Pasta Selecionada' };
}

/**
 * Dispara o download de um Blob no navegador sem abrir popups
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
}
