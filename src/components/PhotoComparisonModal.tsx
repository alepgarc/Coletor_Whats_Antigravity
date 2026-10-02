import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, Calendar, MapPin, User, Building2, Sliders, SplitSquareVertical } from 'lucide-react';
import { PhotoRecord } from '../types';
import { formatDateTimeBR } from '../utils/dateUtils';

interface PhotoComparisonModalProps {
  photos: PhotoRecord[];
  onClose: () => void;
}

export const PhotoComparisonModal: React.FC<PhotoComparisonModalProps> = ({
  photos,
  onClose,
}) => {
  if (photos.length !== 2) return null;

  // Garante que foto 0 seja a mais antiga (Antes) e foto 1 a mais recente (Depois) por padrão
  const sorted = [...photos].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const [photoA, setPhotoA] = useState<PhotoRecord>(sorted[0]);
  const [photoB, setPhotoB] = useState<PhotoRecord>(sorted[1]);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [sliderPos, setSliderPos] = useState<number>(50);

  const [urlA, setUrlA] = useState<string>('');
  const [urlB, setUrlB] = useState<string>('');

  useEffect(() => {
    const uA = URL.createObjectURL(photoA.blob);
    const uB = URL.createObjectURL(photoB.blob);
    setUrlA(uA);
    setUrlB(uB);

    return () => {
      URL.revokeObjectURL(uA);
      URL.revokeObjectURL(uB);
    };
  }, [photoA, photoB]);

  const handleSwap = () => {
    const temp = photoA;
    setPhotoA(photoB);
    setPhotoB(temp);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-3 sm:p-6 overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800 text-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm sm:text-base">
              Comparação de Evolução (Antes / Depois)
            </span>
            <span className="font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {photoA.code === photoB.code ? photoA.code : `${photoA.code} vs ${photoB.code}`}
            </span>
          </div>

          {/* View mode toggle */}
          <div className="hidden sm:flex items-center bg-neutral-900 rounded-lg p-0.5 border border-neutral-800">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'side-by-side' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>Lado a Lado</span>
            </button>
            <button
              onClick={() => setViewMode('slider')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'slider' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Slider Sobreposto</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSwap}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
            title="Inverter ordem Antes / Depois"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Inverter Ordem</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Comparison Area */}
      <div className="flex-1 min-h-0 py-3 flex flex-col justify-center items-center">
        {viewMode === 'side-by-side' ? (
          /* Side by Side layout */
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Foto Antes (A) */}
            <div className="relative flex flex-col bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-600/90 text-white shadow-md">
                  ANTES
                </span>
              </div>
              <div className="flex-1 relative flex items-center justify-center p-2 min-h-0">
                <img
                  src={urlA}
                  alt="Antes"
                  className="max-h-full max-w-full object-contain rounded"
                />
              </div>
              {/* Info Bar */}
              <div className="p-3 bg-neutral-900/90 border-t border-neutral-800 text-[11px] grid grid-cols-2 gap-2 text-neutral-300">
                <div>
                  <div className="font-semibold text-white flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-neutral-400" />
                    {formatDateTimeBR(photoA.timestamp)}
                  </div>
                  <div className="text-neutral-400 truncate">{photoA.sender}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-amber-400">{photoA.km}</div>
                  <div className="text-neutral-400 truncate">{photoA.servico}</div>
                </div>
              </div>
            </div>

            {/* Foto Depois (B) */}
            <div className="relative flex flex-col bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden">
              <div className="absolute top-3 left-3 z-10">
                <span className="px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-emerald-600/90 text-white shadow-md">
                  DEPOIS
                </span>
              </div>
              <div className="flex-1 relative flex items-center justify-center p-2 min-h-0">
                <img
                  src={urlB}
                  alt="Depois"
                  className="max-h-full max-w-full object-contain rounded"
                />
              </div>
              {/* Info Bar */}
              <div className="p-3 bg-neutral-900/90 border-t border-neutral-800 text-[11px] grid grid-cols-2 gap-2 text-neutral-300">
                <div>
                  <div className="font-semibold text-white flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-neutral-400" />
                    {formatDateTimeBR(photoB.timestamp)}
                  </div>
                  <div className="text-neutral-400 truncate">{photoB.sender}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-amber-400">{photoB.km}</div>
                  <div className="text-neutral-400 truncate">{photoB.servico}</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Slider Overlay layout */
          <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center">
            <div className="relative w-full h-[70vh] bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden select-none">
              {/* Imagem de Fundo (Depois) */}
              <img
                src={urlB}
                alt="Depois"
                className="w-full h-full object-contain pointer-events-none"
              />
              <div className="absolute top-3 right-3 z-10">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-emerald-600/90 text-white">
                  DEPOIS
                </span>
              </div>

              {/* Imagem Cortada (Antes) */}
              <div
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <img
                  src={urlA}
                  alt="Antes"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-3 left-3 z-10">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-600/90 text-white">
                    ANTES
                  </span>
                </div>
              </div>

              {/* Linha Divisória Interativa */}
              <div
                style={{ left: `${sliderPos}%` }}
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-xl pointer-events-none -translate-x-1/2"
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-amber-400 text-neutral-950 flex items-center justify-center shadow-lg font-bold text-xs pointer-events-auto cursor-ew-resize">
                  ↔
                </div>
              </div>

              {/* Range input invisível sobreposto para deslizar facilmente */}
              <input
                type="range"
                min="0"
                max="100"
                value={sliderPos}
                onChange={(e) => setSliderPos(Number(e.target.value))}
                className="absolute inset-0 opacity-0 cursor-ew-resize w-full h-full"
              />
            </div>

            <div className="mt-2 text-xs text-neutral-400 text-center font-mono">
              Arraste a linha central para visualizar a evolução física da obra
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
