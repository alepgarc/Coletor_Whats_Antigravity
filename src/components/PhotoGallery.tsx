import React, { useState, useEffect } from 'react';
import {
  Maximize2,
  Columns,
  Check,
  Calendar,
  User,
  MapPin,
  Building2,
  HardHat,
  MessageSquare,
  FileCheck2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { PhotoRecord } from '../types';
import { formatDateTimeBR } from '../utils/dateUtils';

interface PhotoGalleryProps {
  photos: PhotoRecord[];
  selectedForCompare: PhotoRecord[];
  onToggleComparePhoto: (photo: PhotoRecord) => void;
  onOpenCompareModal: () => void;
  onClearCompareSelection: () => void;
  onOpenPhotoDetail: (photo: PhotoRecord) => void;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  photos,
  selectedForCompare,
  onToggleComparePhoto,
  onOpenCompareModal,
  onClearCompareSelection,
  onOpenPhotoDetail,
}) => {
  // URLs geradas para visualização
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const urls = new Map<string, string>();
    for (const p of photos) {
      if (!urls.has(p.id)) {
        try {
          urls.set(p.id, URL.createObjectURL(p.blob));
        } catch {
          // fallback
        }
      }
    }
    setPhotoUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [photos]);

  const isSelectedForCompare = (photoId: string) => {
    return selectedForCompare.some((p) => p.id === photoId);
  };

  if (photos.length === 0) {
    return (
      <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-12 text-center">
        <p className="text-neutral-400 text-sm mb-2">Nenhuma foto encontrada para os filtros selecionados.</p>
        <p className="text-neutral-500 text-xs">Ajuste os filtros acima ou limpe a busca.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Floating Compare Action Bar when photos are selected */}
      {selectedForCompare.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-neutral-900/95 border border-amber-500/40 shadow-2xl shadow-black/80 rounded-full px-5 py-2.5 flex items-center gap-4 backdrop-blur">
          <div className="text-xs text-neutral-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span>
              <strong>{selectedForCompare.length}</strong> de 2 fotos selecionadas para comparação
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenCompareModal}
              disabled={selectedForCompare.length !== 2}
              className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 disabled:hover:bg-amber-400 text-neutral-950 font-semibold text-xs rounded-full transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>Comparar Lado a Lado (Antes/Depois)</span>
            </button>

            <button
              onClick={onClearCompareSelection}
              className="text-xs text-neutral-400 hover:text-neutral-200 px-2 py-1 rounded transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Grid of Photo Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photos.map((photo) => {
          const isSelected = isSelectedForCompare(photo.id);
          const imgUrl = photoUrls.get(photo.id);

          return (
            <div
              key={photo.id}
              className={`bg-neutral-900/80 rounded-xl border transition-all duration-200 overflow-hidden flex flex-col group ${
                isSelected
                  ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-lg shadow-amber-500/10'
                  : 'border-neutral-800 hover:border-neutral-700'
              }`}
            >
              {/* Image Container with Overlay Controls */}
              <div className="relative aspect-4/3 bg-neutral-950 overflow-hidden">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={photo.code}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                    Carregando mídia...
                  </div>
                )}

                {/* Scrim gradiente superior e inferior */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/60 pointer-events-none" />

                {/* Top overlay: Code tag and compare checkbox */}
                <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-auto z-10">
                  {/* Code badge */}
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold shadow-sm ${
                      photo.code === 'Não identificado'
                        ? 'bg-neutral-800/90 text-neutral-300 border border-neutral-700'
                        : 'bg-amber-400 text-neutral-950 border border-amber-300'
                    }`}
                  >
                    {photo.code}
                  </span>

                  {/* Compare selection checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onToggleComparePhoto(photo);
                    }}
                    title={isSelected ? 'Remover da comparação' : 'Selecionar para comparar antes/depois'}
                    aria-label="Selecionar para comparação antes e depois"
                    className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer shadow-md ${
                      isSelected
                        ? 'bg-amber-400 text-neutral-950 ring-2 ring-white shadow-amber-500/30 font-bold scale-105'
                        : 'bg-black/75 hover:bg-black text-neutral-200 hover:text-white border border-white/30 hover:border-white/60'
                    }`}
                  >
                    <Check className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100 stroke-[3]' : 'opacity-40'}`} />
                    <span>{isSelected ? 'Selecionada' : 'Comparar'}</span>
                  </button>
                </div>

                {/* Bottom overlay: Km, Service & Fullscreen trigger */}
                <div className="absolute bottom-2 left-2.5 right-2.5 flex items-end justify-between pointer-events-auto text-xs text-white z-10">
                  <div className="truncate max-w-[80%] drop-shadow-md">
                    <div className="font-semibold text-xs truncate flex items-center gap-1">
                      {photo.km !== 'Não informado' && (
                        <span className="font-mono text-amber-300">{photo.km}</span>
                      )}
                      {photo.rodovia && (
                        <span className="text-[10px] text-neutral-300 font-mono">({photo.rodovia})</span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-300 truncate">
                      {photo.servico || 'Conservação'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenPhotoDetail(photo);
                    }}
                    className="p-1.5 rounded-md bg-black/75 hover:bg-black text-white/90 hover:text-white border border-white/30 hover:border-white/60 transition-colors cursor-pointer"
                    title="Visualizar em tela cheia e detalhes"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card Metadata Body */}
              <div className="p-3 flex-1 flex flex-col justify-between text-[11px] space-y-2">
                {/* Date & Sender */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-neutral-400 font-mono text-[10px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-neutral-500" />
                      {formatDateTimeBR(photo.timestamp)}
                    </span>
                    <span className="text-neutral-500">Semana {photo.isoWeek}</span>
                  </div>

                  <div className="flex items-center gap-1 text-neutral-300 truncate font-medium">
                    <User className="w-3 h-3 text-neutral-500 shrink-0" />
                    <span className="truncate">{photo.sender}</span>
                  </div>
                </div>

                {/* Empresa & Equipe */}
                {(photo.empresa !== 'Não informado' || photo.equipe !== 'Não informado') && (
                  <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between text-[10px] text-neutral-400">
                    <span className="truncate max-w-[60%] flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-neutral-500 shrink-0" />
                      <span className="truncate">{photo.empresa}</span>
                    </span>
                    {photo.equipe !== 'Não informado' && (
                      <span className="font-mono text-neutral-400 shrink-0">{photo.equipe}</span>
                    )}
                  </div>
                )}

                {/* Spreadsheet Matching Status Badge */}
                <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between">
                  {photo.crossStatus === 'matched' ? (
                    <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-medium">
                      <FileCheck2 className="w-3 h-3 shrink-0" />
                      <span>Confirmado na Planilha</span>
                    </span>
                  ) : photo.crossStatus === 'no_spreadsheet_match' ? (
                    <span className="flex items-center gap-1 text-amber-400/90 text-[10px] font-medium" title="Código não cadastrado na planilha de referência">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Sem par na planilha</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-neutral-500 text-[10px]" title="Não foi possível identificar o código deste registro">
                      <HelpCircle className="w-3 h-3 shrink-0" />
                      <span>Não identificado</span>
                    </span>
                  )}

                  <span className="text-[10px] font-mono text-neutral-500 truncate max-w-[40%]" title={photo.groupName}>
                    {photo.groupName.replace(/^Conversa WhatsApp - /i, '').slice(0, 15)}...
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
