import React from 'react';
import * as XLSX from 'xlsx';
import { Table, Download, FileSpreadsheet } from 'lucide-react';
import { PhotoRecord } from '../types';
import { triggerFileDownload } from '../utils/zipExporter';

interface SummaryTableProps {
  photos: PhotoRecord[];
}

export const SummaryTable: React.FC<SummaryTableProps> = ({ photos }) => {
  // Constrói matriz Item × Semana ISO
  const { items, weeks, matrix, rowTotals, colTotals, grandTotal } = React.useMemo(() => {
    const itemSet = new Set<string>();
    const weekMap = new Map<string, { isoWeek: number; isoYear: number }>();
    const countMap = new Map<string, number>(); // "item||week" -> count

    for (const p of photos) {
      const it = p.code || 'Não identificado';
      itemSet.add(it);
      if (!weekMap.has(p.weekLabel)) {
        weekMap.set(p.weekLabel, { isoWeek: p.isoWeek, isoYear: p.isoYear });
      }

      const key = `${it}||${p.weekLabel}`;
      countMap.set(key, (countMap.get(key) || 0) + 1);
    }

    const items = Array.from(itemSet).sort((a, b) => {
      if (a === 'Não identificado') return 1;
      if (b === 'Não identificado') return -1;
      return a.localeCompare(b);
    });

    const weeks = Array.from(weekMap.entries())
      .sort((a, b) => {
        if (a[1].isoYear !== b[1].isoYear) return a[1].isoYear - b[1].isoYear;
        return a[1].isoWeek - b[1].isoWeek;
      })
      .map(([label]) => label);

    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;

    for (const w of weeks) {
      colTotals[w] = 0;
    }

    for (const it of items) {
      matrix[it] = {};
      let rowSum = 0;
      for (const w of weeks) {
        const val = countMap.get(`${it}||${w}`) || 0;
        matrix[it][w] = val;
        rowSum += val;
        colTotals[w] += val;
        grandTotal += val;
      }
      rowTotals[it] = rowSum;
    }

    return { items, weeks, matrix, rowTotals, colTotals, grandTotal };
  }, [photos]);

  const handleExportSummaryXlsx = () => {
    if (items.length === 0) return;

    const data: any[] = [];
    for (const it of items) {
      const rowObj: Record<string, any> = { 'Item / Frente': it };
      for (const w of weeks) {
        rowObj[w] = matrix[it][w] || 0;
      }
      rowObj['Total Fotos'] = rowTotals[it];
      data.push(rowObj);
    }

    // Linha de total
    const totalRow: Record<string, any> = { 'Item / Frente': 'TOTAL GERAL' };
    for (const w of weeks) {
      totalRow[w] = colTotals[w] || 0;
    }
    totalRow['Total Fotos'] = grandTotal;
    data.push(totalRow);

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resumo Item x Semana');

    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbOut as any], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    triggerFileDownload(blob, `Resumo_Execucao_Item_Semana.xlsx`);
  };

  if (items.length === 0) {
    return (
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center text-neutral-400">
        Nenhum registro para exibir na tabela resumo.
      </div>
    );
  }

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 sm:p-6 mb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
        <div>
          <h3 className="font-semibold text-neutral-100 text-sm flex items-center gap-2">
            <Table className="w-4 h-4 text-amber-400" />
            <span>Matriz de Execução · Item / Frente × Semana ISO</span>
          </h3>
          <p className="text-neutral-400 text-xs mt-0.5">
            Comprovação de frequência e quantidade de registros fotográficos por período
          </p>
        </div>

        <button
          onClick={handleExportSummaryXlsx}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Exportar Tabela Resumo (.xlsx)</span>
        </button>
      </div>

      {/* Table container */}
      <div className="overflow-x-auto border border-neutral-800 rounded-lg">
        <table className="w-full text-xs text-left border-collapse font-sans">
          <thead>
            <tr className="bg-neutral-950 border-b border-neutral-800 text-neutral-300">
              <th className="p-3 font-semibold sticky left-0 bg-neutral-950 z-10 border-r border-neutral-800 min-w-[140px]">
                Item / Frente
              </th>
              {weeks.map((w) => (
                <th key={w} className="p-3 text-center font-mono text-[11px] whitespace-nowrap min-w-[90px]">
                  {w}
                </th>
              ))}
              <th className="p-3 text-right font-mono font-bold text-amber-300 bg-neutral-950/90 min-w-[100px]">
                Total Registros
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/80 font-mono">
            {items.map((it) => (
              <tr key={it} className="hover:bg-neutral-800/40 transition-colors">
                <td className="p-3 font-semibold text-neutral-200 sticky left-0 bg-neutral-900/90 z-10 border-r border-neutral-800">
                  <span
                    className={
                      it === 'Não identificado'
                        ? 'text-neutral-500 italic font-sans'
                        : 'text-amber-400'
                    }
                  >
                    {it}
                  </span>
                </td>
                {weeks.map((w) => {
                  const val = matrix[it][w] || 0;
                  return (
                    <td
                      key={w}
                      className={`p-3 text-center ${
                        val > 0
                          ? 'text-neutral-100 font-bold bg-amber-500/5'
                          : 'text-neutral-600'
                      }`}
                    >
                      {val > 0 ? val : '—'}
                    </td>
                  );
                })}
                <td className="p-3 text-right font-bold text-neutral-100 bg-neutral-950/30">
                  {rowTotals[it]}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-neutral-950 border-t-2 border-neutral-700 text-neutral-200 font-mono font-bold">
              <td className="p-3 sticky left-0 bg-neutral-950 z-10 border-r border-neutral-800 text-neutral-300">
                TOTAL GERAL
              </td>
              {weeks.map((w) => (
                <td key={w} className="p-3 text-center text-amber-300">
                  {colTotals[w]}
                </td>
              ))}
              <td className="p-3 text-right text-amber-400 text-sm">
                {grandTotal}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
