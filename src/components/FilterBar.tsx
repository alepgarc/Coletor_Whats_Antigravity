import React from 'react';
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react';
import { PhotoRecord } from '../types';

export interface FilterState {
  searchQuery: string;
  itemCode: string;
  groupName: string;
  sender: string;
  empresa: string;
  equipe: string;
  crossStatus: 'all' | 'matched' | 'no_spreadsheet_match' | 'unidentified';
  dateStart: string;
  dateEnd: string;
  sortBy: 'date_desc' | 'date_asc' | 'code' | 'sender';
}

interface FilterBarProps {
  photos: PhotoRecord[];
  filters: FilterState;
  onUpdateFilters: (updated: Partial<FilterState>) => void;
  onClearFilters: () => void;
  filteredCount: number;
  totalCount: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  photos,
  filters,
  onUpdateFilters,
  onClearFilters,
  filteredCount,
  totalCount,
}) => {
  // Coleta opções distintas para os dropdowns
  const uniqueItems = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      if (p.code) set.add(p.code);
    }
    return Array.from(set).sort();
  }, [photos]);

  const uniqueGroups = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      if (p.groupName) set.add(p.groupName);
    }
    return Array.from(set).sort();
  }, [photos]);

  const uniqueSenders = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      if (p.sender) set.add(p.sender);
    }
    return Array.from(set).sort();
  }, [photos]);

  const uniqueEmpresas = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) {
      if (p.empresa && p.empresa !== 'Não informado') set.add(p.empresa);
    }
    return Array.from(set).sort();
  }, [photos]);

  const hasActiveFilters =
    Boolean(filters.searchQuery) ||
    Boolean(filters.itemCode) ||
    Boolean(filters.groupName) ||
    Boolean(filters.sender) ||
    Boolean(filters.empresa) ||
    Boolean(filters.equipe) ||
    filters.crossStatus !== 'all' ||
    Boolean(filters.dateStart) ||
    Boolean(filters.dateEnd);

  return (
    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 mb-6">
      {/* Header with counter and clear */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs">
        <div className="flex items-center gap-2 font-semibold text-neutral-200">
          <Filter className="w-4 h-4 text-amber-400" />
          <span>Filtros Combinados</span>
          <span className="text-neutral-400 font-normal font-mono text-[11px] ml-1">
            Exibindo <strong className="text-amber-400">{filteredCount}</strong> de {totalCount} fotos
          </span>
        </div>

        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-red-400 font-medium transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Limpar Todos os Filtros</span>
          </button>
        )}
      </div>

      {/* Inputs grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
        {/* Busca textual */}
        <div className="relative sm:col-span-2">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por km, serviço, texto..."
            value={filters.searchQuery}
            onChange={(e) => onUpdateFilters({ searchQuery: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded pl-8 pr-2.5 py-1.5 text-neutral-100 text-xs placeholder:text-neutral-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        {/* Item / Frente */}
        <div>
          <select
            value={filters.itemCode}
            onChange={(e) => onUpdateFilters({ itemCode: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400"
          >
            <option value="">Todos os Itens/Frentes</option>
            {uniqueItems.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {/* Grupo de Origem */}
        <div>
          <select
            value={filters.groupName}
            onChange={(e) => onUpdateFilters({ groupName: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400 truncate"
          >
            <option value="">Todos os Grupos</option>
            {uniqueGroups.map((g) => (
              <option key={g} value={g}>
                {g.length > 25 ? `${g.slice(0, 25)}...` : g}
              </option>
            ))}
          </select>
        </div>

        {/* Remetente */}
        <div>
          <select
            value={filters.sender}
            onChange={(e) => onUpdateFilters({ sender: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400"
          >
            <option value="">Todos os Remetentes</option>
            {uniqueSenders.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Status de Cruzamento com Planilha */}
        <div>
          <select
            value={filters.crossStatus}
            onChange={(e) => onUpdateFilters({ crossStatus: e.target.value as any })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400"
          >
            <option value="all">Status: Todos</option>
            <option value="matched">Confirmado na Planilha</option>
            <option value="no_spreadsheet_match">Sem Par na Planilha</option>
            <option value="unidentified">Não Identificado</option>
          </select>
        </div>
      </div>

      {/* Secondary Row: Empresa, Datas e Ordenação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 mt-2.5 pt-2.5 border-t border-neutral-800/60 text-xs">
        {/* Empresa */}
        <div>
          <select
            value={filters.empresa}
            onChange={(e) => onUpdateFilters({ empresa: e.target.value })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400"
          >
            <option value="">Todas as Empresas</option>
            {uniqueEmpresas.map((emp) => (
              <option key={emp} value={emp}>
                {emp}
              </option>
            ))}
          </select>
        </div>

        {/* Data Início */}
        <div>
          <input
            type="date"
            value={filters.dateStart}
            onChange={(e) => onUpdateFilters({ dateStart: e.target.value })}
            placeholder="Data inicial"
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-300 text-xs focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>

        {/* Data Fim */}
        <div>
          <input
            type="date"
            value={filters.dateEnd}
            onChange={(e) => onUpdateFilters({ dateEnd: e.target.value })}
            placeholder="Data final"
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-300 text-xs focus:outline-none focus:border-amber-400 font-mono"
          />
        </div>

        {/* Ordenar por */}
        <div>
          <select
            value={filters.sortBy}
            onChange={(e) => onUpdateFilters({ sortBy: e.target.value as any })}
            className="w-full bg-neutral-950 border border-neutral-700/80 rounded px-2.5 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-amber-400 font-mono"
          >
            <option value="date_desc">Mais Recentes Primeiro</option>
            <option value="date_asc">Mais Antigas Primeiro</option>
            <option value="code">Ordenar por Código/Item</option>
            <option value="sender">Ordenar por Remetente</option>
          </select>
        </div>
      </div>
    </div>
  );
};
