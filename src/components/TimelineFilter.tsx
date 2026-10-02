import React from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import { PhotoRecord } from '../types';

interface TimelineFilterProps {
  photos: PhotoRecord[];
  selectedWeek: string | null;
  onSelectWeek: (weekLabel: string | null) => void;
}

export const TimelineFilter: React.FC<TimelineFilterProps> = ({
  photos,
  selectedWeek,
  onSelectWeek,
}) => {
  // Agrupa fotos por semana ISO
  const weekStats = React.useMemo(() => {
    const map = new Map<string, { label: string; count: number; isoWeek: number; isoYear: number }>();

    for (const p of photos) {
      const existing = map.get(p.weekLabel);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(p.weekLabel, {
          label: p.weekLabel,
          count: 1,
          isoWeek: p.isoWeek,
          isoYear: p.isoYear,
        });
      }
    }

    // Ordena cronologicamente por ano e semana
    const list = Array.from(map.values()).sort((a, b) => {
      if (a.isoYear !== b.isoYear) return a.isoYear - b.isoYear;
      return a.isoWeek - b.isoWeek;
    });

    const maxCount = list.reduce((max, w) => Math.max(max, w.count), 1);

    return { list, maxCount };
  }, [photos]);

  if (weekStats.list.length <= 1 && !selectedWeek) {
    return null;
  }

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-neutral-200">
          <Calendar className="w-4 h-4 text-amber-400" />
          <span>Linha do Tempo · Semanas ISO (Segunda a Domingo)</span>
        </div>

        {selectedWeek && (
          <button
            onClick={() => onSelectWeek(null)}
            className="text-[11px] text-amber-400 hover:text-amber-300 font-medium px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 cursor-pointer"
          >
            Limpar filtro de semana (Mostrar todas)
          </button>
        )}
      </div>

      {/* Bar Chart Visualization */}
      <div className="flex items-end gap-2 overflow-x-auto pb-2 pt-4 px-1">
        {weekStats.list.map((week) => {
          const isSelected = selectedWeek === week.label;
          const percent = Math.max(15, Math.round((week.count / weekStats.maxCount) * 100));

          return (
            <button
              key={week.label}
              onClick={() => onSelectWeek(isSelected ? null : week.label)}
              className={`flex-1 min-w-[90px] flex flex-col items-center group cursor-pointer transition-all ${
                isSelected ? 'scale-[1.02]' : 'opacity-85 hover:opacity-100'
              }`}
            >
              {/* Count label */}
              <span
                className={`text-[11px] font-mono mb-1.5 transition-colors ${
                  isSelected ? 'text-amber-300 font-bold' : 'text-neutral-400 group-hover:text-neutral-200'
                }`}
              >
                {week.count} {week.count === 1 ? 'foto' : 'fotos'}
              </span>

              {/* Bar container */}
              <div className="w-full h-16 bg-neutral-950/80 rounded-t border border-neutral-800 flex items-end p-1">
                <div
                  style={{ height: `${percent}%` }}
                  className={`w-full rounded-sm transition-all duration-300 ${
                    isSelected
                      ? 'bg-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-neutral-700 group-hover:bg-neutral-500'
                  }`}
                />
              </div>

              {/* Week label */}
              <div
                className={`w-full text-center text-[10px] font-mono py-1 rounded-b border border-t-0 transition-colors ${
                  isSelected
                    ? 'bg-amber-950/60 border-amber-500/50 text-amber-200 font-bold'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 group-hover:text-neutral-300'
                }`}
              >
                Semana {String(week.isoWeek).padStart(2, '0')}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
