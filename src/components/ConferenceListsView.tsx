import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  FileQuestion,
  Copy,
  Download,
  CheckCircle2,
  FileSpreadsheet,
  Info,
} from 'lucide-react';
import { CrossConferenceResults, SpreadsheetConfig } from '../types';
import { triggerFileDownload } from '../utils/zipExporter';

interface ConferenceListsViewProps {
  conference: CrossConferenceResults;
  spreadsheetConfig: SpreadsheetConfig | null;
}

export const ConferenceListsView: React.FC<ConferenceListsViewProps> = ({
  conference,
  spreadsheetConfig,
}) => {
  const [subTab, setSubTab] = useState<'missing' | 'unlisted' | 'multi'>('missing');

  const { missingInWhatsApp, unlistedInSpreadsheet, multiGroupItems } = conference;

  const handleExportConferenceXlsx = () => {
    const wb = XLSX.utils.book_new();

    // 1. Lista A
    const listARows = missingInWhatsApp.map((item, idx) => ({
      'Item Nº': idx + 1,
      'Código na Planilha': item.key,
      ...item.row,
      'Alerta': 'Item previsto na planilha mas sem foto anexada no WhatsApp no período',
    }));
    const wsA = XLSX.utils.json_to_sheet(
      listARows.length > 0 ? listARows : [{ 'Status': 'Nenhum item pendente' }]
    );
    XLSX.utils.book_append_sheet(wb, wsA, 'Lista A - Sem Evidência');

    // 2. Lista B
    const listBRows = unlistedInSpreadsheet.map((item, idx) => ({
      'Item Nº': idx + 1,
      'Código no WhatsApp': item.code,
      'Qtd Fotos Registradas': item.records.length,
      'Grupos': Array.from(new Set(item.records.map((r) => r.groupName))).join(', '),
      'Remetentes': Array.from(new Set(item.records.map((r) => r.sender))).join(', '),
      'Alerta': 'Código reportado no WhatsApp mas ausente na planilha de medição',
    }));
    const wsB = XLSX.utils.json_to_sheet(
      listBRows.length > 0 ? listBRows : [{ 'Status': 'Nenhum item divergente' }]
    );
    XLSX.utils.book_append_sheet(wb, wsB, 'Lista B - Não na Planilha');

    // 3. Lista C
    const listCRows = multiGroupItems.map((item, idx) => ({
      'Item Nº': idx + 1,
      'Código': item.code,
      'Total Fotos': item.totalPhotos,
      'Grupos com Registro': item.groups.join(' | '),
      'Alerta': 'Item reportado em múltiplos grupos (possível duplicidade ou retrabalho)',
    }));
    const wsC = XLSX.utils.json_to_sheet(
      listCRows.length > 0 ? listCRows : [{ 'Status': 'Nenhuma duplicidade entre grupos' }]
    );
    XLSX.utils.book_append_sheet(wb, wsC, 'Lista C - Multi-Grupos');

    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerFileDownload(blob, `Listas_Conferencia_Medicao_Auditoria.xlsx`);
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 sm:p-6 mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="font-semibold text-neutral-100 text-sm sm:text-base flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Auditoria e Listas de Conferência para Medição</span>
          </h3>
          <p className="text-neutral-400 text-xs mt-1">
            Cruza o que foi reportado no WhatsApp com o previsto na planilha para evitar glosas e retrabalho
          </p>
        </div>

        <button
          onClick={handleExportConferenceXlsx}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-amber-400" />
          <span>Exportar 3 Listas em Excel (.xlsx)</span>
        </button>
      </div>

      {/* Tabs for the 3 lists */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {/* Card Tab A */}
        <button
          onClick={() => setSubTab('missing')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'missing'
              ? 'bg-neutral-900 border-amber-500/60 shadow-lg shadow-amber-500/5'
              : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-300">Lista A</span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                missingInWhatsApp.length > 0
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {missingInWhatsApp.length}
            </span>
          </div>
          <div className="text-xs font-bold text-white mb-1">
            Sem Evidência no WhatsApp
          </div>
          <div className="text-[11px] text-neutral-400 leading-relaxed">
            Itens previstos na planilha mas sem foto registrada (risco de glosa na medição).
          </div>
        </button>

        {/* Card Tab B */}
        <button
          onClick={() => setSubTab('unlisted')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'unlisted'
              ? 'bg-neutral-900 border-amber-500/60 shadow-lg shadow-amber-500/5'
              : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-300">Lista B</span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                unlistedInSpreadsheet.length > 0
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {unlistedInSpreadsheet.length}
            </span>
          </div>
          <div className="text-xs font-bold text-white mb-1">
            Não Consta na Planilha
          </div>
          <div className="text-[11px] text-neutral-400 leading-relaxed">
            Registros do WhatsApp com código inexistente na planilha (possível erro de digitação ou serviço extra).
          </div>
        </button>

        {/* Card Tab C */}
        <button
          onClick={() => setSubTab('multi')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            subTab === 'multi'
              ? 'bg-neutral-900 border-amber-500/60 shadow-lg shadow-amber-500/5'
              : 'bg-neutral-950/70 border-neutral-800/80 hover:border-neutral-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-300">Lista C</span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                multiGroupItems.length > 0
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {multiGroupItems.length}
            </span>
          </div>
          <div className="text-xs font-bold text-white mb-1">
            Em Múltiplos Grupos
          </div>
          <div className="text-[11px] text-neutral-400 leading-relaxed">
            Itens reportados em 2 ou mais grupos de WhatsApp (possível duplicidade ou retrabalho de equipes).
          </div>
        </button>
      </div>

      {/* Active Tab Table Content */}
      <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950">
        {subTab === 'missing' && (
          <div>
            {!spreadsheetConfig ? (
              <div className="p-8 text-center text-xs text-neutral-400">
                <FileSpreadsheet className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                <p>Importe uma planilha de referência para gerar a conferência de itens sem evidência.</p>
              </div>
            ) : missingInWhatsApp.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                <p className="font-semibold">Todos os itens da planilha possuem registros fotográficos no WhatsApp!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-900 text-neutral-300 border-b border-neutral-800">
                    <tr>
                      <th className="p-3 font-semibold">Código na Planilha</th>
                      {spreadsheetConfig.selectedColumns.slice(0, 4).map((col) => (
                        <th key={col} className="p-3 font-semibold">
                          {col}
                        </th>
                      ))}
                      <th className="p-3 text-right text-red-400 font-semibold">Status de Auditoria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {missingInWhatsApp.map((item, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/40">
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {item.key}
                        </td>
                        {spreadsheetConfig.selectedColumns.slice(0, 4).map((col) => (
                          <td key={col} className="p-3 text-neutral-300">
                            {String(item.row[col] ?? '—')}
                          </td>
                        ))}
                        <td className="p-3 text-right">
                          <span className="text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">
                            Falta foto de comprovação
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {subTab === 'unlisted' && (
          <div>
            {unlistedInSpreadsheet.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                <p className="font-semibold">Nenhum código divergente no WhatsApp! Todos constam na planilha.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-900 text-neutral-300 border-b border-neutral-800">
                    <tr>
                      <th className="p-3 font-semibold">Código Reportado</th>
                      <th className="p-3 font-semibold text-center">Fotos</th>
                      <th className="p-3 font-semibold">Grupos Envolvidos</th>
                      <th className="p-3 font-semibold">Remetentes</th>
                      <th className="p-3 text-right text-amber-400 font-semibold">Possível Causa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {unlistedInSpreadsheet.map((item, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/40">
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {item.code}
                        </td>
                        <td className="p-3 font-mono text-center text-neutral-200">
                          {item.records.length}
                        </td>
                        <td className="p-3 text-neutral-300">
                          {Array.from(new Set(item.records.map((r) => r.groupName))).join(', ')}
                        </td>
                        <td className="p-3 text-neutral-400 font-mono text-[11px]">
                          {Array.from(new Set(item.records.map((r) => r.sender))).join(', ')}
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                            Código extra ou erro de digitação
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {subTab === 'multi' && (
          <div>
            {multiGroupItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-emerald-400 flex flex-col items-center gap-2">
                <CheckCircle2 className="w-8 h-8" />
                <p className="font-semibold">Nenhuma duplicidade detectada entre os grupos de WhatsApp.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-900 text-neutral-300 border-b border-neutral-800">
                    <tr>
                      <th className="p-3 font-semibold">Código / Item</th>
                      <th className="p-3 font-semibold text-center">Total de Fotos</th>
                      <th className="p-3 font-semibold">Grupos com Registro</th>
                      <th className="p-3 font-semibold">Empresas</th>
                      <th className="p-3 text-right text-blue-400 font-semibold">Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {multiGroupItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-neutral-900/40">
                        <td className="p-3 font-mono font-bold text-amber-400">
                          {item.code}
                        </td>
                        <td className="p-3 font-mono text-center text-neutral-200">
                          {item.totalPhotos}
                        </td>
                        <td className="p-3 text-neutral-300 font-medium">
                          {item.groups.join(' · ')}
                        </td>
                        <td className="p-3 text-neutral-400">
                          {Array.from(new Set(item.records.map((r) => r.empresa))).join(', ')}
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-[11px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                            Verificar duplicidade de medição
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
