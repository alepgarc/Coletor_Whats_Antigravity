import React, { useState } from 'react';
import {
  Download,
  Chrome,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  FolderSync,
  Layers,
  Sparkles,
  HelpCircle,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  MousePointerClick,
  Calendar,
  Files,
  Maximize2,
  Tag,
  Clock,
  Zap,
  CheckCheck,
  Image,
} from 'lucide-react';
import {
  saveExtensionDirectlyToFolder,
  downloadExtensionZipBlob,
  downloadExtensionFilesIndividually,
} from '../utils/extensionManager';

export const ExtensionTab: React.FC = () => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{ mode: 'zip' | 'files' | 'folder'; detail: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  const handleCopyChromeUrl = () => {
    navigator.clipboard.writeText('chrome://extensions');
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleDownloadZip = async () => {
    setErrorMsg(null);
    setSuccessInfo(null);
    setIsProcessing(true);

    try {
      await downloadExtensionZipBlob((msg) => setStatusMsg(msg));
      setSuccessInfo({
        mode: 'zip',
        detail:
          'Arquivo "FiscalizACampo_Extensao_Chrome.zip" (v5.1 Pastas de Datas Diretas no ZIP + Caixa Única) baixado com sucesso! Agora basta clicar com o botão direito nele e escolher "Extrair Tudo...".',
      });
    } catch (err: any) {
      setErrorMsg(`Erro ao gerar ZIP: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setStatusMsg('');
    }
  };

  const handleDownloadFilesIndividually = async () => {
    setErrorMsg(null);
    setSuccessInfo(null);
    setIsProcessing(true);
    try {
      const count = await downloadExtensionFilesIndividually((msg) => setStatusMsg(msg));
      setSuccessInfo({
        mode: 'files',
        detail: `Todos os ${count} arquivos da extensão v5.1 foram baixados diretamente na sua pasta de Downloads! Basta movê-los para uma pasta e carregá-la no Chrome. Zero programas de descompactação necessários!`,
      });
    } catch (err: any) {
      setErrorMsg(`Erro ao baixar arquivos: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setStatusMsg('');
    }
  };

  const handleSaveToFolderDirectly = async () => {
    setErrorMsg(null);
    setSuccessInfo(null);

    if (isInIframe) {
      setErrorMsg(
        'O navegador bloqueia a escolha direta de pastas dentro da visualização incorporada. Abra o aplicativo em uma Nova Aba Completa clicando no botão abaixo para usar esse recurso, ou use o botão amarelo "Baixar Extensão (.ZIP)" que funciona imediatamente!'
      );
      return;
    }

    if (!('showDirectoryPicker' in window)) {
      setErrorMsg(
        'Este navegador não suporta criação direta de pastas via File System. Utilize o botão "Baixar Extensão (.ZIP)" acima.'
      );
      return;
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        id: 'fiscalizacampo-extension-folder',
        mode: 'readwrite',
      });

      setIsProcessing(true);
      setStatusMsg('Gravando arquivos da extensão na pasta...');

      const result = await saveExtensionDirectlyToFolder(dirHandle, (file) => {
        setStatusMsg(`Gravando ${file}...`);
      });

      setSuccessInfo({
        mode: 'folder',
        detail: `Extensão v5.1 Conserva_Fotos gravada com sucesso na pasta "${result.folderName}" (${result.count} arquivos prontos)!`,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setErrorMsg(`Não foi possível salvar na pasta: ${err.message}.`);
    } finally {
      setIsProcessing(false);
      setStatusMsg('');
    }
  };

  const handleOpenStandalone = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-amber-950/40 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Extensão WhatsApp Web v5.1 - Pastas de Datas Diretas no ZIP (Data / Fotos + Planilha)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Acesso Imediato: Clique no Ícone e Abra o Painel Diretamente na Aba do WhatsApp
            </h2>
            <p className="text-sm text-neutral-300 max-w-2xl leading-relaxed">
              A versão <strong>v5.1</strong> simplifica a descompactação: ao abrir o ZIP, aparecem diretamente a planilha Excel e as pastas das datas com as fotos em alta resolução, sem nenhuma pasta aninhada ou intermediária!
            </p>
          </div>

          {/* Action Box with Download Options */}
          <div className="shrink-0 flex flex-col items-stretch gap-2.5 w-full sm:w-auto min-w-[290px]">
            <button
              onClick={handleDownloadZip}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-bold text-xs shadow-lg transition-transform hover:scale-[1.01] cursor-pointer disabled:opacity-50"
              title="Baixar o arquivo compactado da extensão v5.1 Conserva_Fotos"
            >
              <Download className="w-4 h-4" />
              <span>1. Baixar Extensão (.ZIP) - v5.1</span>
            </button>

            <button
              onClick={handleDownloadFilesIndividually}
              disabled={isProcessing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              title="Baixa os arquivos um a um direto na pasta Downloads sem precisar descompactar"
            >
              <Files className="w-4 h-4 text-amber-400" />
              <span>2. Ou Baixar Arquivos Soltos (Sem ZIP)</span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1 pt-1">
              <span>Quer salvar direto em pasta?</span>
              {isInIframe ? (
                <button
                  onClick={handleOpenStandalone}
                  className="text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer font-medium"
                >
                  <ExternalLink className="w-3 h-3" /> Abrir em Nova Aba
                </button>
              ) : (
                <button
                  onClick={handleSaveToFolderDirectly}
                  className="text-amber-400 hover:underline cursor-pointer font-medium"
                >
                  Salvar em Pasta
                </button>
              )}
            </div>

            {statusMsg && (
              <div className="text-[11px] font-mono text-amber-400 flex items-center justify-center gap-1.5 py-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{statusMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success banner */}
      {successInfo && (
        <div className="p-4 bg-emerald-950/60 border border-emerald-600/40 rounded-xl text-emerald-300 flex items-start gap-3 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block text-emerald-200 text-sm">Download Concluído com Sucesso!</strong>
            <p>{successInfo.detail}</p>
            <p className="text-[11px] text-emerald-400/90 mt-1">
              👉 Vá em <code>chrome://extensions</code> no seu navegador, ative o "Modo do desenvolvedor", clique no botão de recarregar (🔄) no card da extensão e recarregue a página do WhatsApp Web com F5.
            </p>
          </div>
        </div>
      )}

      {/* Error banner with explanation */}
      {errorMsg && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 flex items-start gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block text-amber-300">Aviso:</strong>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* Destaque das Novidades da Versão 5.1 */}
      <div className="bg-neutral-900/80 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <Sparkles className="w-4 h-4" />
          <span>Versão v5.1 (Pastas de Datas Diretas no ZIP + Caixa Única Integrada):</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs text-neutral-300">
          <div className="bg-neutral-950 p-3.5 rounded-xl border border-emerald-500/40 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <FolderSync className="w-4 h-4 text-emerald-400" />
              <span>1. 🔄 Rolar e Sincronizar</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Etapa 1: Rola o chat para trás até a Data Inicial (ex: 15/09) e depois desce até a Data Final (ex: 20/09), exibindo aviso de tela de que a sincronização está concluída.
            </p>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>2. 📸 Coleta no Modal</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Etapa 2: Com o modal e a barra horizontal abertos, clica no botão 2 para iniciar imediatamente a captura retroativa via botão '&lt;' e miniaturas.
            </p>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-semibold">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>📊 Barra Horizontal</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Interage com a galeria inferior de miniaturas saltando dias sem foto e navegando continuadamente à esquerda.
            </p>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-xl border border-rose-500/40 space-y-2">
            <div className="flex items-center gap-2 text-rose-400 font-semibold">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>⏱️ Intervalo [Inicial ➔ Final]</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Filtro por range configurável: define a Data Inicial (limite mais antigo, ex: 15/09) e Data Final (partida mais recente, ex: 20/09), ignorando fotos fora da janela.
            </p>
          </div>

          <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-sky-400 font-semibold">
              <Tag className="w-4 h-4 text-sky-400" />
              <span>🏷️ Nomenclatura & ZIP</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              Estrutura de pastas padronizada com índice Excel completo para conferência e auditoria de campo.
            </p>
          </div>
        </div>
      </div>

      {/* Como descompactar o ZIP no Windows facilmente */}
      <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <HelpCircle className="w-4 h-4" />
          <span>Como extrair o arquivo .ZIP no Windows (Passo a Passo Simples):</span>
        </div>

        <div className="text-xs text-neutral-300 space-y-2">
          <p className="text-neutral-300 text-[12px] leading-relaxed">
            Se você clicou no botão amarelo <strong>"1. Baixar Extensão (.ZIP)"</strong>, siga este procedimento no seu computador:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-neutral-400 text-[11px] bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
            <li>Abra a pasta <strong>Downloads</strong> do seu computador.</li>
            <li>
              Clique com o <strong>botão direito</strong> em cima do arquivo <code>FiscalizACampo_Extensao_Chrome.zip</code>.
            </li>
            <li>
              Clique em <strong>"Extrair Tudo..."</strong> (ou <em>Extract All</em>).
            </li>
            <li>
              Clique no botão <strong>"Extrair"</strong> na janelinha que abrir. Uma pasta normal chamada <code>FiscalizACampo_Extensao_Chrome</code> surgirá no mesmo local com todos os arquivos prontos!
            </li>
          </ol>
        </div>
      </div>

      {/* 4-Step Quick Install Guide */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Passo a Passo para Ativar ou Atualizar a Extensão v2.4 no Navegador</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-sm mb-3">
                1
              </div>
              <strong className="text-neutral-100 block mb-1 text-sm">Baixar e Extrair v2.4</strong>
              <p className="text-neutral-400 leading-relaxed">
                Baixe o <strong>.ZIP</strong> e extraia a pasta, ou baixe os <strong>Arquivos Soltos</strong> para uma pasta.
              </p>
            </div>
            <span className="text-[11px] text-amber-400/90 font-mono">Pasta pronta no computador</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-sm mb-3">
                2
              </div>
              <strong className="text-neutral-100 block mb-1 text-sm">Abrir Extensões</strong>
              <p className="text-neutral-400 leading-relaxed">
                No Google Chrome ou Edge, digite na barra de endereços:
              </p>
              <div className="mt-2 flex items-center gap-1.5 bg-neutral-900 border border-neutral-700/80 rounded px-2 py-1">
                <code className="text-amber-300 font-mono text-[11px] truncate select-all">
                  chrome://extensions
                </code>
                <button
                  onClick={handleCopyChromeUrl}
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer ml-auto"
                  title="Copiar URL"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <span className="text-[11px] text-neutral-400">Pressione Enter</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-sm mb-3">
                3
              </div>
              <strong className="text-neutral-100 block mb-1 text-sm">Modo Desenvolvedor</strong>
              <p className="text-neutral-400 leading-relaxed">
                No canto superior direito da tela de extensões, ligue a chave:
              </p>
              <div className="mt-2 inline-block px-2.5 py-1 rounded bg-neutral-900 border border-neutral-700 text-amber-300 font-mono text-[11px]">
                Modo do desenvolvedor: ON
              </div>
            </div>
            <span className="text-[11px] text-neutral-400">Habilita extensões locais</span>
          </div>

          <div className="bg-neutral-950/80 border border-neutral-800 p-4 rounded-xl flex flex-col justify-between space-y-2">
            <div>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm mb-3">
                4
              </div>
              <strong className="text-neutral-100 block mb-1 text-sm">Carregar ou Atualizar</strong>
              <p className="text-neutral-400 leading-relaxed">
                Clique em <strong>"Carregar sem compactação"</strong> (ou no botão de recarregar 🔄 se já estiver instalada).
              </p>
            </div>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Pronto para usar!
            </span>
          </div>
        </div>
      </div>

      {/* Recursos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Maximize2 className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-neutral-100 text-sm">Zero Duplicatas (Ultra HD Real)</h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Elimina completamente arquivos repetidos de baixa resolução. Cada imagem capturada gera 1 único arquivo original em alta qualidade.
          </p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Layers className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-neutral-100 text-sm">Padrão EMPRESA_AREA_DATA_SEQ</h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Detecta os códigos de serviço (BSO, PAV, ROC, DRE, SER), quilômetros (km 245), empresa e área,
            renomeando as fotos para <code>EMPRESA_AREA_AAAAMMDD_001.jpg</code> em pastas organizadas com planilha.
          </p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-neutral-100 text-sm">Privacidade Total</h4>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Opera 100% no seu computador. Nenhum dado ou foto sai do seu navegador, mantendo conformidade e segurança total do WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
};
