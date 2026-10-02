import React from 'react';
import {
  X,
  Calendar,
  Clock,
  User,
  MapPin,
  Building2,
  HardHat,
  MessageSquare,
  FileCheck2,
  AlertCircle,
  HelpCircle,
  Download,
} from 'lucide-react';
import { PhotoRecord } from '../types';
import { formatDateTimeBR } from '../utils/dateUtils';
import { triggerFileDownload } from '../utils/zipExporter';

interface PhotoDetailModalProps {
  photo: PhotoRecord | null;
  onClose: () => void;
}

export const PhotoDetailModal: React.FC<PhotoDetailModalProps> = ({ photo, onClose }) => {
  if (!photo) return null;

  const url = URL.createObjectURL(photo.blob);

  const handleDownloadSingle = () => {
    triggerFileDownload(photo.blob, photo.fileName);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Header */}
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                photo.code === 'Não identificado'
                  ? 'bg-neutral-800 text-neutral-300'
                  : 'bg-amber-400 text-neutral-950'
              }`}
            >
              {photo.code}
            </span>
            <span className="font-mono text-neutral-400 text-sm font-semibold truncate max-w-xs sm:max-w-md">
              {photo.fileName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadSingle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Baixar Foto</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body: Image + Info side-by-side or stacked */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* High-res Image */}
          <div className="bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden flex items-center justify-center p-2 min-h-[300px]">
            <img
              src={url}
              alt={photo.code}
              className="max-h-[60vh] max-w-full object-contain rounded"
            />
          </div>

          {/* Details Column */}
          <div className="space-y-4 text-xs">
            {/* Field Info */}
            <div className="bg-neutral-950/70 rounded-xl p-4 border border-neutral-800 space-y-2.5">
              <h4 className="font-semibold text-neutral-200 text-sm pb-1.5 border-b border-neutral-800">
                Dados Extraídos do Campo
              </h4>

              <div className="grid grid-cols-2 gap-2 text-neutral-300">
                <div>
                  <span className="text-neutral-500 block text-[10px]">Data & Hora</span>
                  <span className="font-mono">{formatDateTimeBR(photo.timestamp)}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Semana ISO</span>
                  <span className="font-mono text-amber-300">{photo.weekLabel}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Km / Estaca</span>
                  <span className="font-mono text-amber-300">{photo.km}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Rodovia</span>
                  <span className="font-mono">{photo.rodovia || 'Não informada'}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Empresa</span>
                  <span>{photo.empresa}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px]">Equipe</span>
                  <span>{photo.equipe}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-neutral-500 block text-[10px]">Serviço</span>
                  <span>{photo.servico}</span>
                </div>
              </div>
            </div>

            {/* WhatsApp Context */}
            <div className="bg-neutral-950/70 rounded-xl p-4 border border-neutral-800 space-y-2">
              <h4 className="font-semibold text-neutral-200 text-xs flex items-center justify-between pb-1.5 border-b border-neutral-800">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                  Registro no WhatsApp
                </span>
                <span className="font-mono text-neutral-500 text-[11px]">{photo.sender}</span>
              </h4>

              <div className="text-neutral-300 whitespace-pre-wrap font-sans bg-neutral-900/80 p-2.5 rounded border border-neutral-800 text-[11px]">
                {photo.messageText || '(Foto enviada sem mensagem ou texto de acompanhamento)'}
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 font-mono">
                <span>Grupo: {photo.groupName}</span>
                {photo.contextMessageTimeDiffMinutes !== undefined && (
                  <span className="text-amber-400/90">
                    Código obtido de msg a {photo.contextMessageTimeDiffMinutes} min
                  </span>
                )}
              </div>
            </div>

            {/* Spreadsheet Reference if matched */}
            {photo.matchedSpreadsheetRow && (
              <div className="bg-emerald-950/20 rounded-xl p-4 border border-emerald-900/40 space-y-2">
                <h4 className="font-semibold text-emerald-300 text-xs flex items-center gap-1.5 pb-1 border-b border-emerald-900/40">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                  Cruzamento Confirmado com a Planilha
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(photo.matchedSpreadsheetRow).map(([key, val]) => (
                    <div key={key}>
                      <span className="text-emerald-500/80 block text-[10px]">{key}</span>
                      <span className="text-emerald-200 font-mono">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
