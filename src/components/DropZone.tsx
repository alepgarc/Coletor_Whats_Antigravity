import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FolderArchive,
  FolderOpen,
  FileSpreadsheet,
  Settings2,
  AlertCircle,
  CheckCircle,
  Loader2,
  HelpCircle,
  FolderCheck,
  ArrowRight,
  Chrome,
} from 'lucide-react';
import { ParsingFileProgress } from '../types';

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onSpreadsheetFileSelected: (file: File) => void;
  onOpenExportModal: () => void;
  onOpenExtensionTab?: () => void;
  totalPhotosLoaded: number;
  prefixes: string[];
  setPrefixes: (prefixes: string[]) => void;
  windowMinutes: number;
  setWindowMinutes: (min: number) => void;
  isProcessing: boolean;
  fileProgressList: ParsingFileProgress[];
  hasSpreadsheet: boolean;
  spreadsheetName?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({
  onFilesSelected,
  onSpreadsheetFileSelected,
  onOpenExportModal,
  onOpenExtensionTab,
  totalPhotosLoaded,
  prefixes,
  setPrefixes,
  windowMinutes,
  setWindowMinutes,
  isProcessing,
  fileProgressList,
  hasSpreadsheet,
  spreadsheetName,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [prefixInput, setPrefixInput] = useState(prefixes.join(', '));
  const [iframeWarning, setIframeWarning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const files: File[] = [];
      if (e.dataTransfer.items) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) files.push(f);
          }
        }
      } else if (e.dataTransfer.files) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          files.push(e.dataTransfer.files[i]);
        }
      }

      if (files.length > 0) {
        dispatchFiles(files);
      }
    } catch (err: any) {
      if (err.name === 'NotReadableError') {
        setIframeWarning(true);
      }
    }
  };

  const dispatchFiles = (files: File[]) => {
    const zips: File[] = [];
    const looseMediaOrTxt: File[] = [];
    let spreadsheet: File | null = null;

    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.zip')) {
        zips.push(f);
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.csv') || lower.endsWith('.xls')) {
        spreadsheet = f;
      } else if (
        /\.(jpe?g|png|webp|heic|txt)$/i.test(lower)
      ) {
        looseMediaOrTxt.push(f);
      }
    }

    if (spreadsheet) {
      onSpreadsheetFileSelected(spreadsheet);
    }
    if (zips.length > 0) {
      onFilesSelected(zips);
    } else if (looseMediaOrTxt.length > 0) {
      // Passa arquivos soltos de fotos ou txt de pasta já descompactada
      onFilesSelected(looseMediaOrTxt);
    }
  };

  const handlePrefixBlur = () => {
    const list = prefixInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    setPrefixes(list);
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 sm:p-6 mb-6">
      {/* Banner de Orientação: Entrada vs Saída */}
      <div className="mb-4 p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-neutral-300">
          <span className="w-5 h-5 rounded-full bg-amber-400 text-neutral-950 font-bold flex items-center justify-center text-[11px]">
            1
          </span>
          <span>
            <strong>Etapa de Entrada:</strong> Carregue aqui os arquivos .ZIP ou fotos recebidos do WhatsApp.
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {onOpenExtensionTab && (
            <button
              onClick={onOpenExtensionTab}
              className="flex items-center gap-1.5 px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-amber-300 border border-amber-500/40 rounded text-xs transition-colors cursor-pointer"
              title="Para quem tem centenas de grupos e quer capturar direto no WhatsApp Web"
            >
              <Chrome className="w-3.5 h-3.5 text-amber-400" />
              <span>Centenas de grupos? Usar Extensão Chrome</span>
            </button>
          )}

          {totalPhotosLoaded > 0 && (
            <button
              onClick={onOpenExportModal}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold rounded text-xs transition-colors cursor-pointer shadow-sm"
            >
              <span>Salvar Fotos na Pasta do Computador</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Iframe warning */}
      {iframeWarning && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold block text-amber-300">
              Restrição de leitura por arrastar detectada no navegador:
            </strong>
            Em ambientes de visualização restrita, utilize os botões <strong>"Selecionar Arquivos .ZIP"</strong> ou <strong>"Importar Pasta com Fotos"</strong> abaixo.
          </div>
        </div>
      )}

      {/* Main Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-all ${
          isDragOver
            ? 'border-amber-400 bg-amber-500/10 scale-[1.005]'
            : 'border-neutral-700/70 hover:border-neutral-600 bg-neutral-950/40'
        }`}
      >
        <div className="max-w-xl mx-auto flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-amber-400 mb-4 shadow-inner">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-base sm:text-lg font-semibold text-neutral-100 mb-1">
            Importar Arquivos do WhatsApp e Planilha de Medição
          </h3>
          <p className="text-xs sm:text-sm text-neutral-400 mb-6 max-w-md">
            Arraste os arquivos .ZIP ou a pasta contendo as fotos e conversas exportadas.
            Tudo é processado <span className="text-neutral-200 font-medium">100% no seu navegador</span>.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {/* WhatsApp ZIP selector */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".zip"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  dispatchFiles(Array.from(e.target.files));
                }
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-lg text-xs font-semibold border border-neutral-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              title="Selecione um ou vários arquivos .zip exportados do WhatsApp"
            >
              <FolderArchive className="w-4 h-4 text-amber-400" />
              <span>Selecionar Arquivos .ZIP</span>
            </button>

            {/* Folder selector (webkitdirectory) */}
            <input
              type="file"
              ref={folderInputRef}
              // @ts-ignore
              webkitdirectory="true"
              directory="true"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  dispatchFiles(Array.from(e.target.files));
                }
              }}
            />
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-lg text-xs font-semibold border border-neutral-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              title="Selecione uma pasta do computador contendo fotos ou zips para importar"
            >
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <span>Importar Pasta com Fotos</span>
            </button>

            {/* Spreadsheet selector */}
            <input
              type="file"
              ref={spreadsheetInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  onSpreadsheetFileSelected(e.target.files[0]);
                }
              }}
            />
            <button
              onClick={() => spreadsheetInputRef.current?.click()}
              disabled={isProcessing}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50 cursor-pointer shadow-sm ${
                hasSpreadsheet
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-600/40 hover:bg-emerald-900/40'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border-neutral-700'
              }`}
            >
              <FileSpreadsheet className={`w-4 h-4 ${hasSpreadsheet ? 'text-emerald-400' : 'text-emerald-500'}`} />
              <span>{hasSpreadsheet ? `Planilha: ${spreadsheetName?.slice(0, 20)}...` : 'Importar Planilha (.xlsx)'}</span>
            </button>

            {/* Toggle Regex & Window Settings */}
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2.5 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs border border-neutral-700 transition-colors cursor-pointer"
              title="Configurar Prefixos e Janela de Busca"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Config Drawer for Prefixes & Window */}
      {showConfig && (
        <div className="mt-4 p-4 bg-neutral-950/80 border border-neutral-800 rounded-lg text-xs animate-in fade-in duration-150">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-neutral-300 font-semibold mb-1 flex items-center justify-between">
                <span>Prefixos das Frentes / Códigos de Serviço</span>
                <span className="text-[11px] text-neutral-500 font-normal">Separados por vírgula</span>
              </label>
              <input
                type="text"
                value={prefixInput}
                onChange={(e) => setPrefixInput(e.target.value)}
                onBlur={handlePrefixBlur}
                placeholder="Ex: BSO, SER, CON, PAV, ROC, DRE, CAP, TAP, OAE"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-neutral-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                O sistema tolera automaticamente: <code className="text-amber-300">BSO 3</code>, <code className="text-amber-300">bso-03</code>, <code className="text-amber-300">BSO03</code> e normaliza para <code className="text-emerald-400">BSO 03</code>.
              </p>
            </div>

            <div>
              <label className="block text-neutral-300 font-semibold mb-1 flex items-center gap-1">
                <span>Janela de Contexto (minutos)</span>
                <span title="Tempo máximo para buscar código em mensagens vizinhas do mesmo remetente" className="text-neutral-500 cursor-help">
                  <HelpCircle className="w-3.5 h-3.5" />
                </span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(Math.max(1, parseInt(e.target.value, 10) || 10))}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-1.5 text-neutral-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Padrão: 10 min (busca texto do mesmo remetente).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Processing Status & Error Line */}
      {fileProgressList.length > 0 && (
        <div className="mt-4 pt-3 border-t border-neutral-800">
          <div className="text-xs font-semibold text-neutral-300 mb-2 flex items-center justify-between">
            <span>Status do Processamento ({fileProgressList.length} arquivos/lotes)</span>
            {isProcessing && (
              <span className="text-amber-400 flex items-center gap-1.5 text-[11px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processando mídias localmente...
              </span>
            )}
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {fileProgressList.map((prog, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs px-3 py-1.5 bg-neutral-950/60 rounded border border-neutral-800/80"
              >
                <div className="flex items-center gap-2 truncate max-w-[70%]">
                  {prog.status === 'processing' && (
                    <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                  )}
                  {prog.status === 'done' && (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {prog.status === 'error' && (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  )}
                  <span className="font-mono text-neutral-200 truncate">{prog.fileName}</span>
                </div>

                <div className="text-[11px] font-mono text-right shrink-0">
                  {prog.status === 'done' && (
                    <span className="text-emerald-400">
                      {prog.totalPhotosFound} fotos extraídas
                    </span>
                  )}
                  {prog.status === 'error' && (
                    <span className="text-red-400" title={prog.errorDetail}>
                      {prog.errorDetail || 'Erro ao processar'}
                    </span>
                  )}
                  {prog.status === 'processing' && (
                    <span className="text-amber-400">Processando...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
