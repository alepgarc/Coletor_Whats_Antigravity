import React from 'react';
import { FileSpreadsheet, Check, RefreshCw, Info, CheckCircle2 } from 'lucide-react';
import { SpreadsheetConfig } from '../types';
import { NORMALIZATION_EXPLANATION } from '../utils/spreadsheetMatcher';

interface SpreadsheetPickerProps {
  config: SpreadsheetConfig | null;
  onUpdateConfig: (updated: Partial<SpreadsheetConfig>) => void;
  onRemoveSpreadsheet: () => void;
  matchedCount: number;
  totalPhotos: number;
}

export const SpreadsheetPicker: React.FC<SpreadsheetPickerProps> = ({
  config,
  onUpdateConfig,
  onRemoveSpreadsheet,
  matchedCount,
  totalPhotos,
}) => {
  if (!config) return null;

  const handleSheetChange = (newSheet: string) => {
    onUpdateConfig({ selectedSheet: newSheet });
  };

  const handleKeyColumnChange = (col: string) => {
    onUpdateConfig({ keyColumn: col });
  };

  const handleToggleColumn = (col: string) => {
    const current = config.selectedColumns || [];
    let updated: string[];
    if (current.includes(col)) {
      updated = current.filter((c) => c !== col);
    } else {
      updated = [...current, col];
    }
    onUpdateConfig({ selectedColumns: updated });
  };

  return (
    <div className="bg-neutral-900/60 border border-emerald-900/30 rounded-xl p-4 sm:p-5 mb-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-neutral-100 text-sm">
                Planilha de Referência: {config.fileName}
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-mono text-[11px]">
                {config.rows.length} itens carregados
              </span>
            </div>
            <p className="text-neutral-400 text-[11px]">
              Cruzamento ativo: <strong className="text-emerald-400">{matchedCount}</strong> de {totalPhotos} fotos confirmadas com código da planilha.
            </p>
          </div>
        </div>

        <button
          onClick={onRemoveSpreadsheet}
          className="text-neutral-400 hover:text-red-400 text-xs px-2.5 py-1 rounded hover:bg-neutral-800 transition-colors"
        >
          Desvincular Planilha
        </button>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {/* Aba da planilha */}
        <div>
          <label className="block text-neutral-300 font-semibold mb-1">
            Aba Selecionada:
          </label>
          <select
            value={config.selectedSheet}
            onChange={(e) => handleSheetChange(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-neutral-100 text-xs focus:outline-none focus:border-emerald-400"
          >
            {config.sheetNames.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </div>

        {/* Coluna Chave de Ligação */}
        <div>
          <label className="block text-neutral-300 font-semibold mb-1">
            Coluna Chave (Código / Item):
          </label>
          <select
            value={config.keyColumn}
            onChange={(e) => handleKeyColumnChange(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2.5 py-1.5 text-neutral-100 text-xs focus:outline-none focus:border-emerald-400 font-mono"
          >
            {config.headers.map((hdr) => (
              <option key={hdr} value={hdr}>
                {hdr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Colunas adicionais para enriquecer o WhatsApp */}
      <div className="mt-3">
        <label className="block text-neutral-300 font-semibold mb-1.5">
          Colunas adicionais da planilha para cruzar no relatório e exportação:
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
          {config.headers
            .filter((h) => h !== config.keyColumn)
            .map((col) => {
              const isSelected = config.selectedColumns.includes(col);
              return (
                <button
                  key={col}
                  onClick={() => handleToggleColumn(col)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono border transition-colors flex items-center gap-1 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-200'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                  <span>{col}</span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Regra de normalização exibida expressamente */}
      <div className="mt-3 p-2.5 bg-neutral-950/80 rounded border border-neutral-800/80 flex items-start gap-2 text-[11px] text-neutral-400">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-neutral-300 block">Regra de Normalização Bidirecional:</span>
          <span>{NORMALIZATION_EXPLANATION}</span>
        </div>
      </div>
    </div>
  );
};
