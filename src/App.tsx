/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import {
  PhotoRecord,
  SpreadsheetConfig,
  CrossConferenceResults,
  ParsingFileProgress,
} from './types';
import { Navbar } from './components/Navbar';
import { DropZone } from './components/DropZone';
import { SpreadsheetPicker } from './components/SpreadsheetPicker';
import { TimelineFilter } from './components/TimelineFilter';
import { FilterBar, FilterState } from './components/FilterBar';
import { PhotoGallery } from './components/PhotoGallery';
import { PhotoComparisonModal } from './components/PhotoComparisonModal';
import { PhotoDetailModal } from './components/PhotoDetailModal';
import { SummaryTable } from './components/SummaryTable';
import { ConferenceListsView } from './components/ConferenceListsView';
import { ExportModal } from './components/ExportModal';
import { ValidationTestTab } from './components/ValidationTestTab';
import { ExtensionTab } from './components/ExtensionTab';

import {
  parseWhatsAppChatTxt,
  linkPhotosToMessages,
} from './utils/whatsappParser';
import * as XLSX from 'xlsx';
import {
  getISOWeekAndYear,
  formatISOWeekLabel,
  formatDateToDateKey,
} from './utils/dateUtils';
import {
  parseSpreadsheetBuffer,
  crossReferenceWhatsAppWithSpreadsheet,
  normalizeSpreadsheetKey,
} from './utils/spreadsheetMatcher';
import { createSampleWhatsAppZips } from './utils/sampleDataGenerator';

const DEFAULT_PREFIXES = [
  'BSO',
  'SER',
  'CON',
  'PAV',
  'ROC',
  'DRE',
  'CAP',
  'SGP',
  'REC',
  'TCC',
  'TAP',
  'OAE',
  'SIN',
  'TER',
  'FAI',
  'MED',
  'VAL',
];

const INITIAL_FILTERS: FilterState = {
  searchQuery: '',
  itemCode: '',
  groupName: '',
  sender: '',
  empresa: '',
  equipe: '',
  crossStatus: 'all',
  dateStart: '',
  dateEnd: '',
  sortBy: 'date_desc',
};

