import React, { useState } from 'react';
import {
  X,
  Download,
  FolderTree,
  FileSpreadsheet,
  Layers,
  CheckCircle,
  Loader2,
  HardDrive,
  Info,
  FolderCheck,
  AlertCircle,
  FileArchive,
  ExternalLink,
} from 'lucide-react';
import { PhotoRecord, ExportConfig, SpreadsheetConfig, CrossConferenceResults } from '../types';
import { exportPhotosToZips, exportPhotosDirectlyToDirectory } from '../utils/zipExporter';

interface ExportModalProps {
  photos: PhotoRecord[];
  spreadsheetConfig: SpreadsheetConfig | null;
  conference: CrossConferenceResults;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  photos,
  spreadsheetConfig,
  conference,
  onClose,
}) => {
  const [config, setConfig] = useState<ExportConfig>({
    namingPrefix: 'CONS_',
    groupingScheme: 'empresa-equipe-data',
    maxZipMb: 200,
    includeIndexXlsx: true,
    includeAuditSheets: true,
  });

  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [successInfo, setSuccessInfo] = useState<{ mode: 'direct' | 'zip'; folderName?: string; count: number } | null>(null);
  const [directError, setDirectError] = useState<string | null>(null);

  // Modo 1: Salvar Diretamente em uma Pasta no Computador / Desktop
  const handleSaveDirectlyToFolder = async () => {
    setDirectError(null);
    setSuccessInfo(null);

    // Verifica se a API do navegador é suportada
    if (!('showDirectoryPicker' in window)) {
      setDirectError(
        'Este navegador não suporta gravação direta de pastas no disco. Utilize a opção "Baixar em Arquivo .ZIP" abaixo.'
      );
      return;
    }

    try {
      // Abre o diálogo nativo do Windows/Mac para o usuário escolher a pasta de destino (ex: Lalla 2, Desktop)
      const dirHandle = await (window as any).showDirectoryPicker({
        id: 'fiscalizacampo-export-folder',
        mode: 'readwrite',
      });

      setIsExporting(true);

      const result = await exportPhotosDirectlyToDirectory(
        dirHandle,
        photos,
        config,
        spreadsheetConfig,
        conference,
        (current, total, status) => {
          setProgressText(status);
          setProgressPercent(Math.round((current / total) * 100));
        }
      );

      setSuccessInfo({
        mode: 'direct',
        folderName: result.folderName,
        count: result.totalFilesSaved,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Usuário apenas cancelou a seleção da pasta
        return;
      }
      if (err.name === 'SecurityError') {
        setDirectError(
          'O navegador restringiu o acesso direto a pastas dentro deste iframe. Utilize o botão "Baixar em Arquivo .ZIP": ao extrair o ZIP, todas as pastas serão criadas no seu computador!'
        );
      } else {
        setDirectError(`Não foi possível gravar na pasta: ${err.message}. Tente utilizar a opção .ZIP.`);
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Modo 2: Baixar Arquivo .ZIP
  const handleStartZipExport = async () => {
    setDirectError(null);
    setSuccessInfo(null);
    setIsExporting(true);

    try {
      await exportPhotosToZips(
        photos,
        config,
        spreadsheetConfig,
        conference,
        (current, total, status) => {
          setProgressText(status);
          setProgressPercent(Math.round((current / total) * 100));
        }
      );

      setSuccessInfo({
        mode: 'zip',
        count: photos.length,
      });
    } catch (err: any) {
      alert(`Erro durante exportação: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl text-xs">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-100 text-sm sm:text-base">
                Salvar e Organizar Fotos na Pasta do Computador
              </h3>
              <p className="text-[11px] text-neutral-400 font-mono">
                {photos.length} fotos prontas para serem ordenadas e salvas
              </p>
            </div>
          </div>

          {!isExporting && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Form Options */}
        <div className="space-y-4">
          {/* Estrutura de Pastas */}
          <div>
            <label className="block text-neutral-200 font-semibold mb-1 flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5 text-amber-400" />
              <span>Estrutura de Subpastas Desejada:</span>
            </label>
            <select
              value={config.groupingScheme}
              disabled={isExporting}
              onChange={(e) =>
                setConfig({ ...config, groupingScheme: e.target.value as any })
              }
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-neutral-200 font-mono text-xs focus:outline-none focus:border-amber-400"
            >
              <option value="empresa-equipe-data">
                📁 Empresa / Equipe / Data / fotos (Recomendado: Ordenação por Empreiteira)
              </option>
              <option value="semana-item">
                📁 Semana-SS-AAAA / ITEM (Frente) / fotos (Padrão para Medição Rodoviária)
              </option>
              <option value="item-semana">
                📁 ITEM / Semana-SS-AAAA / fotos (Focado por Frente de Serviço)
              </option>
              <option value="mes-item">
                📁 Mês-AAAA-MM / ITEM / fotos (Fechamento Mensal)
              </option>
              <option value="grupo-item">
                📁 Grupo_WhatsApp / ITEM / fotos (Mantém Separação por Grupo)
              </option>
            </select>
          </div>

          {/* Prefixo e Nomenclatura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-200 font-semibold mb-1">
                Prefixo do Nome dos Arquivos:
              </label>
              <input
                type="text"
                disabled={isExporting}
                value={config.namingPrefix}
                onChange={(e) => setConfig({ ...config, namingPrefix: e.target.value })}
                placeholder="Ex: CONS_, BSO_, FOTO_"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2 text-neutral-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-neutral-400 mt-1 block font-mono">
                Exemplo: <code className="text-amber-300">{config.namingPrefix}20260924_001.jpg</code>
              </span>
            </div>

            <div>
              <label className="block text-neutral-200 font-semibold mb-1">
                Limite por Parte de ZIP (~MB):
              </label>
              <input
                type="number"
                min="50"
                max="1000"
                disabled={isExporting}
                value={config.maxZipMb}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    maxZipMb: Math.max(10, parseInt(e.target.value, 10) || 200),
                  })
                }
                className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2 text-neutral-100 font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <span className="text-[10px] text-neutral-400 mt-1 block">
                Particiona em partes caso ultrapasse o limite
              </span>
            </div>
          </div>

          {/* Checkbox Planilha de Índice */}
          <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeIndexXlsx}
                disabled={isExporting}
                onChange={(e) =>
                  setConfig({ ...config, includeIndexXlsx: e.target.checked })
                }
                className="rounded border-neutral-700 text-amber-500 focus:ring-0"
              />
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                Salvar planilha INDICE_E_CONFERENCIA_CAMPOS.xlsx junto com as fotos
              </span>
            </label>
            <p className="text-[11px] text-neutral-400 pl-5">
              Gera tabela com cruzamento de dados, quilômetros, serviços e as 3 listas de auditoria.
            </p>
          </div>

          {/* Direct error banner */}
          {directError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 flex items-start gap-2.5 text-[11px]">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-300">Aviso do Navegador:</strong>
                <span>{directError}</span>
              </div>
            </div>
          )}

          {/* Instruções Visuais */}
          <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
            <div className="font-semibold text-neutral-200 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-amber-400" />
              <span>Como os arquivos são salvos na sua pasta:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-neutral-400">
              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <strong className="text-amber-300 block mb-1">Opção A: Salvar Diretamente na Pasta</strong>
                Você escolhe uma pasta existente no seu computador (ex: <em>Lalla 2</em> ou <em>Desktop</em>) e o navegador cria as subpastas e grava as fotos direto no seu disco.
              </div>
              <div className="bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
                <strong className="text-amber-300 block mb-1">Opção B: Baixar Arquivo .ZIP</strong>
                O navegador baixa um arquivo .zip. Ao clicar nele com o botão direito e escolher <em>"Extrair Tudo"</em>, todas as pastas são descompactadas ordenadas na sua máquina.
              </div>
            </div>
          </div>
        </div>

        {/* Progress Display */}
        {isExporting && (
          <div className="mt-4 pt-3 border-t border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-amber-400 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {progressText}
              </span>
              <span className="text-neutral-300">{progressPercent}%</span>
            </div>

            <div className="w-full bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
              <div
                style={{ width: `${progressPercent}%` }}
                className="bg-amber-400 h-full transition-all duration-200"
              />
            </div>
          </div>
        )}

        {/* Success Banner */}
        {successInfo && !isExporting && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-600/40 rounded-lg text-emerald-300 flex items-start gap-2.5 text-xs">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              {successInfo.mode === 'direct' ? (
                <div>
                  <strong className="block text-emerald-200">
                    Sucesso! {successInfo.count} fotos gravadas diretamente na pasta: "{successInfo.folderName}"
                  </strong>
                  <span className="text-[11px] text-emerald-400/90">
                    As subpastas (Empresa / Equipe / Data ou Semana) e a planilha foram criadas no seu disco local.
                  </span>
                </div>
              ) : (
                <div>
                  <strong className="block text-emerald-200">
                    Arquivo .ZIP gerado e baixado com sucesso ({successInfo.count} fotos)!
                  </strong>
                  <span className="text-[11px] text-emerald-400/90">
                    Verifique a pasta Downloads. Ao descompactar, todas as pastas serão criadas automaticamente.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors cursor-pointer"
          >
            {successInfo ? 'Fechar' : 'Cancelar'}
          </button>

          {/* Botão Baixar ZIP */}
          <button
            onClick={handleStartZipExport}
            disabled={isExporting || photos.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Gera arquivo .ZIP contendo as pastas organizadas para descompactar no computador"
          >
            <FileArchive className="w-4 h-4 text-amber-400" />
            <span>Baixar em Arquivo .ZIP</span>
          </button>

          {/* Botão Salvar Diretamente na Pasta */}
          <button
            onClick={handleSaveDirectlyToFolder}
            disabled={isExporting || photos.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs transition-colors cursor-pointer shadow-md disabled:opacity-50"
            title="Escolha uma pasta no seu computador (ex: Desktop, Lalla 2) para salvar as subpastas e fotos diretamente"
          >
            <FolderCheck className="w-4 h-4" />
            <span>Salvar Diretamente na Pasta do Computador</span>
          </button>
        </div>
      </div>
    </div>
  );
};
