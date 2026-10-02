import React from 'react';
import {
  Camera,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Table as TableIcon,
  Layers,
  TestTube2,
  FileCode,
  Chrome,
} from 'lucide-react';
import { PhotoRecord, CrossConferenceResults, SpreadsheetConfig } from '../types';
import { generatePortableHtmlContent } from '../utils/portableHtmlGenerator';
import { triggerFileDownload } from '../utils/zipExporter';

interface NavbarProps {
  photos: PhotoRecord[];
  groupsCount: number;
  spreadsheetConfig: SpreadsheetConfig | null;
  conference: CrossConferenceResults;
  activeTab: 'gallery' | 'summary' | 'conference' | 'tests' | 'extension';
  setActiveTab: (tab: 'gallery' | 'summary' | 'conference' | 'tests' | 'extension') => void;
  onOpenExportModal: () => void;
  onLoadSampleData: () => void;
  onResetAll: () => void;
  isLoadingSample: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  photos,
  groupsCount,
  spreadsheetConfig,
  conference,
  activeTab,
  setActiveTab,
  onOpenExportModal,
  onLoadSampleData,
  onResetAll,
  isLoadingSample,
}) => {
  const totalPhotos = photos.length;
  const identifiedPhotos = photos.filter((p) => p.code !== 'Não identificado').length;
  const matchedPhotos = photos.filter((p) => p.crossStatus === 'matched').length;
  const totalAuditIssues =
    conference.missingInWhatsApp.length +
    conference.unlistedInSpreadsheet.length +
    conference.multiGroupItems.length;

  return (
    <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Zone */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              FiscalizACampo
              <span className="text-xs font-medium text-amber-400 font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                Conservação
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              WhatsApp · Fotos · Planilhas de Medição
            </p>
          </div>
        </div>

        {/* Live Counters */}
        {totalPhotos > 0 && (
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-neutral-400 bg-neutral-900/80 px-3.5 py-1.5 rounded-lg border border-neutral-800">
            <div>
              <span className="text-neutral-500">Fotos: </span>
              <strong className="text-neutral-100">{totalPhotos}</strong>
            </div>
            <span className="text-neutral-700">·</span>
            <div>
              <span className="text-neutral-500">Identificadas: </span>
              <strong className="text-amber-400">{identifiedPhotos}</strong>
            </div>
            <span className="text-neutral-700">·</span>
            <div>
              <span className="text-neutral-500">Grupos: </span>
              <strong className="text-neutral-100">{groupsCount}</strong>
            </div>
            {spreadsheetConfig && (
              <>
                <span className="text-neutral-700">·</span>
                <div>
                  <span className="text-neutral-500">Na Planilha: </span>
                  <strong className="text-emerald-400">{matchedPhotos}</strong>
                </div>
              </>
            )}
          </div>
        )}

        {/* Actions Zone */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão de Destaque da Extensão Chrome */}
          <button
            onClick={() => setActiveTab('extension')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 rounded-lg transition-colors cursor-pointer shadow-sm"
            title="Extensão para capturar fotos direto no WhatsApp Web"
          >
            <Chrome className="w-4 h-4 text-amber-400" />
            <span>Extensão WhatsApp Web</span>
          </button>

          {totalPhotos === 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onLoadSampleData}
                disabled={isLoadingSample}
                className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/40 rounded-lg transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>{isLoadingSample ? 'Gerando Amostra...' : 'Carregar Dados de Exemplo'}</span>
              </button>

              <button
                onClick={() => {
                  const html = generatePortableHtmlContent();
                  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                  triggerFileDownload(blob, 'FiscalizACampo_App_Offline.html');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer"
                title="Baixar ferramenta em arquivo HTML único para uso offline"
              >
                <FileCode className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Baixar HTML Único Offline</span>
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={onOpenExportModal}
                className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Exportar ZIPs & Planilha</span>
              </button>

              <button
                onClick={() => {
                  const html = generatePortableHtmlContent();
                  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                  triggerFileDownload(blob, 'FiscalizACampo_App_Offline.html');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg transition-colors cursor-pointer"
                title="Baixar ferramenta em arquivo HTML único portátil para uso offline"
              >
                <FileCode className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden lg:inline">HTML Offline</span>
              </button>

              <button
                onClick={onResetAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-neutral-900 rounded-lg transition-colors border border-transparent hover:border-neutral-800 cursor-pointer"
                title="Limpar todos os registros"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Zone */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between border-t border-neutral-800/60 overflow-x-auto text-xs font-medium">
        <div className="flex items-center gap-1 py-1">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'gallery'
                ? 'text-amber-400 bg-neutral-900 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Galeria de Fotos</span>
            {totalPhotos > 0 && (
              <span className="ml-1 text-[11px] font-mono text-neutral-500">
                ({totalPhotos})
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('summary')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'summary'
                ? 'text-amber-400 bg-neutral-900 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>Resumo Item × Semana</span>
          </button>

          <button
            onClick={() => setActiveTab('conference')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'conference'
                ? 'text-amber-400 bg-neutral-900 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Conferência de Medição</span>
            {totalAuditIssues > 0 && (
              <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {totalAuditIssues}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tests')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'tests'
                ? 'text-amber-400 bg-neutral-900 font-semibold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/50'
            }`}
          >
            <TestTube2 className="w-4 h-4" />
            <span>Validador Técnico</span>
          </button>

          <button
            onClick={() => setActiveTab('extension')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'extension'
                ? 'text-amber-400 bg-neutral-900 font-semibold border-b-2 border-amber-400'
                : 'text-neutral-300 hover:text-white hover:bg-neutral-900/50'
            }`}
          >
            <Chrome className="w-4 h-4 text-amber-400" />
            <span className="font-semibold">Extensão WhatsApp Web</span>
            <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              NOVO
            </span>
          </button>
        </div>

        {totalPhotos > 0 && (
          <div className="hidden md:flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Processamento 100% Local (Navegador)
          </div>
        )}
      </div>
    </header>
  );
};