export default function App() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<SpreadsheetConfig | null>(null);
  const [prefixes, setPrefixes] = useState<string[]>(DEFAULT_PREFIXES);
  const [windowMinutes, setWindowMinutes] = useState<number>(10);
  const [fileProgressList, setFileProgressList] = useState<ParsingFileProgress[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);

  // Tab & Navigation State
  const [activeTab, setActiveTab] = useState<'gallery' | 'summary' | 'conference' | 'tests' | 'extension'>('gallery');
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);

  // Comparison & Modals
  const [selectedForCompare, setSelectedForCompare] = useState<PhotoRecord[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const [activeDetailPhoto, setActiveDetailPhoto] = useState<PhotoRecord | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Computa cruzamento com a planilha
  const { updatedPhotos, conference } = useMemo(() => {
    return crossReferenceWhatsAppWithSpreadsheet(photos, spreadsheetConfig);
  }, [photos, spreadsheetConfig]);

  // Contagem de grupos
  const uniqueGroupsCount = useMemo(() => {
    const s = new Set<string>();
    for (const p of updatedPhotos) {
      if (p.groupName) s.add(p.groupName);
    }
    return s.size;
  }, [updatedPhotos]);

  /**
   * Processamento de arquivos do WhatsApp (.ZIP ou pastas com fotos e .txt)
   */
  const processWhatsAppFiles = useCallback(
    async (files: File[]) => {
      setIsProcessing(true);
      const newlyFoundPhotos: PhotoRecord[] = [];

      // Separa zips de arquivos soltos
      const zipFiles = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
      const looseFiles = files.filter((f) => !f.name.toLowerCase().endsWith('.zip'));

      const progressItems: ParsingFileProgress[] = [];

      // 1. Processa arquivos .ZIP
      for (let i = 0; i < zipFiles.length; i++) {
        const file = zipFiles[i];
        progressItems.push({
          fileName: file.name,
          status: 'processing',
          totalPhotosFound: 0,
        });
        setFileProgressList([...progressItems]);

        try {
          const buffer = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(buffer);
          const groupName = file.name.replace(/\.zip$/i, '').trim();

          let chatText = '';
          const textFiles = Object.keys(zip.files).filter(
            (k) => !zip.files[k].dir && /\.txt$/i.test(k)
          );

          if (textFiles.length > 0) {
            const chosenFile = textFiles.find((k) => k.toLowerCase().includes('_chat')) || textFiles[0];
            chatText = await zip.files[chosenFile].async('text');
          }

          const mediaFiles = new Map<string, { blob: Blob; size: number }>();
          const imageExtensions = /\.(jpe?g|png|webp|heic)$/i;

          for (const path in zip.files) {
            const entry = zip.files[path];
            if (!entry.dir && imageExtensions.test(path)) {
              const mime = path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
              const blob = await entry.async('blob');
              mediaFiles.set(path, { blob: new Blob([blob], { type: mime }), size: blob.size });
            }
          }

          // Identifica se o ZIP contém a planilha de índice da Extensão FiscalizACampo ou se é do WhatsApp celular
          const xlsxFiles = Object.keys(zip.files).filter(
            (k) => !zip.files[k].dir && /\.xlsx$/i.test(k)
          );

          let records: PhotoRecord[] = [];

          if (xlsxFiles.length > 0) {
            // ZIP gerado pela Extensão Oficial FiscalizACampo
            const xlsxBuf = await zip.files[xlsxFiles[0]].async('arraybuffer');
            const wb = XLSX.read(xlsxBuf, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]);

            const rowMap = new Map<string, any>();
            for (const r of rows) {
              if (r.Arquivo) rowMap.set(String(r.Arquivo).toLowerCase(), r);
              if (r.Pasta && r.Arquivo) rowMap.set(`${String(r.Pasta)}/${String(r.Arquivo)}`.toLowerCase(), r);
            }

            for (const [path, fileData] of mediaFiles.entries()) {
              const baseName = path.split('/').pop() || path;
              const metaRow = rowMap.get(baseName.toLowerCase()) || rowMap.get(path.toLowerCase()) || {};

              const pathParts = path.split('/');
              const folderEmpresa = pathParts.length > 2 ? pathParts[0] : '';
              const folderEquipe = pathParts.length > 2 ? pathParts[1] : '';

              const empresa = metaRow.Empresa || folderEmpresa || 'Não informado';
              const equipe = metaRow.Equipe || folderEquipe || 'Não informado';
              const code = metaRow.Item || metaRow['Código / Item'] || 'Não identificado';
              const km = metaRow.km || metaRow.Km || '';
              const rodovia = metaRow.Rodovia || '';
              const servico = metaRow.Serviço || metaRow.Servico || 'Conservação';
              const group = metaRow.Grupo || groupName;
              const dateStr = metaRow.Data_Detectada || metaRow.Data || '';

              let timestamp = new Date();
              let dateFound = false;

              // 1. Tenta extrair a data real da coluna do Excel (formato dd/mm/aaaa ou dd/mm/aa)
              if (dateStr && dateStr !== 'Atual') {
                const parts = String(dateStr).trim().split(/[\/\-]/);
                if (parts.length === 3) {
                  const d = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10) - 1;
                  let y = parseInt(parts[2], 10);
                  if (parts[2].length === 2) {
                    y = 2000 + y;
                  }
                  // Aceita apenas datas válidas no intervalo moderno 2020-2035
                  if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y >= 2020 && y <= 2035 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
                    timestamp = new Date(y, m, d, 12, 0, 0);
                    dateFound = true;
                  }
                }
              }

              // 2. Se a planilha não trouxe data válida, extrai diretamente do nome do arquivo (CONS_YYYYMMDD_seq.jpg)
              if (!dateFound) {
                const nameMatch = baseName.match(/CONS_(\d{4})(\d{2})(\d{2})/i) || path.match(/CONS_(\d{4})(\d{2})(\d{2})/i);
                if (nameMatch) {
                  const y = parseInt(nameMatch[1], 10);
                  const m = parseInt(nameMatch[2], 10) - 1;
                  const d = parseInt(nameMatch[3], 10);
                  if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y >= 2020 && y <= 2035 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
                    timestamp = new Date(y, m, d, 12, 0, 0);
                    dateFound = true;
                  }
                }
              }

              // 3. Fallback para pasta com data no padrão YYYYMMDD ou YYYY-MM-DD
              if (!dateFound) {
                const folderMatch = path.match(/(?:Data_|\/)(\d{4})[-_]?(\d{2})[-_]?(\d{2})(?:\/|$)/);
                if (folderMatch) {
                  const y = parseInt(folderMatch[1], 10);
                  const m = parseInt(folderMatch[2], 10) - 1;
                  const d = parseInt(folderMatch[3], 10);
                  if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y >= 2020 && y <= 2035 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
                    timestamp = new Date(y, m, d, 12, 0, 0);
                    dateFound = true;
                  }
                }
              }

              const { isoWeek, isoYear } = getISOWeekAndYear(timestamp);
              const weekLabel = formatISOWeekLabel(isoWeek, isoYear);
              const dateKey = formatDateToDateKey(timestamp);

              records.push({
                id: `${group}_${baseName}_${records.length + 1}`,
                fileName: baseName,
                originalFileName: path,
                groupName: group,
                sender: 'FiscalizACampo Extensão',
                timestamp,
                isoWeek,
                isoYear,
                weekLabel,
                dateKey,
                code,
                rawCodeMatched: code,
                km: km || 'Não informado',
                rodovia,
                empresa,
                equipe,
                servico,
                messageText: metaRow.Texto_Original || metaRow.Mensagem || `Capturado via Extensão FiscalizACampo - ${group}`,
                blob: fileData.blob,
                sizeBytes: fileData.size,
                crossStatus: 'unidentified',
              });
            }
          } else {
            // ZIP padrão com conversa .txt exportada do WhatsApp
            const rawMessages = parseWhatsAppChatTxt(chatText, groupName);
            records = linkPhotosToMessages(
              mediaFiles,
              rawMessages,
              groupName,
              prefixes,
              windowMinutes
            );
          }

          newlyFoundPhotos.push(...records);
          progressItems[progressItems.length - 1] = {
            fileName: file.name,
            status: 'done',
            totalPhotosFound: records.length,
          };
          setFileProgressList([...progressItems]);
        } catch (err: any) {
          progressItems[progressItems.length - 1] = {
            fileName: file.name,
            status: 'error',
            errorDetail: err?.message || 'Falha ao descompactar ZIP',
            totalPhotosFound: 0,
          };
          setFileProgressList([...progressItems]);
        }
      }

      // 2. Processa arquivos soltos vindos de pasta descompactada
      if (looseFiles.length > 0) {
        const imageExtensions = /\.(jpe?g|png|webp|heic)$/i;
        const imageFiles = looseFiles.filter((f) => imageExtensions.test(f.name));
        const txtFiles = looseFiles.filter((f) => f.name.toLowerCase().endsWith('.txt'));

        // Nome da pasta ou grupo
        const firstRelPath = looseFiles[0].webkitRelativePath || '';
        const folderName = firstRelPath ? firstRelPath.split('/')[0] : 'Pasta de Fotos';

        progressItems.push({
          fileName: `${folderName} (${imageFiles.length} fotos)`,
          status: 'processing',
          totalPhotosFound: 0,
        });
        setFileProgressList([...progressItems]);

        try {
          let chatText = '';
          if (txtFiles.length > 0) {
            const chosenTxt = txtFiles.find((f) => f.name.toLowerCase().includes('_chat')) || txtFiles[0];
            chatText = await chosenTxt.text();
          }

          const mediaFiles = new Map<string, { blob: Blob; size: number }>();
          for (const img of imageFiles) {
            const mime = img.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
            mediaFiles.set(img.name, { blob: new Blob([img], { type: mime }), size: img.size });
          }

          const rawMessages = parseWhatsAppChatTxt(chatText, folderName);
          const records = linkPhotosToMessages(
            mediaFiles,
            rawMessages,
            folderName,
            prefixes,
            windowMinutes
          );

          newlyFoundPhotos.push(...records);
          progressItems[progressItems.length - 1] = {
            fileName: `${folderName} (${imageFiles.length} fotos)`,
            status: 'done',
            totalPhotosFound: records.length,
          };
          setFileProgressList([...progressItems]);
        } catch (err: any) {
          progressItems[progressItems.length - 1] = {
            fileName: `${folderName} (${imageFiles.length} fotos)`,
            status: 'error',
            errorDetail: err?.message || 'Erro ao carregar pasta',
            totalPhotosFound: 0,
          };
          setFileProgressList([...progressItems]);
        }
      }

      setPhotos((prev) => [...prev, ...newlyFoundPhotos]);
      setIsProcessing(false);
    },
    [prefixes, windowMinutes]
  );

  /**
   * Processamento de Planilha de Referência (.xlsx / .csv)
   */
  const processSpreadsheetFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseSpreadsheetBuffer(buffer, file.name);

      if (!parsed.sheetNames.length) {
        alert('A planilha importada não possui abas visíveis.');
        return;
      }

      const firstSheet = parsed.sheetNames[0];
      const sheetData = parsed.getSheetData(firstSheet);

      // Tenta adivinhar coluna chave comum
      const lowerHeaders = sheetData.headers.map((h) => h.toLowerCase());
      let guessedKey = sheetData.headers[0];

      const keyKeywords = ['código', 'codigo', 'item', 'id', 'chave', 'cód', 'cod'];
      for (const kw of keyKeywords) {
        const foundIdx = lowerHeaders.findIndex((h) => h.includes(kw));
        if (foundIdx !== -1) {
          guessedKey = sheetData.headers[foundIdx];
          break;
        }
      }

      // Constrói mapa de chave normalizada
      const normalizedKeyMap = new Map<string, Record<string, any>>();
      for (const row of sheetData.rows) {
        const rawVal = row[guessedKey];
        const norm = normalizeSpreadsheetKey(rawVal);
        if (norm) {
          normalizedKeyMap.set(norm, row);
        }
      }

      // Colunas selecionadas para enriquecimento inicial
      const defaultCols = sheetData.headers.filter((h) => h !== guessedKey).slice(0, 5);

      setSpreadsheetConfig({
        fileName: file.name,
        sheetNames: parsed.sheetNames,
        selectedSheet: firstSheet,
        headers: sheetData.headers,
        keyColumn: guessedKey,
        selectedColumns: defaultCols,
        rows: sheetData.rows,
        normalizedKeyMap,
      });
    } catch (err: any) {
      alert(`Erro ao ler planilha: ${err.message}`);
    }
  }, []);

  /**
   * Atualização dinâmica de aba ou coluna chave da planilha
   */
  const handleUpdateSpreadsheetConfig = (updated: Partial<SpreadsheetConfig>) => {
    if (!spreadsheetConfig) return;

    setSpreadsheetConfig((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updated };

      // Se mudou a chave, recalcula o mapa
      if (updated.keyColumn && updated.keyColumn !== prev.keyColumn) {
        const newMap = new Map<string, Record<string, any>>();
        for (const row of next.rows) {
          const rawVal = row[next.keyColumn];
          const norm = normalizeSpreadsheetKey(rawVal);
          if (norm) {
            newMap.set(norm, row);
          }
        }
        next.normalizedKeyMap = newMap;
      }

      return next;
    });
  };

  /**
   * Carrega Demonstração Completa com Dados Reais Sintéticos
   */
  const handleLoadSampleData = async () => {
    setIsLoadingSample(true);
    try {
      const sample = await createSampleWhatsAppZips();

      // Converte blobs para Files para reaproveitar a rotina padrão
      const file1 = new File([sample.zip1Blob], sample.zip1Name, { type: 'application/zip' });
      const file2 = new File([sample.zip2Blob], sample.zip2Name, { type: 'application/zip' });
      const spreadsheetFile = new File([sample.spreadsheetBlob], sample.spreadsheetName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      await processSpreadsheetFile(spreadsheetFile);
      await processWhatsAppFiles([file1, file2]);
    } catch (err: any) {
      alert(`Erro ao carregar dados de demonstração: ${err.message}`);
    } finally {
      setIsLoadingSample(false);
    }
  };

  /**
   * Limpar Todos os Registros
   */
  const handleResetAll = () => {
    if (confirm('Tem certeza de que deseja limpar todos os registros e fotos carregados?')) {
      setPhotos([]);
      setSpreadsheetConfig(null);
      setFileProgressList([]);
      setSelectedForCompare([]);
      setSelectedWeek(null);
      setFilters(INITIAL_FILTERS);
    }
  };

  /**
   * Gerenciador de Seleção para Comparação Antes/Depois (Max 2 fotos)
   */
  const handleToggleComparePhoto = (photo: PhotoRecord) => {
    setSelectedForCompare((prev) => {
      const exists = prev.some((p) => p.id === photo.id);
      if (exists) {
        return prev.filter((p) => p.id !== photo.id);
      }
      if (prev.length >= 2) {
        // Substitui a segunda foto mantendo a primeira
        return [prev[0], photo];
      }
      return [...prev, photo];
    });
  };

  /**
   * Motor de Filtros
   */
  const filteredPhotos = useMemo(() => {
    return updatedPhotos
      .filter((photo) => {
        // Filtro de Semana ISO da Linha do Tempo
        if (selectedWeek && photo.weekLabel !== selectedWeek) {
          return false;
        }

        // Filtro de Item / Frente
        if (filters.itemCode && photo.code !== filters.itemCode) {
          return false;
        }

        // Filtro de Grupo de Origem
        if (filters.groupName && photo.groupName !== filters.groupName) {
          return false;
        }

        // Filtro de Remetente
        if (filters.sender && photo.sender !== filters.sender) {
          return false;
        }

        // Filtro de Empresa
        if (filters.empresa && photo.empresa !== filters.empresa) {
          return false;
        }

        // Filtro de Status de Cruzamento
        if (filters.crossStatus !== 'all') {
          if (photo.crossStatus !== filters.crossStatus) {
            return false;
          }
        }

        // Intervalo de Datas
        if (filters.dateStart && photo.dateKey < filters.dateStart) {
          return false;
        }
        if (filters.dateEnd && photo.dateKey > filters.dateEnd) {
          return false;
        }

        // Busca Textual Livre
        if (filters.searchQuery) {
          const q = filters.searchQuery.toLowerCase();
          const matchKm = photo.km.toLowerCase().includes(q);
          const matchServ = photo.servico.toLowerCase().includes(q);
          const matchMsg = photo.messageText.toLowerCase().includes(q);
          const matchSender = photo.sender.toLowerCase().includes(q);
          const matchCode = photo.code.toLowerCase().includes(q);
          if (!matchKm && !matchServ && !matchMsg && !matchSender && !matchCode) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case 'date_desc':
            return b.timestamp.getTime() - a.timestamp.getTime();
          case 'date_asc':
            return a.timestamp.getTime() - b.timestamp.getTime();
          case 'code':
            return a.code.localeCompare(b.code);
          case 'sender':
            return a.sender.localeCompare(b.sender);
          default:
            return b.timestamp.getTime() - a.timestamp.getTime();
        }
      });
  }, [updatedPhotos, selectedWeek, filters]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <Navbar
        photos={updatedPhotos}
        groupsCount={uniqueGroupsCount}
        spreadsheetConfig={spreadsheetConfig}
        conference={conference}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onLoadSampleData={handleLoadSampleData}
        onResetAll={handleResetAll}
        isLoadingSample={isLoadingSample}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* Upload Drop Zone */}
        <DropZone
          onFilesSelected={processWhatsAppFiles}
          onSpreadsheetFileSelected={processSpreadsheetFile}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          onOpenExtensionTab={() => setActiveTab('extension')}
          totalPhotosLoaded={updatedPhotos.length}
          prefixes={prefixes}
          setPrefixes={setPrefixes}
          windowMinutes={windowMinutes}
          setWindowMinutes={setWindowMinutes}
          isProcessing={isProcessing}
          fileProgressList={fileProgressList}
          hasSpreadsheet={Boolean(spreadsheetConfig)}
          spreadsheetName={spreadsheetConfig?.fileName}
        />

        {/* Spreadsheet Active Configuration Panel */}
        <SpreadsheetPicker
          config={spreadsheetConfig}
          onUpdateConfig={handleUpdateSpreadsheetConfig}
          onRemoveSpreadsheet={() => setSpreadsheetConfig(null)}
          matchedCount={updatedPhotos.filter((p) => p.crossStatus === 'matched').length}
          totalPhotos={updatedPhotos.length}
        />

        {/* Tab 1: Galeria de Fotos */}
        {activeTab === 'gallery' && (
          <div>
            {/* Timeline Filter */}
            {updatedPhotos.length > 0 && (
              <TimelineFilter
                photos={updatedPhotos}
                selectedWeek={selectedWeek}
                onSelectWeek={setSelectedWeek}
              />
            )}

            {/* Filter Bar */}
            {updatedPhotos.length > 0 && (
              <FilterBar
                photos={updatedPhotos}
                filters={filters}
                onUpdateFilters={(upd) => setFilters((prev) => ({ ...prev, ...upd }))}
                onClearFilters={() => setFilters(INITIAL_FILTERS)}
                filteredCount={filteredPhotos.length}
                totalCount={updatedPhotos.length}
              />
            )}

            {/* Photo Gallery Grid */}
            <PhotoGallery
              photos={filteredPhotos}
              selectedForCompare={selectedForCompare}
              onToggleComparePhoto={handleToggleComparePhoto}
              onOpenCompareModal={() => setIsCompareModalOpen(true)}
              onClearCompareSelection={() => setSelectedForCompare([])}
              onOpenPhotoDetail={(photo) => setActiveDetailPhoto(photo)}
            />
          </div>
        )}

        {/* Tab 2: Tabela Resumo Item x Semana */}
        {activeTab === 'summary' && <SummaryTable photos={updatedPhotos} />}

        {/* Tab 3: Conferência de Medição (3 Listas) */}
        {activeTab === 'conference' && (
          <ConferenceListsView
            conference={conference}
            spreadsheetConfig={spreadsheetConfig}
          />
        )}

        {/* Tab 4: Validador Técnico & Testes */}
        {activeTab === 'tests' && <ValidationTestTab />}

        {/* Tab 5: Extensão Oficial WhatsApp Web */}
        {activeTab === 'extension' && <ExtensionTab />}
      </main>

      {/* Comparison Modal (Antes / Depois) */}
      {isCompareModalOpen && selectedForCompare.length === 2 && (
        <PhotoComparisonModal
          photos={selectedForCompare}
          onClose={() => setIsCompareModalOpen(false)}
        />
      )}

      {/* Photo Detail Modal */}
      {activeDetailPhoto && (
        <PhotoDetailModal
          photo={activeDetailPhoto}
          onClose={() => setActiveDetailPhoto(null)}
        />
      )}

      {/* Export Batch Modal */}
      {isExportModalOpen && (
        <ExportModal
          photos={updatedPhotos}
          spreadsheetConfig={spreadsheetConfig}
          conference={conference}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-4 px-6 text-center text-xs text-neutral-400 font-mono">
        FiscalizACampo · Conservação Rodoviária & Medição de Obras · Processamento 100% no Navegador
      </footer>
    </div>
  );
}
