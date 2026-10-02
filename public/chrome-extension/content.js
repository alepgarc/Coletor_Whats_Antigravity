/**
 * Conserva_Fotos - FiscalizACampo WhatsApp Web
 * Versão 2.4.1 Real HD - Extração Direta de Mídias via WWebJS (whatsapp-web.js), Datas Precisas, Expansão Completa de Álbuns e Armazenamento em Lote no IndexedDB
 * 
 * Funcionalidades principais v2.4.1:
 * 1. Extração Direta de Mídias (WWebJS / whatsapp-web.js):
 *    Recupera Blobs nativos originais sem latência de visualizador e com fallback automático para mídias em memória.
 * 2. Estrutura de Salvamento em Lote no IndexedDB Mantida 100%:
 *    Persistência em disco via TempBlobStorage (IndexedDB), liberando memória RAM e compactando em lotes de 150 fotos.
 * 3. Auto-carregamento e Fallback Seguro de JSZip e XLSX:
 *    Garante que as bibliotecas de compactação ZIP e Excel estejam sempre disponíveis sem mensagens de erro.
 * 4. Fechamento Ativo de Modais / Lightbox do WhatsApp:
 *    Garante que telas de mídia aberta ou "Imagem indisponível" sejam fechadas sem interromper a varredura do chat.
 * 5. Detecção Precisa de Datas: Identifica divisores de data reais do WhatsApp e timestamps nativos sem inventar datas futuras.
 */

(function () {
  'use strict';

  if (window.__fiscalizacampo_injected__) return;
  window.__fiscalizacampo_injected__ = true;

  console.log('[Conserva_Fotos] Extensão v3.2.8 carregada no WhatsApp Web.');

  // =========================================================================
  // BUNDLE LOCAL SEGURA DE BIBLIOTECAS (JSZIP & XLSX - ZERO CDN EXTERNALIZATION)
  // Carregamento 100% offline via manifest.json (jszip.min.js & xlsx.full.min.js)
  // =========================================================================
  async function ensureLibrariesLoaded() {
    return Boolean(
      (window.JSZip || typeof JSZip !== 'undefined') && 
      (window.XLSX || typeof XLSX !== 'undefined')
    );
  }

  // Inicializa a tentativa de carregamento em segundo plano
  ensureLibrariesLoaded().catch(() => {});

  // =========================================================================
  // SISTEMA DE ARMAZENAMENTO TEMPORÁRIO DE BLOBS EM DISCO (INDEXEDDB)
  // Evita manter centenas/milhares de Blobs pesados no Heap do JavaScript
  // =========================================================================
  const TempBlobStorage = {
    db: null,
    async init() {
      if (this.db) return true;
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open('fac_temp_blob_db', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('blobs')) {
              db.createObjectStore('blobs');
            }
          };
          req.onsuccess = (e) => {
            this.db = e.target.result;
            resolve(true);
          };
          req.onerror = () => {
            this.db = null;
            resolve(false);
          };
        } catch (err) {
          this.db = null;
          resolve(false);
        }
      });
    },
    isAvailable() {
      return Boolean(this.db);
    },
    async store(key, blob) {
      if (!this.db || !blob) return false;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('blobs', 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.put(blob, key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    },
    async retrieve(key) {
      if (!this.db) return null;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('blobs', 'readonly');
          const store = tx.objectStore('blobs');
          const req = store.get(key);
          req.onsuccess = (e) => resolve(e.target.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    },
    async remove(key) {
      if (!this.db) return false;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('blobs', 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.delete(key);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    },
    async clear() {
      if (!this.db) return false;
      return new Promise((resolve) => {
        try {
          const tx = this.db.transaction('blobs', 'readwrite');
          const store = tx.objectStore('blobs');
          const req = store.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    }
  };

  // Inicializa o banco IndexedDB imediatamente
  TempBlobStorage.init();

  // =========================================================================
  // EXTRAÇÃO DIRETA DE MÍDIAS VIA FUNÇÃO DO GITHUB (whatsapp-web.js - wwebjs)
  // Repositório: https://github.com/wwebjs/whatsapp-web.js/
  // Arquivo de referência: src/util/Injected/Utils.js -> resolveMediaBlob
  // =========================================================================
  window.WWebJS = window.WWebJS || {};

  function getWAWebModule(moduleName) {
    if (typeof window.require === 'function') {
      try {
        return window.require(moduleName);
      } catch (e) {}
    }
    if (window.__fac_wa_require) {
      try {
        return window.__fac_wa_require(moduleName);
      } catch (e) {}
    }
    if (window.webpackChunkwhatsapp_web_client && !window.__fac_wa_require) {
      try {
        window.webpackChunkwhatsapp_web_client.push([
          [Symbol('fac_req_finder')],
          {},
          (r) => {
            window.__fac_wa_require = r;
            if (typeof window.require !== 'function') {
              window.require = r;
            }
          }
        ]);
        if (window.__fac_wa_require) {
          return window.__fac_wa_require(moduleName);
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Resolves the media blob and metadata for a message.
   * Shared by downloadMedia and downloadMediaStream.
   * Função oficial do whatsapp-web.js (wwebjs/src/util/Injected/Utils.js)
   */
  window.WWebJS.resolveMediaBlob = async (msgIdOrModel) => {
    try {
      const waCollections = getWAWebModule('WAWebCollections');
      if (!waCollections || !waCollections.Msg) return null;
      const { Msg } = waCollections;

      let msg = null;
      if (msgIdOrModel && typeof msgIdOrModel === 'object' && msgIdOrModel.mediaData) {
        msg = msgIdOrModel;
      } else if (typeof msgIdOrModel === 'string' && msgIdOrModel) {
        msg = Msg.get(msgIdOrModel) || (await Msg.getMessagesById([msgIdOrModel]))?.messages?.[0];
      }

      if (
        !msg ||
        !msg.mediaData ||
        msg.mediaData.mediaStage === 'REUPLOADING'
      ) {
        return null;
      }

      if (typeof msg.downloadMedia === 'function') {
        await msg.downloadMedia({
          downloadEvenIfExpensive: true,
          rmrReason: 1,
          isUserInitiated: true,
        });
      }

      if (
        (msg.mediaData.mediaStage && String(msg.mediaData.mediaStage).includes('ERROR')) ||
        msg.mediaData.mediaStage === 'FETCHING'
      ) {
        return null;
      }

      let cached = null;
      try {
        const memCacheMod = getWAWebModule('WAWebMediaInMemoryBlobCache');
        if (memCacheMod?.InMemoryMediaBlobCache) {
          cached = memCacheMod.InMemoryMediaBlobCache.get(msg.mediaObject?.filehash);
        }
      } catch (e) {}

      let blob = null;
      if (cached) {
        blob = cached;
      } else if (msg.mediaObject?.mediaBlob && typeof msg.mediaObject.mediaBlob.forceToBlob === 'function') {
        blob = msg.mediaObject.mediaBlob.forceToBlob();
      }

      if (!blob) return null;

      return {
        blob,
        mimetype: msg.mimetype || blob.type || 'image/jpeg',
        filename: msg.filename || `foto_${msg.id?._serialized || Date.now()}.jpg`,
        filesize: msg.size || blob.size,
        timestamp: msg.t ? msg.t * 1000 : null,
        caption: msg.caption || msg.body || '',
        messageModel: msg,
      };
    } catch (err) {
      return null;
    }
  };

  /**
   * Invoca a extração direta de mídia de forma síncrona/imediata sem timeouts longos
   */
  async function requestResolveMedia(msgIdOrModel) {
    if (!msgIdOrModel) return null;

    if (typeof window.WWebJS?.resolveMediaBlob === 'function') {
      try {
        const direct = await window.WWebJS.resolveMediaBlob(msgIdOrModel);
        if (direct && direct.blob) {
          return direct;
        }
      } catch (e) {}
    }

    return null;
  }

  // =========================================================================
  // ESTADO GLOBAL DA EXTENSÃO & CRONÔMETRO DE PROCESSAMENTO (v2.9.4)
  // =========================================================================
  let isScanning = false;
  let shouldStopScanning = false;
  let scanMode = 'chat'; // 'chat' | 'gallery'
  let sleepCancelResolver = null;
  let minDateReached = null;
  let currentDateReading = 'Hoje';
  let currentScanRunId = 0;
  let finishReason = 'END_OF_CHAT'; // 'USER_STOPPED' | 'LIMIT_REACHED' | 'DATE_REACHED' | 'END_OF_CHAT' | 'TIMEOUT_STAGNANT' | 'ERROR'

  // Cronômetro de tempo de processamento em tempo real
  let scanStartTime = null;
  let scanTimerInterval = null;

  function formatElapsedTime(totalSeconds) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatElapsedTimeVerbose(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '0 seg';
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins} min`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} seg`);
    return parts.join(' ');
  }

  function startScanTimer() {
    if (scanTimerInterval) clearInterval(scanTimerInterval);
    scanStartTime = Date.now();
    const timerEl = document.getElementById('fac-stat-timer');
    if (timerEl) timerEl.textContent = '00:00';

    scanTimerInterval = setInterval(() => {
      if (!scanStartTime) return;
      const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
      const el = document.getElementById('fac-stat-timer');
      if (el) el.textContent = formatElapsedTime(elapsed);
    }, 1000);
  }

  function stopScanTimer() {
    if (scanTimerInterval) {
      clearInterval(scanTimerInterval);
      scanTimerInterval = null;
    }
    if (scanStartTime) {
      const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
      const el = document.getElementById('fac-stat-timer');
      if (el) el.textContent = formatElapsedTime(elapsed);
      return elapsed;
    }
    return 0;
  }

  // Registro de alertas de álbuns que atingiram o teto de segurança
  const albumCeilingWarnings = [];

  // photoKey -> { key, meta, rawText, isHd, isThumbnail, resolutionCategory, width, height, size, timestamp, cappedAlbum, blob }
  const photoAccumulator = new Map();

  let floatingBtn = null;
  let panel = null;
  let globalStopBar = null;

  // Lote de fotos por arquivo ZIP para garantir download fluido e liberação real de memória
  const MAX_PHOTOS_PER_ZIP_BATCH = 150;
  // Teto seguro de fotos por álbum antes de interromper e emitir alerta (suporta até 400 fotos por grupo/álbum)
  const MAX_ALBUM_PHOTOS = 400;

  // =========================================================================
  // FUNÇÕES AUXILIARES DE FORMATAÇÃO E SANITIZAÇÃO
  // =========================================================================
  function formatDateToYMD(d) {
    if (!d || isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(d) {
    if (!d || isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function sanitizeForFilename(str, fallback = '') {
    if (!str || typeof str !== 'string') return fallback;
    const clean = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase();
    return clean || fallback;
  }

  function interruptibleSleep(ms) {
    return new Promise((resolve) => {
      let timer = null;
      const onWake = () => {
        if (timer) clearTimeout(timer);
        sleepCancelResolver = null;
        resolve();
      };
      timer = setTimeout(onWake, ms);
      sleepCancelResolver = onWake;
    });
  }

  /**
   * Espera condicional limitada por timeout
   */
  async function waitForCondition(predicateFn, options = {}) {
    const timeoutMs = options.timeoutMs || 2500;
    const intervalMs = options.intervalMs || 60;
    const startTime = Date.now();

    while (!shouldStopScanning) {
      try {
        const res = await predicateFn();
        if (res) return res;
      } catch (e) {}

      if (Date.now() - startTime >= timeoutMs) {
        return null;
      }

      await interruptibleSleep(intervalMs);
    }
    return null;
  }

  let lastCapturedPhotoDateStr = 'Nenhuma';
  let oldestCapturedDateObj = null;

  function updateLastPhotoDateDisplay(dateInput) {
    if (!dateInput || dateInput === 'Não identificada' || dateInput === 'SEM_DATA') return;
    
    let dateObj = null;
    let formattedStr = '';

    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
      dateObj = dateInput;
      formattedStr = formatDisplayDate(dateInput);
    } else if (typeof dateInput === 'string') {
      formattedStr = dateInput;
      const parts = dateInput.split('/');
      if (parts.length === 3) {
        dateObj = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
    }

    if (dateObj && !isNaN(dateObj.getTime())) {
      if (!oldestCapturedDateObj || dateObj < oldestCapturedDateObj) {
        oldestCapturedDateObj = dateObj;
        lastCapturedPhotoDateStr = formattedStr || formatDisplayDate(dateObj);
        const statLastDate = document.getElementById('fac-stat-last-photo-date');
        if (statLastDate) {
          statLastDate.textContent = lastCapturedPhotoDateStr;
        }
      }
    } else if (formattedStr && !oldestCapturedDateObj) {
      lastCapturedPhotoDateStr = formattedStr;
      const statLastDate = document.getElementById('fac-stat-last-photo-date');
      if (statLastDate) {
        statLastDate.textContent = lastCapturedPhotoDateStr;
      }
    }
  }

  function triggerStop() {
    console.log('[Conserva_Fotos] Parada imediata solicitada pelo usuário!');
    shouldStopScanning = true;
    finishReason = 'USER_STOPPED';

    if (sleepCancelResolver) {
      sleepCancelResolver();
    }

    dismissUnwantedModals();

    const statusText = document.getElementById('fac-status-text');
    if (statusText) {
      statusText.textContent = `⏹️ Parando varredura... Finalizando pacote com ${photoAccumulator.size} fotos coletadas...`;
    }
    const stopBtn = document.getElementById('fac-btn-stop');
    if (stopBtn) {
      stopBtn.textContent = '⏹️ Finalizando Download... Aguarde...';
      stopBtn.style.opacity = '0.7';
    }
    const floatStopBtn = document.getElementById('fac-floating-stop-btn');
    if (floatStopBtn) {
      floatStopBtn.textContent = '⏹️ Parando e baixando...';
    }
  }

  function triggerCancelWithoutDownload() {
    console.log('[Conserva_Fotos] Cancelamento sem download solicitado pelo usuário!');
    shouldStopScanning = true;
    finishReason = 'USER_CANCELLED_NO_DOWNLOAD';

    if (sleepCancelResolver) {
      sleepCancelResolver();
    }

    stopScanTimer();
    dismissUnwantedModals();
    closeMediaViewer();

    photoAccumulator.clear();
    try { TempBlobStorage.clear(); } catch (e) {}

    const statusText = document.getElementById('fac-status-text');
    if (statusText) {
      statusText.textContent = '⏹️ Varredura cancelada pelo usuário. Nenhum arquivo foi baixado.';
    }

    const runningActions = document.getElementById('fac-running-actions');
    const startBtn = document.getElementById('fac-btn-start-auto');
    const progressFill = document.getElementById('fac-progress-fill');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');

    if (runningActions) runningActions.classList.add('hidden');
    if (startBtn) startBtn.classList.remove('hidden');
    const idleActions = document.getElementById('fac-idle-actions');
    if (idleActions) idleActions.classList.remove('hidden');
    if (progressFill) progressFill.style.width = '0%';
    if (stopCount) stopCount.textContent = '0';
    if (floatingCount) floatingCount.textContent = '0';
    if (statPhotos) statPhotos.textContent = '0';

    isScanning = false;
  }

  function updateLiveDateDisplay(dateText) {
    if (!dateText) return;
    currentDateReading = dateText;

    const floatingDate = document.getElementById('fac-floating-date');
    if (floatingDate) {
      floatingDate.textContent = dateText;
    }

    const statDate = document.getElementById('fac-stat-date');
    if (statDate) {
      statDate.textContent = dateText;
    }
  }

  function dismissErrorDialogs() {
    try {
      const dialogs = document.querySelectorAll('div[role="dialog"], div[data-testid="popup-contents"], div[class*="popup"]');
      for (const d of dialogs) {
        if (d.id === 'fiscalizacampo-panel' || d.closest('#fiscalizacampo-panel') || d.closest('#fac-global-stop-bar')) continue;
        const text = (d.innerText || d.textContent || '').toLowerCase();
        if (
          text.includes('indisponível') ||
          text.includes('não está mais no seu celular') ||
          text.includes('não é possível abrir') ||
          text.includes('download failed') ||
          text.includes('falha ao carregar') ||
          text.includes('arquivo corrompido')
        ) {
          const okBtn = Array.from(d.querySelectorAll('button, div[role="button"]')).find((b) => {
            const bt = (b.innerText || b.textContent || '').trim().toLowerCase();
            return bt === 'ok' || bt.includes('ok') || bt.includes('fechar') || bt.includes('entendi');
          }) || d.querySelector('button, div[role="button"]');

          if (okBtn && okBtn.id !== 'fac-close-btn') {
            try { okBtn.click(); } catch (e) {}
          }
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        }
      }
    } catch (e) {}
  }

  function closeMediaViewer() {
    try {
      const mediaViewers = document.querySelectorAll('div[data-testid="media-viewer"], div[data-testid="lightbox-wrapper"], div[data-testid="popup-media-viewer"]');
      for (const mediaViewer of mediaViewers) {
        if (mediaViewer.id === 'fiscalizacampo-panel' || mediaViewer.closest('#fiscalizacampo-panel')) continue;
        const closeBtn = mediaViewer.querySelector(
          'div[data-testid="media-viewer-close"], span[data-icon="x-viewer"], span[data-icon="x"], button[aria-label*="Fechar" i], div[role="button"][aria-label*="Fechar" i], button[aria-label*="Close" i], div[aria-label*="Close" i], div[data-testid="x-viewer"]'
        );
        if (closeBtn && closeBtn.id !== 'fac-close-btn') {
          try { closeBtn.click(); } catch(e) {}
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      }
    } catch (e) {}
  }

  function dismissUnwantedModals() {
    dismissErrorDialogs();
  }

  // =========================================================================
  // DECODIFICAÇÃO REAL DE IMAGEM E RESOLUÇÃO
  // =========================================================================
  async function getImageDimensionsFromBlob(blob) {
    if (!blob) return { width: 0, height: 0 };
    try {
      if (typeof createImageBitmap === 'function') {
        const bmp = await createImageBitmap(blob);
        const dims = { width: bmp.width, height: bmp.height };
        bmp.close();
        return dims;
      }
    } catch (e) {}

    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  async function fetchBlobDirectly(srcUrl) {
    if (!srcUrl || (!srcUrl.startsWith('blob:') && !srcUrl.startsWith('http') && !srcUrl.startsWith('data:image'))) return null;
    try {
      const res = await fetch(srcUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extração via Canvas oculto para imagens decodificadas no DOM (Zero Dependência de Fetch)
   */
  async function captureImageViaCanvas(img) {
    if (!img) return null;
    try {
      if (!img.complete || !img.naturalWidth) {
        await new Promise((res) => {
          if (img.complete && img.naturalWidth > 0) return res();
          img.onload = () => res();
          img.onerror = () => res();
          setTimeout(res, 1200);
        });
      }
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w === 0 || h === 0) return null;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
      }

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.98);
      });
    } catch (e) {
      return null;
    }
  }

  /**
   * Pipeline de extração imediata com hierarquia resiliente:
   * 1. Resolução Direta WWebJS
   * 2. Blob URL nativo do WhatsApp
   * 3. Canvas offscreen
   */
  async function extractBlobFromImageElement(img, targetMsgId) {
    if (!img) return null;

    // 1. Tenta extração direta via WWebJS se houver ID de mensagem
    if (targetMsgId) {
      try {
        const direct = await requestResolveMedia(targetMsgId);
        if (direct && direct.blob && direct.blob.size >= 400) {
          const dims = await getImageDimensionsFromBlob(direct.blob);
          const isRealHd = dims.width >= 500 || dims.height >= 500 || direct.blob.size >= 35000;
          return {
            blob: direct.blob,
            dims,
            isHd: isRealHd,
            category: isRealHd ? 'Alta Resolução (Dados Diretos WhatsApp)' : 'Média Resolução (WhatsApp)',
            timestamp: direct.timestamp,
          };
        }
      } catch (e) {}
    }

    // 2. Fetch direto da URL Blob (descriptografada pelo React do WhatsApp no DOM)
    const src = img.src || '';
    if (src.startsWith('blob:')) {
      const blob = await fetchBlobDirectly(src);
      if (blob && blob.size >= 400) {
        const dims = await getImageDimensionsFromBlob(blob);
        const isRealHd = dims.width >= 500 || dims.height >= 500 || blob.size >= 35000;
        return {
          blob,
          dims,
          isHd: isRealHd,
          category: isRealHd ? 'Alta Resolução (Blob Decodificado)' : 'Média Resolução (Blob)',
          timestamp: null,
        };
      }
    }

    // 3. Fallback: Captura via Canvas do elemento renderizado
    const canvasBlob = await captureImageViaCanvas(img);
    if (canvasBlob && canvasBlob.size >= 400) {
      const dims = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
      const isRealHd = dims.width >= 500 || dims.height >= 500 || canvasBlob.size >= 35000;
      return {
        blob: canvasBlob,
        dims,
        isHd: isRealHd,
        category: isRealHd ? 'Alta Resolução (Canvas Decodificado)' : 'Média Resolução (Canvas)',
        timestamp: null,
      };
    }

    // 4. Última tentativa: se for URL de dados Base64
    if (src.startsWith('data:image')) {
      const b64Blob = await fetchBlobDirectly(src);
      if (b64Blob && b64Blob.size >= 400) {
        const dims = await getImageDimensionsFromBlob(b64Blob);
        return {
          blob: b64Blob,
          dims,
          isHd: false,
          category: 'Miniatura Base64 (Prévia WhatsApp)',
          timestamp: null,
        };
      }
    }

    return null;
  }

  // =========================================================================
  // INTERFACE FLUTUANTE - CAIXA ÚNICA INTEGRADA
  // =========================================================================
  function initExtensionUI() {
    if (document.getElementById('fiscalizacampo-panel')) return;

    // Painel de Controle Principal (Caixa Única Integrada)
    panel = document.createElement('div');
    panel.id = 'fiscalizacampo-panel';
    panel.className = 'collapsed'; // Inicia como botão/pílula compacta na tela

    const today = new Date();
    const todayStr = formatDateToYMD(today);
    const savedDateLimit = localStorage.getItem('fac_saved_date_limit');
    const defaultStartDate = savedDateLimit || `${today.getFullYear()}-01-01`;
    const savedDateEnd = localStorage.getItem('fac_saved_date_end') || todayStr;
    const savedEmpresa = localStorage.getItem('fac_saved_empresa') || '';
    const savedArea = localStorage.getItem('fac_saved_area') || '';
    const savedEquipe = localStorage.getItem('fac_saved_equipe') || '';
    const savedNamingPattern = localStorage.getItem('fac_saved_naming_pattern') || 'EMPRESA_AREA_DATA_SEQ';
    let savedMaxPhotos = localStorage.getItem('fac_saved_max_photos') || '0';
    if (savedMaxPhotos === '100') {
      savedMaxPhotos = '0';
      localStorage.setItem('fac_saved_max_photos', '0');
    }

    try {
      const savedPos = JSON.parse(localStorage.getItem('fac_panel_pos') || localStorage.getItem('fac_floating_btn_pos') || 'null');
      if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
        const maxLeft = Math.max(10, window.innerWidth - 180);
        const maxTop = Math.max(10, window.innerHeight - 50);
        const left = Math.min(Math.max(10, savedPos.left), maxLeft);
        const top = Math.min(Math.max(10, savedPos.top), maxTop);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } catch (e) {}

    panel.innerHTML = `
      <div class="fac-header" id="fac-panel-header" title="Conserva_Fotos: Clique para abrir/recolher as opções ou arraste para mover na tela">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="fac-drag-handle" title="Arraste para mover na tela">
            <svg width="10" height="14" viewBox="0 0 16 24" fill="currentColor">
              <circle cx="4" cy="5" r="2.2"/><circle cx="12" cy="5" r="2.2"/>
              <circle cx="4" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/>
              <circle cx="4" cy="19" r="2.2"/><circle cx="12" cy="19" r="2.2"/>
            </svg>
          </span>
          <h3 style="margin: 0; display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            <strong style="color: #f59e0b;">Conserva_Fotos</strong>
            <span class="fac-badge-ver">v5.1</span>
          </h3>
        </div>
        <button class="fac-close-btn" id="fac-close-btn" type="button" title="Abrir / Recolher painel" style="margin-left: 8px;">
          <span id="fac-close-icon">▼</span>
        </button>
      </div>

      <div class="fac-body" id="fac-panel-body">
        <div class="fac-group-badge">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
            <span>Conversa / Grupo no WhatsApp:</span>
            <button type="button" id="fac-btn-refresh-group" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; border-radius: 6px; padding: 2px 7px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Clique para ler o nome do grupo aberto no WhatsApp">
              🔄 Ler Grupo
            </button>
          </div>
          <input type="text" id="fac-active-group-name" value="Detectando conversa..." />
        </div>

        <div style="margin-top: 6px; margin-bottom: 6px;">
          <label class="fac-field-label">🏢 Empresa:</label>
          <input type="text" id="fac-empresa" class="fac-input" placeholder="Ex: MENSORI" value="${savedEmpresa}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div class="fac-date-section">
          <div class="fac-date-header">
            <label class="fac-field-label" style="margin: 0; font-weight: 700;">📅 Intervalo de Datas das Fotos:</label>
            <label class="fac-checkbox-label">
              <input type="checkbox" id="fac-date-all" />
              <span>Sem limite inicial</span>
            </label>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
            <div>
              <label class="fac-field-label" style="font-size: 10px; margin-bottom: 2px;">Data Inicial (Mais antiga / Limite):</label>
              <input type="date" id="fac-date-limit" class="fac-input" value="${defaultStartDate}" title="Coletar fotos a partir desta data (limite mais antigo)" />
            </div>
            <div>
              <label class="fac-field-label" style="font-size: 10px; margin-bottom: 2px;">Data Final (Mais recente / Partida):</label>
              <input type="date" id="fac-date-end" class="fac-input" value="${savedDateEnd}" title="Coletar fotos até esta data (mais recente / partida)" />
            </div>
          </div>

          <div id="fac-date-hint" style="font-size: 10.5px; color: #a1a1aa; margin-top: 4px; line-height: 1.3;">
            Coletará fotos no intervalo de datas selecionado.
          </div>

          <div class="fac-quick-buttons">
            <button type="button" class="fac-quick-btn" data-days="0">Hoje</button>
            <button type="button" class="fac-quick-btn" data-days="7">7 dias</button>
            <button type="button" class="fac-quick-btn" data-days="15">15 dias</button>
            <button type="button" class="fac-quick-btn" data-days="30">30 dias</button>
            <button type="button" class="fac-quick-btn" data-preset="jan1">01/Jan</button>
          </div>
        </div>

        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 7px; width: 100%;">
          <div id="fac-idle-actions" style="display: flex; flex-direction: column; gap: 7px; width: 100%;">
            <!-- BOTÃO PRINCIPAL: MODO TUDO AUTOMÁTICO (GRANDE E AMARELO) -->
            <button id="fac-btn-start-auto" type="button" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; text-align: center; font-size: 14.5px; padding: 13px 14px; font-weight: 800; background: linear-gradient(135deg, #facc15 0%, #eab308 55%, #ca8a04 100%); color: #09090b; border: 1px solid #fef08a; border-radius: 9px; cursor: pointer; box-shadow: 0 4px 16px rgba(234, 179, 8, 0.4); transition: transform 0.15s, box-shadow 0.15s; letter-spacing: -0.2px;" title="Executa todo o fluxo de ponta a ponta: sincroniza o chat, posiciona na última foto e realiza a coleta completa">
              <span style="font-size: 17px;">⚡</span>
              <span>MODO TUDO AUTOMÁTICO</span>
            </button>

            <!-- SEÇÃO DE PASSOS MANUAIS (INATIVA NA TELA PARA ECONOMIZAR ESPAÇO) -->
            <div id="fac-manual-steps-section" style="display: none !important;">
              <div style="display: flex; align-items: center; gap: 8px; margin: 2px 0 1px;">
                <div style="flex: 1; height: 1px; background: #3f3f46;"></div>
                <span style="font-size: 10px; color: #71717a; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Ou passos manuais</span>
                <div style="flex: 1; height: 1px; background: #3f3f46;"></div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <button id="fac-btn-sync-history" type="button" style="display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; padding: 8px 4px; font-weight: 700; background: #27272a; border: 1.5px solid #3b82f6; color: #60a5fa; border-radius: 7px; cursor: pointer; transition: all 0.2s;" title="Rola a conversa até a Data Inicial (passado) e depois desce até a Data Final">
                  1. 🔄 Rolar Chat
                </button>
                <button id="fac-btn-start-viewer" type="button" style="display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; padding: 8px 4px; font-weight: 700; background: #143525; border: 1.5px solid #10b981; color: #34d399; border-radius: 7px; cursor: pointer; transition: all 0.2s;" title="Inicia a captura com a foto aberta na tela e a barra horizontal">
                  2. 📸 Coleta Modal
                </button>
              </div>
            </div>
          </div>
          
          <div id="fac-running-actions" class="hidden" style="width: 100%; display: flex; flex-direction: column; gap: 6px;">
            <button id="fac-btn-stop" class="fac-btn-stop" style="width: 100%; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12px; padding: 11px; font-weight: 700;">
              ⏹️ PARAR E BAIXAR AGORA (<span id="fac-stop-count">0</span> fotos)
            </button>
            <button id="fac-btn-cancel-only" type="button" class="fac-btn-cancel" style="width: 100%; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 11px; padding: 8px; font-weight: 700; background: #27272a; border: 1px solid #3f3f46; color: #fb7185; border-radius: 8px; cursor: pointer; transition: all 0.15s;">
              🚫 APENAS PARAR (SEM BAIXAR)
            </button>
          </div>
        </div>

        <div id="fac-live-status-box" class="fac-live-box hidden">
          <div class="fac-live-header">
            <span class="fac-pulsing-dot"></span>
            <strong>LENDO FOTOS NO WHATSAPP</strong>
          </div>
          <div class="fac-stats-grid">
            <div class="fac-stat-card highlight">
              <span class="fac-stat-title">📅 Data Lida</span>
              <span class="fac-stat-date-highlight" id="fac-stat-date">Lendo...</span>
            </div>
            <div class="fac-stat-card highlight" style="border-color: rgba(52, 211, 153, 0.4);">
              <span class="fac-stat-title">🖼️ Última Foto</span>
              <span class="fac-stat-date-highlight" id="fac-stat-last-photo-date" style="color: #34d399;">Nenhuma</span>
            </div>
            <div class="fac-stat-card">
              <span class="fac-stat-title">📸 Fotos</span>
              <span class="fac-stat-val" id="fac-stat-photos">0</span>
            </div>
            <div class="fac-stat-card">
              <span class="fac-stat-title">⏱️ Tempo</span>
              <span class="fac-stat-val" id="fac-stat-timer" style="color: #fbbf24;">00:00</span>
            </div>
          </div>
          <div class="fac-progress-bar">
            <div id="fac-progress-fill" class="fac-progress-fill"></div>
          </div>
          <div id="fac-status-text" class="fac-status-text">Iniciando...</div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // =========================================================================
    // ARRASTE E CLIQUE DA CAIXA ÚNICA
    // =========================================================================
    const panelHeader = panel.querySelector('#fac-panel-header');
    if (panelHeader) {
      let isDragging = false;
      let hasDragged = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      const onPointerDown = (e) => {
        if (e.target.closest('#fac-close-btn') || (e.button !== undefined && e.button !== 0)) return;
        isDragging = true;
        hasDragged = false;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        initialLeft = rect.left;
        initialTop = rect.top;

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
        const currentY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        const dx = currentX - startX;
        const dy = currentY - startY;

        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          hasDragged = true;
        }

        const maxL = Math.max(8, window.innerWidth - (panel.classList.contains('collapsed') ? 180 : 340));
        const maxT = Math.max(8, window.innerHeight - 50);
        const newLeft = Math.max(8, Math.min(maxL, initialLeft + dx));
        const newTop = Math.max(8, Math.min(maxT, initialTop + dy));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);

        if (hasDragged) {
          const rect = panel.getBoundingClientRect();
          try {
            localStorage.setItem('fac_panel_pos', JSON.stringify({ top: rect.top, left: rect.left }));
          } catch (e) {}
        }
      };

      panelHeader.addEventListener('pointerdown', onPointerDown);

      // Clique no cabeçalho: se não arrastou, abre ou recolhe o painel diretamente abaixo
      panelHeader.addEventListener('click', (e) => {
        if (hasDragged) {
          hasDragged = false;
          return;
        }
        if (e.target.closest('#fac-close-btn')) return; // tratado pelo botão de fechar
        toggleExtensionPanel();
      });
    }

    const closeBtn = panel.querySelector('#fac-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExtensionPanel();
      });
    }

    const empresaInput = panel.querySelector('#fac-empresa');

    if (empresaInput) {
      empresaInput.addEventListener('input', () => {
        localStorage.setItem('fac_saved_empresa', empresaInput.value);
      });
    }

    const refreshGroupBtn = panel.querySelector('#fac-btn-refresh-group');
    if (refreshGroupBtn) {
      const handleReadGroup = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        const groupInput = document.getElementById('fac-active-group-name');
        const detected = getActiveGroupName();
        if (groupInput) {
          groupInput.value = detected;
          groupInput.dispatchEvent(new Event('input', { bubbles: true }));
          groupInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        refreshGroupBtn.textContent = '✅ Copiado!';
        setTimeout(() => {
          refreshGroupBtn.textContent = '🔄 Ler Grupo';
        }, 1500);
      };

      refreshGroupBtn.addEventListener('click', handleReadGroup);
      refreshGroupBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    const dateLimitInput = panel.querySelector('#fac-date-limit');
    const dateEndInput = panel.querySelector('#fac-date-end');
    const dateAllCheck = panel.querySelector('#fac-date-all');
    const dateHint = panel.querySelector('#fac-date-hint');

    dateAllCheck.addEventListener('change', () => {
      if (dateAllCheck.checked) {
        dateLimitInput.disabled = true;
        dateLimitInput.style.opacity = '0.4';
        if (dateHint) dateHint.textContent = 'Buscando sem limite inicial de data (até o início do histórico).';
      } else {
        dateLimitInput.disabled = false;
        dateLimitInput.style.opacity = '1';
        if (dateHint) dateHint.textContent = 'Coletará fotos no intervalo entre a Data Inicial e Data Final.';
      }
    });

    dateLimitInput.addEventListener('change', () => {
      localStorage.setItem('fac_saved_date_limit', dateLimitInput.value);
    });

    if (dateEndInput) {
      dateEndInput.addEventListener('change', () => {
        localStorage.setItem('fac_saved_date_end', dateEndInput.value);
      });
    }

    panel.querySelectorAll('.fac-quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const days = btn.getAttribute('data-days');
        const preset = btn.getAttribute('data-preset');

        dateAllCheck.checked = false;
        dateLimitInput.disabled = false;
        dateLimitInput.style.opacity = '1';

        const now = new Date();
        if (dateEndInput) {
          dateEndInput.value = formatDateToYMD(now);
          localStorage.setItem('fac_saved_date_end', dateEndInput.value);
        }

        const d = new Date();
        if (preset === 'jan1') {
          d.setMonth(0, 1);
        } else if (days !== null) {
          d.setDate(d.getDate() - parseInt(days, 10));
        }

        dateLimitInput.value = formatDateToYMD(d);
        localStorage.setItem('fac_saved_date_limit', dateLimitInput.value);
        if (dateHint) {
          dateHint.textContent = `Buscando de ${formatDisplayDate(d)} até ${formatDisplayDate(now)}.`;
        }
      });
    });

    // BOTÃO ETAPA 1: Rolar e Sincronizar Histórico
    const syncHistoryBtn = panel.querySelector('#fac-btn-sync-history');
    if (syncHistoryBtn) {
      syncHistoryBtn.addEventListener('click', () => {
        runSyncHistoryWorkflow();
      });
    }

    // BOTÃO ETAPA 2: Coleta Direta no Modal
    const startViewerBtn = panel.querySelector('#fac-btn-start-viewer');
    if (startViewerBtn) {
      startViewerBtn.addEventListener('click', () => {
        runCaptureOnlyWorkflow();
      });
    }

    // BOTÃO MODO TUDO AUTOMÁTICO
    const startAutoBtn = panel.querySelector('#fac-btn-start-auto');
    if (startAutoBtn) {
      startAutoBtn.addEventListener('click', () => {
        scanMode = 'viewer';
        startScanWorkflow();
      });
    }

    // Botões de Parar e Cancelar
    panel.querySelector('#fac-btn-stop').addEventListener('click', triggerStop);
    const cancelOnlyBtn = panel.querySelector('#fac-btn-cancel-only');
    if (cancelOnlyBtn) {
      cancelOnlyBtn.addEventListener('click', triggerCancelWithoutDownload);
    }
  }

  function getActiveGroupName() {
    function isBadCandidate(str) {
      if (!str || typeof str !== 'string') return true;
      const lower = str.toLowerCase().trim();
      return (
        lower.length < 2 ||
        lower.includes('atualizações') ||
        lower.includes('status') ||
        lower.includes('canais') ||
        lower.includes('comunidade') ||
        lower.includes('chamada') ||
        lower.includes('pesquisar') ||
        lower.includes('anexar') ||
        lower.includes('menu') ||
        lower.includes('silenciar') ||
        lower.includes('dados do grupo') ||
        lower.includes('dados do contato') ||
        lower.includes('visto por último') ||
        lower.includes('online') ||
        lower.includes('digitando') ||
        lower.includes('gravando') ||
        lower.includes('mensagens temporárias') ||
        lower.includes('clique para') ||
        lower.includes('toque para') ||
        lower === 'whatsapp' ||
        lower === 'hoje' ||
        lower === 'ontem'
      );
    }

    function isMemberList(str) {
      if (!str) return false;
      const commas = (str.match(/,/g) || []).length;
      if (commas >= 2) return true;
      if (commas >= 1 && (str.includes('+55') || str.includes('Coord') || str.includes('Eng°') || str.includes('você') || str.includes('Você'))) return true;
      if (str.includes('+55') && str.length > 20) return true;
      return false;
    }

    // 1. PRIORIDADE MÁXIMA: Cabeçalho da conversa aberta (#main header)
    const mainHeader = document.querySelector('#main header, div[data-testid="conversation-header"]');
    if (mainHeader) {
      // Localiza especificamente o primeiro título de texto dentro do botão de informações do chat
      const titleSelectors = [
        '#main header [data-testid="conversation-info-header"] span[title]',
        '#main header [data-testid="conversation-info-header"] span[dir="auto"]',
        '#main header div[role="button"] span[title]',
        '#main header div[role="button"] span[dir="auto"]',
        '#main header h2 span',
        '#main header h2',
        '#main header span[title]',
      ];

      for (const sel of titleSelectors) {
        const elements = Array.from(mainHeader.querySelectorAll(sel));
        for (const el of elements) {
          if (el.closest('#fiscalizacampo-panel') || el.closest('#fac-global-stop-bar') || el.closest('#fiscalizacampo-floating-btn')) continue;
          if (el.closest('button:not([role="button"]), [data-testid="menu"], [data-testid="search"], [data-testid="voice-call"]')) continue;

          const raw = (el.getAttribute('title') || el.innerText || el.textContent || '').trim();
          const firstLine = raw.split('\n')[0].trim();
          if (firstLine && !isBadCandidate(firstLine) && !isMemberList(firstLine)) {
            return firstLine;
          }
        }
      }

      // Varredura geométrica nos elementos de texto do cabeçalho
      const candidateList = [];
      const allSpans = Array.from(mainHeader.querySelectorAll('span, div, h2, h3'));
      for (const s of allSpans) {
        if (s.closest('#fiscalizacampo-panel') || s.closest('#fac-global-stop-bar') || s.closest('#fiscalizacampo-floating-btn')) continue;
        if (s.closest('button:not([role="button"]), [data-testid="menu"], [data-testid="search"], [data-testid="voice-call"], [data-testid="chat-avatar"]')) continue;

        const raw = (s.getAttribute('title') || (s.children.length === 0 ? s.innerText || s.textContent : '')).trim();
        if (!raw || isBadCandidate(raw)) continue;

        const firstLine = raw.split('\n')[0].trim();
        if (!firstLine || isBadCandidate(firstLine)) continue;

        const rect = s.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const isMem = isMemberList(firstLine);
        const style = window.getComputedStyle(s);
        const fontSize = parseFloat(style.fontSize) || 14;

        candidateList.push({
          text: firstLine,
          top: rect.top,
          fontSize,
          isMem,
        });
      }

      if (candidateList.length > 0) {
        // Prioriza não-membros, maior tamanho de fonte e linha do topo
        candidateList.sort((a, b) => {
          if (a.isMem !== b.isMem) return a.isMem ? 1 : -1;
          if (Math.abs(b.fontSize - a.fontSize) > 1) return b.fontSize - a.fontSize;
          return a.top - b.top;
        });

        if (!candidateList[0].isMem) {
          return candidateList[0].text;
        }
      }
    }

    // 2. Modelo de dados interno oficial do WhatsApp (WWebJS / Store)
    try {
      const waCollections = getWAWebModule('WAWebCollections') || window.Store;
      const activeChat = waCollections?.Chat?.getActive ? waCollections.Chat.getActive() : waCollections?.Chat?.models?.find((c) => c.active);
      const internalName = activeChat?.name || activeChat?.formattedTitle || activeChat?.contact?.name || activeChat?.contact?.pushname;
      if (internalName && typeof internalName === 'string' && !isBadCandidate(internalName) && !isMemberList(internalName)) {
        return internalName.trim();
      }
    } catch (e) {}

    // 3. Título limpo da aba do navegador (document.title)
    if (document.title && !document.title.toLowerCase().startsWith('whatsapp')) {
      const cleanDocTitle = document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*\|\s*WhatsApp$/i, '').trim();
      if (cleanDocTitle && !isBadCandidate(cleanDocTitle) && !isMemberList(cleanDocTitle)) {
        return cleanDocTitle;
      }
    }

    // 4. Item da lista lateral com conversa ativa estrita (excluindo cabeçalhos e status)
    try {
      const activeSidebarItem = document.querySelector(
        '#pane-side div[aria-selected="true"]:not([data-testid="status-v3-header"]), #pane-side div[data-testid="cell-frame-container"].selected, #pane-side div[role="listitem"][aria-selected="true"]'
      );
      if (activeSidebarItem) {
        const titleEl = activeSidebarItem.querySelector('span[title], span[dir="auto"], span._ao3e');
        if (titleEl) {
          const raw = (titleEl.getAttribute('title') || titleEl.innerText || titleEl.textContent || '').trim();
          const line = raw.split('\n')[0].trim();
          if (line && !isBadCandidate(line) && !isMemberList(line)) {
            return line;
          }
        }
      }
    } catch (e) {}

    return 'Conversa_WhatsApp';
  }

  function dispatchFullClick(el) {
    if (!el) return;
    try {
      const opts = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      if (typeof el.click === 'function') {
        el.click();
      }
    } catch (e) {
      try { el.click(); } catch (err) {}
    }
  }

  function dispatchArrowLeft() {
    const opts = { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, which: 37, bubbles: true, cancelable: true, view: window };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
    window.dispatchEvent(new KeyboardEvent('keyup', opts));
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (document.activeElement && document.activeElement !== document.body) {
      try {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', opts));
        document.activeElement.dispatchEvent(new KeyboardEvent('keyup', opts));
      } catch (e) {}
    }
  }

  function dispatchArrowRight() {
    const opts = { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, which: 39, bubbles: true, cancelable: true, view: window };
    window.dispatchEvent(new KeyboardEvent('keydown', opts));
    window.dispatchEvent(new KeyboardEvent('keyup', opts));
    document.dispatchEvent(new KeyboardEvent('keydown', opts));
    document.dispatchEvent(new KeyboardEvent('keyup', opts));
    if (document.activeElement && document.activeElement !== document.body) {
      try {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', opts));
        document.activeElement.dispatchEvent(new KeyboardEvent('keyup', opts));
      } catch (e) {}
    }
  }

  function updateActiveGroupName() {
    const input = document.getElementById('fac-active-group-name');
    if (input && (input.value === 'Detectando conversa...' || input.value === 'Conversa_WhatsApp')) {
      input.value = getActiveGroupName();
    }
  }

  function getPrefixesList() {
    return ['BSO', 'SER', 'CON', 'PAV', 'ROC', 'DRE', 'CAP', 'TAP', 'OAE'];
  }

  function findScrollContainer() {
    const main = document.querySelector('#main');
    if (!main) return null;

    const candidates = [
      document.querySelector('div[data-testid="conversation-panel-messages"]'),
      document.querySelector('#main div[data-tab="8"]'),
      document.querySelector('div[data-tab="8"]'),
      document.querySelector('#main [role="region"]'),
      document.querySelector('#main div[tabindex="-1"]'),
      document.querySelector('#main .copyable-area > div[tabindex="0"]'),
      document.querySelector('#main div[class*="copyable-area"]'),
    ];

    for (const c of candidates) {
      if (c && c.scrollHeight > c.clientHeight + 20) {
        if (c.querySelector('.message-in, .message-out, div[role="row"], div[data-testid^="msg-"], div[data-id]')) {
          return c;
        }
      }
    }

    const allDivs = main.querySelectorAll('div');
    for (const div of allDivs) {
      try {
        const style = window.getComputedStyle(div);
        if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && div.scrollHeight > div.clientHeight + 20) {
          if (div.querySelector('.message-in, .message-out, div[role="row"], div[data-testid^="msg-"], div[data-id]')) {
            return div;
          }
        }
      } catch (e) {}
    }

    return main;
  }

  function findGalleryScrollContainer() {
    const rightDrawer = document.querySelector('div[data-testid="chat-info-drawer"], [role="region"], div[tabindex="-1"]');
    if (rightDrawer) {
      const scrollables = Array.from(rightDrawer.querySelectorAll('div')).filter((div) => {
        const style = window.getComputedStyle(div);
        return (style.overflowY === 'scroll' || style.overflowY === 'auto') && div.scrollHeight > div.clientHeight + 40;
      });
      const withImg = scrollables.find((s) => s.querySelector('img'));
      if (withImg) return withImg;
    }

    const allScrollables = Array.from(document.querySelectorAll('div')).filter((div) => {
      const style = window.getComputedStyle(div);
      return (style.overflowY === 'scroll' || style.overflowY === 'auto') && div.scrollHeight > div.clientHeight + 80 && div.querySelectorAll('img').length > 3;
    });

    return allScrollables[0] || null;
  }

  function clickOlderMessagesBanner() {
    const main = document.querySelector('#main');
    if (!main) return false;

    // Padrão estrito de rolagem de histórico - NUNCA clica em links de comunidades ou convites
    const pattern = /mensagens\s+mais\s+antigas|carregar\s+mais\s+mensagens|mensagens\s+anteriores|load\s+older\s+messages|sincronizar\s+mais\s+mensagens|pesquisar\s+no\s+servidor/i;

    const clickables = Array.from(main.querySelectorAll('button, div[role="button"], span[role="button"]'));
    for (const el of clickables) {
      if (el.closest('#fiscalizacampo-panel') || el.closest('#fiscalizacampo-floating-btn')) continue;
      // Exclui estritamente anúncios de comunidade, links de membros ou avisos de grupo
      if (el.closest('div[class*="community"], div[class*="announcement"], div[aria-label*="comunidade" i]')) continue;

      const text = (el.innerText || el.textContent || '').trim();
      if (/comunidade|community|grupo|participar|entrar|canal|ver\s+todos/i.test(text)) continue;

      if (pattern.test(text)) {
        el.click();
        return true;
      }
    }
    return false;
  }

  const monthsMap = {
    janeiro: 0, jan: 0,
    fevereiro: 1, fev: 1,
    março: 2, marco: 2, mar: 2,
    abril: 3, abr: 3,
    maio: 4, mai: 4,
    junho: 5, jun: 5,
    julho: 6, jul: 6,
    agosto: 7, ago: 7,
    setembro: 8, set: 8,
    outubro: 9, out: 9,
    novembro: 10, nov: 10,
    dezembro: 11, dez: 11
  };

  const weekdaysMap = {
    'domingo': 0, 'sunday': 0,
    'segunda-feira': 1, 'segunda': 1, 'monday': 1,
    'terça-feira': 2, 'terca-feira': 2, 'terça': 2, 'terca': 2, 'tuesday': 2,
    'quarta-feira': 3, 'quarta': 3, 'wednesday': 3,
    'quinta-feira': 4, 'quinta': 4, 'thursday': 4,
    'sexta-feira': 5, 'sexta': 5, 'friday': 5,
    'sábado': 6, 'sabado': 6, 'saturday': 6,
  };

  function getDateForWeekday(targetDayIndex) {
    const now = new Date();
    const currentDayIndex = now.getDay();
    let diff = currentDayIndex - targetDayIndex;
    if (diff <= 0) {
      diff += 7;
    }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 12, 0, 0);
  }

  /**
   * Analisa estritamente textos de divisores de data do WhatsApp
   * (NUNCA chamado em frases longas ou no corpo de conversas)
   */
  function parseDateDividerText(text) {
    if (!text) return null;
    const str = text.trim().toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (str.length < 3 || str.length > 40) return null;

    if (str === 'hoje' || str === 'today') {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    }

    if (str === 'ontem' || str === 'yesterday') {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    }

    if (weekdaysMap.hasOwnProperty(str)) {
      return getDateForWeekday(weekdaysMap[str]);
    }

    const writtenMatch = str.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})$/i);
    if (writtenMatch) {
      const day = parseInt(writtenMatch[1], 10);
      const mName = writtenMatch[2].replace('.', '');
      const month = monthsMap[mName];
      const year = parseInt(writtenMatch[3], 10);
      if (month !== undefined && !isNaN(day) && !isNaN(year) && year >= 2020 && year <= 2035) {
        return new Date(year, month, day, 12, 0, 0);
      }
    }

    const writtenNoYearMatch = str.match(/^(\d{1,2})\s+de\s+([a-zç]+)\.?$/i);
    if (writtenNoYearMatch) {
      const day = parseInt(writtenNoYearMatch[1], 10);
      const mName = writtenNoYearMatch[2].replace('.', '');
      const month = monthsMap[mName];
      if (month !== undefined && !isNaN(day)) {
        const now = new Date();
        let year = now.getFullYear();
        if (month > now.getMonth()) {
          year -= 1;
        }
        return new Date(year, month, day, 12, 0, 0);
      }
    }

    const slashMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
    if (slashMatch) {
      let day = parseInt(slashMatch[1], 10);
      let month = parseInt(slashMatch[2], 10) - 1;
      let rawYear = parseInt(slashMatch[3], 10);
      let year = slashMatch[3].length === 2 ? 2000 + rawYear : rawYear;

      if (month > 11 && day <= 12) {
        const temp = day - 1;
        day = month + 1;
        month = temp;
      }

      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
        return new Date(year, month, day, 12, 0, 0);
      }
    }

    return null;
  }

  /**
   * Extrai a data exata embutida no atributo nativo do WhatsApp [HH:MM, DD/MM/AAAA]
   */
  function extractDateFromPrePlainText(pre) {
    if (!pre) return null;
    const str = pre.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    const bracketMatch = str.match(/\[(?:.*?,?\s*)?(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:.*?)?\]/);
    if (bracketMatch) {
      let p1 = parseInt(bracketMatch[1], 10);
      let p2 = parseInt(bracketMatch[2], 10);
      let yr = parseInt(bracketMatch[3], 10);
      if (yr < 100) yr += 2000;

      let day = p1;
      let month = p2 - 1;

      if (p2 > 12 && p1 <= 12) {
        day = p2;
        month = p1 - 1;
      }

      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && yr >= 2020 && yr <= 2035) {
        return new Date(yr, month, day, 12, 0, 0);
      }
    }

    const writtenMatch = str.match(/\[(?:.*?,?\s*)?(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})(?:.*?)?\]/i);
    if (writtenMatch) {
      const day = parseInt(writtenMatch[1], 10);
      const mName = writtenMatch[2].replace('.', '').toLowerCase();
      const month = monthsMap[mName];
      const yr = parseInt(writtenMatch[3], 10);
      if (month !== undefined && !isNaN(day) && !isNaN(yr) && yr >= 2020 && yr <= 2035) {
        return new Date(yr, month, day, 12, 0, 0);
      }
    }

    return null;
  }

  /**
   * Analisa datas no cabeçalho do visualizador de mídia do WhatsApp Web (ex: "Nerias\n14/09/2026 às 17:19")
   */
  function parseViewerHeaderDate(text) {
    if (!text) return null;
    const str = text.replace(/[\u200B-\u200D\uFEFF]/g, ' ').trim();

    // 1. Padrão estrito de data do WhatsApp: DD/MM/AAAA ou DD/MM/AA (ex: "14/09/2026 às 17:19" ou "14/09/26")
    const matchSlash = str.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (matchSlash) {
      const day = parseInt(matchSlash[1], 10);
      const month = parseInt(matchSlash[2], 10) - 1;
      let year = parseInt(matchSlash[3], 10);
      if (year < 100) year += 2000;
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
        return new Date(year, month, day, 12, 0, 0);
      }
    }

    // 2. "Hoje às ..." ou "Hoje, ..."
    if (/\bhoje\b/i.test(str)) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
    }

    // 3. "Ontem às ..." ou "Ontem, ..."
    if (/\bontem\b/i.test(str)) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
    }

    // 4. "14 de setembro de 2026"
    const writtenMatch = str.match(/(\d{1,2})\s+de\s+([a-zç]+)\.?\s+de\s+(\d{4})/i);
    if (writtenMatch) {
      const day = parseInt(writtenMatch[1], 10);
      const mStr = writtenMatch[2].toLowerCase();
      const year = parseInt(writtenMatch[3], 10);
      if (monthsMap.hasOwnProperty(mStr) && year >= 2020 && year <= 2035) {
        return new Date(year, monthsMap[mStr], day, 12, 0, 0);
      }
    }

    // 5. Dia da semana oficial do WhatsApp (ex: "segunda-feira às 14:20")
    for (const [wName, wIdx] of Object.entries(weekdaysMap)) {
      const regex = new RegExp(`\\b${wName}\\b`, 'i');
      if (regex.test(str)) {
        return getDateForWeekday(wIdx);
      }
    }

    return null;
  }

  /**
   * Extrai a data e o remetente estritamente do cabeçalho nativo do visualizador de fotos do WhatsApp
   * (NUNCA lê elementos do painel da extensão, garantindo precisão absoluta)
   */
  function getStrictViewerDateAndAuthor(mediaViewer) {
    if (!mediaViewer) return { date: null, author: '', rawHeader: '' };

    const headerCandidates = [
      mediaViewer.querySelector('header'),
      mediaViewer.querySelector('div[data-testid="media-viewer-header"]'),
      document.querySelector('div[data-testid="media-viewer"] header'),
      document.querySelector('div[data-testid="lightbox-wrapper"] header'),
      document.querySelector('div[data-testid="popup-media-viewer"] header'),
    ].filter(Boolean);

    for (const h of headerCandidates) {
      if (h.closest('#fiscalizacampo-panel') || h.closest('#fac-global-stop-bar') || h.closest('#fiscalizacampo-floating-btn')) continue;
      const text = (h.innerText || '').trim();
      const date = parseViewerHeaderDate(text);
      if (date) {
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        const author = lines.length > 1 ? lines[0] : '';
        return { date, author, rawHeader: text };
      }
    }

    // Busca secundária nas spans do topo esquerdo da tela (excluindo extensão)
    const topSpans = Array.from(document.querySelectorAll('span, div')).filter((el) => {
      if (el.closest('#fiscalizacampo-panel') || el.closest('#fac-global-stop-bar') || el.closest('#fiscalizacampo-floating-btn')) return false;
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.top <= 80 && rect.left >= 0 && rect.left <= 420 && el.children.length === 0;
    });

    for (const span of topSpans) {
      const txt = (span.innerText || span.textContent || '').trim();
      const date = parseViewerHeaderDate(txt);
      if (date) {
        return { date, author: '', rawHeader: txt };
      }
    }

    return { date: null, author: '', rawHeader: '' };
  }

  /**
   * Localiza o divisor de data real do chat que antecede a bolha de mensagem no DOM
   */
  function getPrecedingDateDivider(bubbleEl) {
    const mainChat = document.querySelector('#main');
    if (!mainChat || !bubbleEl) return null;

    const candidates = Array.from(
      mainChat.querySelectorAll(
        'div[data-testid="chat-history-date-divider"], div[data-testid="date-badge"], span[data-testid="date-badge"], ' +
        'div[role="heading"], div[class*="date-divider"], div[class*="date-badge"], div[class*="_amlo"], div[class*="_ao3e"]'
      )
    );

    let nearestPrecedingDate = null;

    for (const c of candidates) {
      // Divisores reais nunca ficam dentro de bolhas de mensagens
      if (c.closest('.message-in, .message-out, div[data-testid^="msg-"]')) continue;

      const txt = (c.innerText || c.textContent || '').trim();
      const parsed = parseDateDividerText(txt);
      if (!parsed) continue;

      const pos = c.compareDocumentPosition(bubbleEl);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        nearestPrecedingDate = parsed;
      }
    }

    return nearestPrecedingDate;
  }

  function extractDateFromBubbleAndDOM(bubbleEl, text) {
    if (bubbleEl) {
      // 1. data-pre-plain-text diretamente no elemento ou ancestrais próximos
      let curr = bubbleEl;
      for (let i = 0; i < 6 && curr; i++) {
        const pre = curr.getAttribute('data-pre-plain-text');
        if (pre) {
          const parsed = extractDateFromPrePlainText(pre);
          if (parsed) return parsed;
        }
        curr = curr.parentElement;
      }

      // 2. data-pre-plain-text em elemento filho
      const childWithPre = bubbleEl.querySelector('[data-pre-plain-text]');
      if (childWithPre) {
        const parsed = extractDateFromPrePlainText(childWithPre.getAttribute('data-pre-plain-text'));
        if (parsed) return parsed;
      }

      // 3. Checa mensagens irmãs adjacentes imediatas (mesmo pacote/bloco de envio)
      let prevSibling = bubbleEl.previousElementSibling;
      for (let i = 0; i < 3 && prevSibling; i++) {
        const siblingPre = prevSibling.getAttribute('data-pre-plain-text') || prevSibling.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text');
        if (siblingPre) {
          const parsed = extractDateFromPrePlainText(siblingPre);
          if (parsed) return parsed;
        }
        prevSibling = prevSibling.previousElementSibling;
      }

      // 4. Divisor de data real que precede a mensagem no histórico do WhatsApp
      const dividerDate = getPrecedingDateDivider(bubbleEl);
      if (dividerDate) return dividerDate;
    }

    // 5. Se houver data explícita formatada em DD/MM/AAAA no texto da legenda
    if (text) {
      const explicitDateMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
      if (explicitDateMatch) {
        let d = parseInt(explicitDateMatch[1], 10);
        let mo = parseInt(explicitDateMatch[2], 10) - 1;
        let yr = parseInt(explicitDateMatch[3], 10);
        if (yr < 100) yr += 2000;
        if (mo >= 0 && mo <= 11 && d >= 1 && d <= 31 && yr >= 2020 && yr <= 2035) {
          return new Date(yr, mo, d, 12, 0, 0);
        }
      }
    }

    return null;
  }

  function findEarliestVisibleDate() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return null;

    let earliestFound = null;

    // 1. Divisores reais visíveis no chat
    const realBadges = Array.from(
      mainChat.querySelectorAll(
        'div[data-testid="chat-history-date-divider"], div[data-testid="date-badge"], span[data-testid="date-badge"], ' +
        'div[role="heading"], div[class*="date-divider"], div[class*="date-badge"]'
      )
    );

    for (const badge of realBadges) {
      if (badge.closest('.message-in, .message-out, div[data-testid^="msg-"]')) continue;
      const txt = (badge.innerText || badge.textContent || '').trim();
      const d = parseDateDividerText(txt);
      if (d && (!earliestFound || d < earliestFound)) {
        earliestFound = d;
      }
    }

    // 2. Mensagens do topo visível com data-pre-plain-text
    const messages = Array.from(mainChat.querySelectorAll('.message-in, .message-out, div[data-testid^="msg-"]'));
    const topMessages = messages
      .map((el) => ({ el, top: el.getBoundingClientRect().top }))
      .filter((item) => item.top >= -200 && item.top < 600)
      .sort((a, b) => a.top - b.top)
      .slice(0, 20);

    for (const { el } of topMessages) {
      const pre = el.getAttribute('data-pre-plain-text') || el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text');
      if (pre) {
        const d = extractDateFromPrePlainText(pre);
        if (d && (!earliestFound || d < earliestFound)) {
          earliestFound = d;
        }
      }
    }

    return earliestFound;
  }

  function findLatestVisibleDate() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return null;

    let latestFound = null;

    // 1. Divisores reais visíveis no chat
    const realBadges = Array.from(
      mainChat.querySelectorAll(
        'div[data-testid="chat-history-date-divider"], div[data-testid="date-badge"], span[data-testid="date-badge"], ' +
        'div[role="heading"], div[class*="date-divider"], div[class*="date-badge"]'
      )
    );

    for (const badge of realBadges) {
      if (badge.closest('.message-in, .message-out, div[data-testid^="msg-"]')) continue;
      const txt = (badge.innerText || badge.textContent || '').trim();
      const d = parseDateDividerText(txt);
      if (d && (!latestFound || d > latestFound)) {
        latestFound = d;
      }
    }

    // 2. Mensagens da parte inferior com data-pre-plain-text
    const messages = Array.from(mainChat.querySelectorAll('.message-in, .message-out, div[data-testid^="msg-"]'));
    const bottomMessages = messages.slice(-25);

    for (const el of bottomMessages) {
      const pre = el.getAttribute('data-pre-plain-text') || el.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text');
      if (pre) {
        const d = extractDateFromPrePlainText(pre);
        if (d && (!latestFound || d > latestFound)) {
          latestFound = d;
        }
      }
    }

    return latestFound;
  }

  function extractMetadataFromText(text, bubbleEl, prefixes) {
    let item = 'GERAL';
    let km = '';
    let rodovia = '';
    let empresa = '';
    let equipe = '';
    let areaFrente = '';

    for (const p of prefixes) {
      const regexNum = new RegExp(`\\b(${p})[\\s\\-_]*0*(\\d+)`, 'i');
      const m = text.match(regexNum);
      if (m) {
        const num = parseInt(m[2], 10);
        item = `${m[1].toUpperCase()}${String(num).padStart(2, '0')}`;
        areaFrente = item;
        break;
      }
      const regexWord = new RegExp(`\\b(${p})\\b`, 'i');
      if (regexWord.test(text)) {
        item = p.toUpperCase();
        areaFrente = item;
        break;
      }
    }

    const kmMatch = text.match(/km\s*(\d+[\d.,]*\+?\d*)/i);
    if (kmMatch) km = kmMatch[0].toUpperCase();

    const rodMatch = text.match(/\b(SP|BR|MG|RJ|PR|SC|RS)[\s\-]?\d{2,3}\b/i);
    if (rodMatch) rodovia = rodMatch[0].toUpperCase().replace(/\s+/, '-');

    const empMatch = text.match(/(?:empresa|empreiteira|contratada)[:\s]+([^\n,]+)/i);
    if (empMatch) empresa = empMatch[1].trim();

    const eqMatch = text.match(/(?:equipe|turma|frente)[:\s]+([^\n,]+)/i);
    if (eqMatch) equipe = eqMatch[1].trim();

    const detectedDate = extractDateFromBubbleAndDOM(bubbleEl, text);

    let dateKey = '';
    let dateStr = '';

    if (detectedDate) {
      const yyyy = detectedDate.getFullYear();
      const mm = String(detectedDate.getMonth() + 1).padStart(2, '0');
      const dd = String(detectedDate.getDate()).padStart(2, '0');
      dateKey = `${yyyy}${mm}${dd}`;
      dateStr = `${dd}/${mm}/${yyyy}`;
    }

    return {
      item,
      areaFrente: areaFrente || 'GERAL',
      km,
      rodovia,
      empresa,
      equipe,
      dateKey,
      dateStr,
      dateObj: detectedDate,
    };
  }

  function triggerMediaDownloads() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return 0;

    const downloadCandidates = Array.from(
      mainChat.querySelectorAll(
        'button[aria-label*="Baixar" i], button[aria-label*="Download" i], button[aria-label*="Descargar" i], ' +
        'div[role="button"][aria-label*="Baixar" i], div[role="button"][aria-label*="Download" i], ' +
        'div[data-testid="media-download-button"], button[data-testid="download-button"], button[data-testid="button-download"], ' +
        'span[data-icon="download"], span[data-icon="arrow-down"], span[data-icon="refresh-large"]'
      )
    );

    let triggered = 0;
    for (const btn of downloadCandidates) {
      if (btn.id === 'fac-close-btn' || btn.closest('#fiscalizacampo-panel') || btn.closest('#fac-global-stop-bar')) continue;

      const clickable = btn.tagName === 'SPAN' ? btn.closest('button, div[role="button"]') || btn : btn;
      const attrKey = `data-fac-dl-${currentScanRunId}`;
      if (clickable && !clickable.hasAttribute(attrKey)) {
        clickable.setAttribute(attrKey, 'true');
        try {
          clickable.click();
          triggered++;
        } catch (e) {}
      }
    }
    return triggered;
  }

  /**
   * Captura foto com resolução máxima abrindo o visualizador nativo se necessário
   */
  async function captureRealHdFromViewer(imgOrClickable) {
    if (!imgOrClickable || shouldStopScanning) return null;
    try {
      imgOrClickable.click();

      const viewerImg = await waitForCondition(() => {
        const viewer = document.querySelector('div[data-testid="media-viewer"], div[data-testid="lightbox-wrapper"]');
        if (!viewer) return null;
        const img = viewer.querySelector('img[src^="blob:"]') || viewer.querySelector('img[src]');
        if (img && img.src && img.complete && (img.naturalWidth > 0 || img.src.startsWith('blob:'))) {
          return img;
        }
        return null;
      }, { timeoutMs: 1600, intervalMs: 60 });

      if (viewerImg && viewerImg.src) {
        const blob = await fetchBlobDirectly(viewerImg.src);
        if (blob && blob.size >= 600) {
          const dims = await getImageDimensionsFromBlob(blob);
          const isRealHd = (dims.width >= 600 || dims.height >= 600 || blob.size >= 40000);
          dismissUnwantedModals();
          return {
            blob,
            isHd: isRealHd,
            isThumbnail: !isRealHd,
            resolutionCategory: isRealHd ? 'Alta Resolução (Visualizador)' : 'Média Resolução (Visualizador)',
            width: dims.width,
            height: dims.height,
            size: blob.size,
          };
        }
      }
      dismissUnwantedModals();
    } catch (e) {
      dismissUnwantedModals();
    }
    return null;
  }

  /**
   * PONTO 1: ENUMERAÇÃO DE ÁLBUNS COM AVISO EXPLÍCITO DE TETO DE SEGURANÇA
   * Se um álbum atingir MAX_ALBUM_PHOTOS sem que os controles de navegação
   * indiquem o fim natural, registra alerta explícito e não o trata como concluído.
   * Suporta todos os álbuns: com +N, álbuns de 2 a 4 fotos e grades múltiplas.
   */
  async function expandVisibleAlbums(prefixes) {
    const mainChat = document.querySelector('#main');
    if (!mainChat || shouldStopScanning) return 0;

    const runAttr = `data-fac-album-${currentScanRunId}`;
    let expanded = 0;

    // Detecta bolhas de mensagem no chat
    const bubbles = Array.from(mainChat.querySelectorAll('.message-in, .message-out, div[data-testid^="msg-"]'));

    for (const bubble of bubbles) {
      if (shouldStopScanning) break;
      if (bubble.hasAttribute(runAttr) || bubble.hasAttribute('data-fac-album-processed')) continue;

      // Critérios de identificação de Álbum:
      // 1. Overlay com badge "+N" (5+ fotos)
      // 2. Elemento com data-testid="album" ou classe de álbum
      // 3. Duas ou mais imagens dentro da mesma mensagem
      const hasPlusBadge = Array.from(bubble.querySelectorAll('span, div')).some((el) => {
        const txt = (el.textContent || '').trim();
        return /^\+\d+$/.test(txt);
      });
      const hasAlbumContainer = Boolean(bubble.querySelector('div[data-testid="album"], div[class*="album"]'));
      const imgCount = bubble.querySelectorAll('img').length;

      if (!hasPlusBadge && !hasAlbumContainer && imgCount < 2) {
        continue;
      }

      // Marca o álbum para esta execução para nunca reprocessar nem duplicar
      bubble.setAttribute(runAttr, 'true');
      bubble.setAttribute('data-fac-album-processed', 'true');

      const bubbleText = (bubble.innerText || '').trim();
      const meta = extractMetadataFromText(bubbleText, bubble, prefixes);

      // Localiza o elemento clicável do álbum
      const plusBadgeEl = Array.from(bubble.querySelectorAll('span, div')).find((el) => /^\+\d+$/.test((el.textContent || '').trim()));
      const clickable =
        plusBadgeEl?.closest('div[role="button"], button') ||
        plusBadgeEl ||
        bubble.querySelector('div[data-testid="album"] div[role="button"], div[role="button"]:has(img), img') ||
        bubble.querySelector('img') ||
        bubble;

      try {
        clickable.click();

        const mediaViewer = await waitForCondition(() => {
          return document.querySelector('div[data-testid="media-viewer"], div[data-testid="lightbox-wrapper"]');
        }, { timeoutMs: 2500, intervalMs: 60 });

        if (mediaViewer) {
          const visitedViewerMedia = new Set();
          let consecutiveUnchangedCount = 0;
          let albumStep = 0;
          let reachedNaturalEnd = false;
          const albumCapturedKeys = [];

          while (!shouldStopScanning && albumStep < MAX_ALBUM_PHOTOS) {
            albumStep++;

            const currentImg = await waitForCondition(() => {
              const img = mediaViewer.querySelector('img[src^="blob:"]') || mediaViewer.querySelector('img[src]');
              if (img && img.src && img.complete && (img.naturalWidth > 0 || img.src.startsWith('blob:'))) {
                return img;
              }
              return null;
            }, { timeoutMs: 2200, intervalMs: 60 });

            if (!currentImg || !currentImg.src) {
              reachedNaturalEnd = true;
              break;
            }

            const mediaSrc = currentImg.src;

            if (visitedViewerMedia.has(mediaSrc)) {
              consecutiveUnchangedCount++;
              if (consecutiveUnchangedCount >= 2) {
                // A imagem não mudou após tentativas: fim natural comprovado
                reachedNaturalEnd = true;
                break;
              }
            } else {
              consecutiveUnchangedCount = 0;
              visitedViewerMedia.add(mediaSrc);

              // 1. Tenta extração direta via WWebJS.resolveMediaBlob se houver ID de mensagem no visualizador
              let blob = null;
              let dims = { width: 0, height: 0 };
              let isRealHd = false;
              let resolutionCategory = 'Alta Resolução (Visualizador)';

              const viewerMsgId =
                currentImg.getAttribute('data-id') ||
                currentImg.closest('[data-id]')?.getAttribute('data-id') ||
                mediaViewer.querySelector('[data-id]')?.getAttribute('data-id');

              if (viewerMsgId) {
                const directMedia = await requestResolveMedia(viewerMsgId);
                if (directMedia && directMedia.blob && directMedia.blob.size >= 600) {
                  blob = directMedia.blob;
                  dims = await getImageDimensionsFromBlob(blob);
                  isRealHd = (dims.width >= 600 || dims.height >= 600 || blob.size >= 40000);
                  resolutionCategory = 'Alta Resolução (Extração Direta WhatsApp)';
                }
              }

              // 2. Fallback: fetch direto da URL blob do visualizador
              if (!blob) {
                blob = await fetchBlobDirectly(mediaSrc);
                if (blob && blob.size >= 600) {
                  dims = await getImageDimensionsFromBlob(blob);
                  isRealHd = (dims.width >= 600 || dims.height >= 600 || blob.size >= 40000);
                  resolutionCategory = isRealHd ? 'Alta Resolução (Visualizador)' : 'Média Resolução (Visualizador)';
                }
              }

              if (blob && blob.size >= 600) {
                const albumKey = `album_img_${mediaSrc.replace(/^blob:[^/]+\//, '').slice(-32)}`;
                albumCapturedKeys.push(albumKey);

                if (!photoAccumulator.has(albumKey)) {
                  // Salva o blob no IndexedDB para não inflar a memória
                  await TempBlobStorage.store(albumKey, blob);

                  photoAccumulator.set(albumKey, {
                    key: albumKey,
                    meta,
                    rawText: bubbleText || 'Foto de Álbum Expandido',
                    isHd: isRealHd,
                    isThumbnail: !isRealHd,
                    resolutionCategory,
                    size: blob.size,
                    width: dims.width,
                    height: dims.height,
                    timestamp: Date.now(),
                    cappedAlbum: false,
                    blob: blob,
                  });
                  if (meta?.dateStr) {
                    updateLastPhotoDateDisplay(meta.dateStr);
                  }
                  expanded++;
                }
              }
            }

            // Verifica o botão de avançar na interface
            const nextBtn = mediaViewer.querySelector(
              'div[data-testid="media-viewer-next"], button[data-testid="media-viewer-next"], div[role="button"][aria-label*="Next" i], button[aria-label*="Next" i], div[role="button"][aria-label*="Próxim" i], button[aria-label*="Próxim" i]'
            ) || mediaViewer.querySelector('span[data-icon="chevron-right"]')?.closest('div[role="button"], button');

            if (nextBtn) {
              const isDisabled = nextBtn.hasAttribute('disabled') || nextBtn.getAttribute('aria-disabled') === 'true';
              if (isDisabled) {
                reachedNaturalEnd = true;
                break;
              }
              nextBtn.click();
            } else {
              window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true }));
            }

            // Aguarda a imagem mudar com timeout de 2500ms
            const changed = await waitForCondition(() => {
              const img = mediaViewer.querySelector('img[src^="blob:"]') || mediaViewer.querySelector('img[src]');
              return img && img.src && img.src !== mediaSrc;
            }, { timeoutMs: 2500, intervalMs: 60 });

            if (!changed) {
              // Tenta mais um clique caso a rede ou WhatsApp tenha engasgado
              if (nextBtn && !nextBtn.hasAttribute('disabled') && nextBtn.getAttribute('aria-disabled') !== 'true') {
                nextBtn.click();
              } else {
                window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true }));
              }
              await waitForCondition(() => {
                const img = mediaViewer.querySelector('img[src^="blob:"]') || mediaViewer.querySelector('img[src]');
                return img && img.src && img.src !== mediaSrc;
              }, { timeoutMs: 1500, intervalMs: 60 });
            }
          }

          // Se atingiu o teto sem confirmação de fim natural, marca como INTERROMPIDO PELO TETO
          if (albumStep >= MAX_ALBUM_PHOTOS && !reachedNaturalEnd) {
            const warningInfo = {
              title: bubbleText.slice(0, 45) || 'Álbum',
              captured: albumStep,
              limit: MAX_ALBUM_PHOTOS,
            };
            albumCeilingWarnings.push(warningInfo);
            console.warn(`[Conserva_Fotos] ATENÇÃO: Álbum com mais de ${MAX_ALBUM_PHOTOS} fotos atingiu o teto de segurança e foi interrompido.`, warningInfo);

            for (const k of albumCapturedKeys) {
              const rec = photoAccumulator.get(k);
              if (rec) rec.cappedAlbum = true;
            }

            const statusText = document.getElementById('fac-status-text');
            if (statusText) {
              statusText.textContent = `⚠️ Atenção: Álbum com +${MAX_ALBUM_PHOTOS} fotos atingiu o limite e foi interrompido por segurança.`;
            }
          }

          dismissUnwantedModals();
        }
      } catch (e) {
        dismissUnwantedModals();
      }
    }

    return expanded;
  }

  /**
   * Coleta fotos individuais das bolhas visíveis no Chat
   * (Pula bolhas de álbuns já processadas pelo visualizador para garantir alta resolução e zero duplicatas)
   */
  async function collectVisiblePhotos(prefixes) {
    dismissUnwantedModals();
    const triggered = triggerMediaDownloads();
    if (triggered > 0) {
      // Breve pausa para o WhatsApp iniciar o download das mídias
      await interruptibleSleep(400);
    }

    const mainChat = document.querySelector('#main');
    if (!mainChat) return 0;

    const bubbles = Array.from(
      mainChat.querySelectorAll('.message-in, .message-out, div[data-testid^="msg-"], div[data-id]')
    );

    let newlyAdded = 0;

    for (const bubble of bubbles) {
      if (shouldStopScanning) break;

      // Pula álbuns já expandidos para evitar capturar miniaturas duplicadas
      if (bubble.hasAttribute('data-fac-album-processed') || bubble.getAttribute(`data-fac-album-${currentScanRunId}`)) {
        continue;
      }
      // Se for álbum (container de álbum ou 2+ fotos), será processado por expandVisibleAlbums
      if (bubble.querySelector('div[data-testid="album"], div[class*="album"]') || bubble.querySelectorAll('img').length >= 2) {
        continue;
      }

      const bubbleText = (bubble.innerText || '').trim();
      const preText = bubble.getAttribute('data-pre-plain-text') || bubble.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
      const dataId = bubble.getAttribute('data-id') || bubble.closest('[data-id]')?.getAttribute('data-id') || '';

      const imgElements = Array.from(bubble.querySelectorAll('img')).filter((img) => {
        const src = img.src || '';
        if (img.closest('div[data-testid="chat-avatar"], div[data-testid="avatar"], .avatar')) return false;
        return (
          src.startsWith('blob:') ||
          src.startsWith('data:image') ||
          src.includes('.whatsapp.net') ||
          img.closest('div[data-testid="image-thumb"]') ||
          img.closest('.message-in, .message-out')
        );
      });

      if (imgElements.length === 0) continue;

      const meta = extractMetadataFromText(bubbleText, bubble, prefixes);
      const stableMsgId = dataId || preText || `msg_${meta.dateKey || 'single'}_${Math.round(bubble.getBoundingClientRect().top)}`;

      for (let idx = 0; idx < imgElements.length; idx++) {
        if (shouldStopScanning) break;
        const img = imgElements[idx];
        const photoKey = `${stableMsgId}_slot_${idx}`;

        // Se a imagem ainda estiver carregando, aguarda completar
        if (!img.complete && img.src) {
          await waitForCondition(() => img.complete && img.naturalWidth > 0, { timeoutMs: 1400, intervalMs: 50 });
        }

        const isBlob = img.src && img.src.startsWith('blob:');
        let blob = null;
        let isRealHd = false;
        let resolutionCategory = 'Resolução não verificada / Miniatura';
        let dims = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };

        // 1. TENTATIVA PRIORITÁRIA: Extração Direta via WWebJS.resolveMediaBlob (whatsapp-web.js)
        const targetMsgId = img.getAttribute('data-id') || img.closest('[data-id]')?.getAttribute('data-id') || dataId;
        if (targetMsgId) {
          const directMedia = await requestResolveMedia(targetMsgId);
          if (directMedia && directMedia.blob && directMedia.blob.size >= 600) {
            blob = directMedia.blob;
            dims = await getImageDimensionsFromBlob(blob);
            isRealHd = (dims.width >= 600 || dims.height >= 600 || blob.size >= 40000);
            resolutionCategory = 'Alta Resolução (Extração Direta WhatsApp)';

            // Se obteve timestamp nativo do WhatsApp e não havia data explícita detectada
            if (directMedia.timestamp && !meta.dateObj) {
              const nativeDate = new Date(directMedia.timestamp);
              if (!isNaN(nativeDate.getTime())) {
                const yyyy = nativeDate.getFullYear();
                const mm = String(nativeDate.getMonth() + 1).padStart(2, '0');
                const dd = String(nativeDate.getDate()).padStart(2, '0');
                meta.dateKey = `${yyyy}${mm}${dd}`;
                meta.dateStr = `${dd}/${mm}/${yyyy}`;
                meta.dateObj = nativeDate;
              }
            }
          }
        }

        // 2. FALLBACK 1: Se extração direta não obteve o blob, tenta via URL blob no DOM
        if (!blob && isBlob) {
          blob = await fetchBlobDirectly(img.src);
          if (blob && blob.size >= 600) {
            dims = await getImageDimensionsFromBlob(blob);
            if (dims.width >= 600 || dims.height >= 600 || blob.size >= 50000) {
              isRealHd = true;
              resolutionCategory = 'Alta Resolução (Chat Web)';
            } else if (dims.width >= 350 || dims.height >= 350 || blob.size >= 25000) {
              resolutionCategory = 'Média Resolução (Chat Web)';
            }
          }
        }

        // 3. FALLBACK 2: Se ainda não for HD, tenta captura pelo visualizador nativo
        if (!isRealHd && img.src && !blob) {
          const clickable = img.closest('div[role="button"], button') || img;
          const captured = await captureRealHdFromViewer(clickable);
          if (captured && captured.blob) {
            blob = captured.blob;
            dims = { width: captured.width, height: captured.height };
            isRealHd = captured.isHd;
            resolutionCategory = captured.resolutionCategory;
          } else if (!blob) {
            blob = await fetchBlobDirectly(img.src);
            if (blob) {
              dims = await getImageDimensionsFromBlob(blob);
              resolutionCategory = 'Resolução não verificada / Miniatura';
            }
          }
        }

        if (!blob || blob.size < 600) continue;

        // Salva blob no IndexedDB para não manter o payload na memória RAM
        await TempBlobStorage.store(photoKey, blob);

        const existing = photoAccumulator.get(photoKey);
        if (existing) {
          if (blob.size > existing.size || (!existing.isHd && isRealHd)) {
            photoAccumulator.set(photoKey, {
              key: photoKey,
              meta: existing.meta.dateKey ? existing.meta : meta,
              rawText: bubbleText || existing.rawText,
              isHd: isRealHd,
              isThumbnail: !isRealHd,
              resolutionCategory,
              size: blob.size,
              width: dims.width,
              height: dims.height,
              timestamp: existing.timestamp || Date.now(),
              cappedAlbum: false,
              blob: blob,
            });
          }
          continue;
        }

        photoAccumulator.set(photoKey, {
          key: photoKey,
          meta,
          rawText: bubbleText,
          isHd: isRealHd,
          isThumbnail: !isRealHd,
          resolutionCategory,
          size: blob.size,
          width: dims.width,
          height: dims.height,
          timestamp: Date.now(),
          cappedAlbum: false,
          blob: blob,
        });
        if (meta?.dateStr) {
          updateLastPhotoDateDisplay(meta.dateStr);
        }
        newlyAdded++;
      }
    }

    return newlyAdded;
  }

  function isAtBeginningOfChat() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) return false;

    const groupCreatedEl = mainChat.querySelector('div[data-testid="group-chat-started"]');
    if (groupCreatedEl) {
      const rect = groupCreatedEl.getBoundingClientRect();
      const txt = (groupCreatedEl.textContent || '').toLowerCase();
      if (txt.includes('criou o grupo') || txt.includes('created group') || txt.includes('adicionou você') || txt.includes('grupo criado')) {
        if (rect.top > 0 && rect.top < 350) return true;
      }
    }
    return false;
  }

  function getStableGalleryMediaId(img, dateYMD) {
    if (!img) return null;
    const container = img.closest('[data-id]') || img.closest('div[role="button"]');
    const dataId = container?.getAttribute('data-id') || img.getAttribute('data-id');
    if (dataId) return `gal_msg_${dataId}`;

    const src = img.src || '';
    if (src.startsWith('blob:')) {
      const uuid = src.replace(/^blob:[^/]+\//, '').slice(0, 36);
      if (uuid && uuid.length > 8) return `gal_blob_${uuid}`;
    }
    if (src.includes('whatsapp.net')) {
      try {
        const u = new URL(src);
        return `gal_cdn_${u.pathname.split('/').pop()}`;
      } catch (e) {}
    }

    if (src.startsWith('data:image')) {
      return `gal_thumb_${dateYMD}_${src.slice(-32)}`;
    }

    return `gal_src_${dateYMD}_${src.slice(-24)}`;
  }

  // =========================================================================
  // PRÉ-CARREGAMENTO DE MENSAGENS NA MEMÓRIA DO WHATSAPP WEB
  // Rola a conversa até a data limite para o WhatsApp Web carregar o histórico em memória,
  // retorna para a última data (hoje) e inicia a coleta estritamente como estava no modal
  // =========================================================================

  /**
   * Fecha o modal de Figurinha ("Adicionar às favoritas" / Sticker Details) caso tenha sido aberto
   */
  function closeStickerModalIfOpen() {
    try {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[data-testid="popup-contents"], div[class*="popup"]')).filter((d) => {
        if (d.id === 'fiscalizacampo-panel' || d.closest('#fiscalizacampo-panel') || d.closest('#fac-global-stop-bar')) return false;
        const txt = (d.innerText || d.textContent || '').toLowerCase();
        return (
          txt.includes('adicionar às favoritas') ||
          txt.includes('remover das favoritas') ||
          txt.includes('add to favorites') ||
          txt.includes('remove from favorites') ||
          Boolean(d.querySelector('div[data-testid="sticker-details"], button[aria-label*="favorit" i], span[data-icon="star-btn"]'))
        );
      });

      for (const d of dialogs) {
        const closeBtn = d.querySelector(
          'span[data-icon="x"], span[data-icon="x-viewer"], button[aria-label*="Fechar" i], button[aria-label*="Close" i], div[role="button"][aria-label*="Fechar" i]'
        ) || document.querySelector('header span[data-icon="x"]');

        if (closeBtn && closeBtn.id !== 'fac-close-btn') {
          try { closeBtn.click(); } catch (e) {}
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      }
    } catch (e) {}
  }

  /**
   * Fecha a gaveta lateral de "Dados do Contato" / "Info do Grupo" caso tenha sido aberta por acidente
   */
  function closeContactInfoDrawerIfOpen() {
    closeStickerModalIfOpen();

    const closeBtns = Array.from(document.querySelectorAll(
      'div[data-testid="drawer-right"] span[data-icon="x"], div[data-testid="chat-info-drawer"] span[data-icon="x"], ' +
      'header button[aria-label*="fechar" i], button[aria-label*="Fechar painel" i], span[data-icon="x"]'
    )).filter((el) => {
      if (el.closest('#fiscalizacampo-panel') || el.closest('#fac-global-stop-bar')) return false;
      const drawer = el.closest('div[data-testid="drawer-right"], div[data-testid="chat-info-drawer"], section');
      return Boolean(drawer);
    });

    for (const btn of closeBtns) {
      const clickEl = btn.closest('button, div[role="button"]') || btn;
      try { clickEl.click(); } catch (e) {}
    }
  }

  /**
   * Verifica se o elemento pertence à barra lateral de navegação do WhatsApp
   * (Conversas, Status, Canais, Comunidades) para NUNCA clicar nela.
   */
  function isElementInLeftNavRail(el) {
    if (!el) return false;
    if (el.closest('nav, header, #side, div[data-testid="chat-list-side"], div[role="navigation"], div[aria-label*="comunidade" i], div[aria-label*="community" i], div[data-testid="intro-text"]')) {
      return true;
    }
    const rect = el.getBoundingClientRect();
    if (rect.left < 70 && !el.closest('div[data-testid="media-viewer"], div[role="dialog"]')) {
      return true;
    }
    return false;
  }

  function isElementSafeViewerButton(el) {
    if (!el) return false;
    if (el.closest('#fiscalizacampo-panel') || el.closest('#fiscalizacampo-floating-btn')) return false;
    if (isElementInLeftNavRail(el)) return false;
    return true;
  }

  /**
   * Restaura o foco para a lista de conversas caso o WhatsApp tenha entrado em Comunidades
   */
  function ensureInChatsView() {
    const mainChat = document.querySelector('#main');
    if (!mainChat) {
      const chatsBtn = document.querySelector(
        'button[aria-label*="conversa" i], button[aria-label*="chat" i], div[role="button"][aria-label*="conversa" i], span[data-icon="chats-outline"], span[data-icon="chat"]'
      );
      if (chatsBtn) {
        const clickEl = chatsBtn.closest('button, div[role="button"]') || chatsBtn;
        try { clickEl.click(); } catch (e) {}
      }
    }
  }

  /**
   * Clica no botão de retroceder (foto anterior / '<') no visualizador com proteção total
   */
  function clickMediaViewerPreviousButton() {
    // 1. O visualizador de mídia DEVE estar presente na tela
    const activeViewer = findActiveViewerElement()?.viewer || document.querySelector('div[data-testid="media-viewer"], div[role="dialog"]');
    if (!activeViewer) {
      return false; // Se o modal não estiver aberto, NUNCA clica para evitar mudar de aba no WhatsApp!
    }

    // Seletores diretos conhecidos do WhatsApp Web para o botão '<'
    const directSelectors = [
      'div[data-testid="media-viewer-prev"]',
      'button[data-testid="media-viewer-prev"]',
      'button[aria-label*="anterior" i]',
      'button[aria-label*="previous" i]',
      'div[role="button"][aria-label*="anterior" i]',
      'div[role="button"][aria-label*="previous" i]',
      'span[data-icon="chevron-left"]',
      'span[data-icon="chevron-left-alt"]',
      'span[data-icon="chevron-left-thick"]'
    ];

    for (const sel of directSelectors) {
      const el = activeViewer.querySelector(sel);
      if (el && isElementSafeViewerButton(el)) {
        const btn = el.closest('button, div[role="button"]') || el;
        dispatchFullClick(btn);
        return true;
      }
    }

    // 2. Detecção espacial resiliente do botão redondo da esquerda estritamente dentro do visualizador
    const viewerButtons = Array.from(activeViewer.querySelectorAll('button, div[role="button"]')).filter((b) => {
      if (!isElementSafeViewerButton(b)) return false;
      const rect = b.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.left <= 120 &&
        rect.top > window.innerHeight * 0.25 &&
        rect.top < window.innerHeight * 0.75 &&
        rect.width >= 30 &&
        rect.height >= 30
      );
    });

    if (viewerButtons.length > 0) {
      dispatchFullClick(viewerButtons[0]);
      return true;
    }

    // 3. Clique direto no ponto físico da seta esquerda APENAS se o elemento estiver no modal do visualizador
    try {
      const elAtPoint = document.elementFromPoint(46, Math.floor(window.innerHeight * 0.5));
      if (elAtPoint && isElementSafeViewerButton(elAtPoint) && elAtPoint.closest('div[data-testid="media-viewer"], div[role="dialog"]')) {
        const btn = elAtPoint.closest('button, div[role="button"]') || elAtPoint;
        dispatchFullClick(btn);
        return true;
      }
    } catch (e) {}

    return false;
  }

  /**
   * Clica no botão de avançar (próxima foto / '>') no visualizador com proteção total
   */
  function clickMediaViewerNextButton() {
    const activeViewer = findActiveViewerElement()?.viewer || document.querySelector('div[data-testid="media-viewer"], div[role="dialog"]');
    if (!activeViewer) {
      return false;
    }

    const directSelectors = [
      'div[data-testid="media-viewer-next"]',
      'button[data-testid="media-viewer-next"]',
      'button[aria-label*="próxim" i]',
      'button[aria-label*="next" i]',
      'button[aria-label*="seguinte" i]',
      'div[role="button"][aria-label*="próxim" i]',
      'div[role="button"][aria-label*="next" i]',
      'div[role="button"][aria-label*="seguinte" i]',
      'span[data-icon="chevron-right"]',
      'span[data-icon="chevron-right-alt"]',
      'span[data-icon="chevron-right-thick"]'
    ];

    for (const sel of directSelectors) {
      const el = activeViewer.querySelector(sel);
      if (el && isElementSafeViewerButton(el)) {
        const btn = el.closest('button, div[role="button"]') || el;
        if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') return false;
        dispatchFullClick(btn);
        return true;
      }
    }

    // 2. Detecção espacial resiliente do botão redondo da direita (Middle-Right) dentro do visualizador
    const rightButtons = Array.from(activeViewer.querySelectorAll('button, div[role="button"]')).filter((b) => {
      if (!isElementSafeViewerButton(b)) return false;
      const rect = b.getBoundingClientRect();
      return (
        rect.right >= window.innerWidth - 120 &&
        rect.left <= window.innerWidth &&
        rect.top > window.innerHeight * 0.25 &&
        rect.top < window.innerHeight * 0.75 &&
        rect.width >= 30 &&
        rect.height >= 30
      );
    });

    if (rightButtons.length > 0) {
      const btn = rightButtons[0];
      if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') return false;
      dispatchFullClick(btn);
      return true;
    }

    // 3. Clique direto no ponto físico da seta direita na tela
    try {
      const elAtPoint = document.elementFromPoint(window.innerWidth - 46, Math.floor(window.innerHeight * 0.5));
      if (elAtPoint && isElementSafeViewerButton(elAtPoint) && elAtPoint.closest('div[data-testid="media-viewer"], div[role="dialog"]')) {
        const btn = elAtPoint.closest('button, div[role="button"]') || elAtPoint;
        if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true') return false;
        dispatchFullClick(btn);
        return true;
      }
    } catch (e) {}

    return false;
  }

  /**
   * Rola a conversa até o final (para a mensagem mais recente / hoje).
   */
  async function scrollToBottomOfChat() {
    closeContactInfoDrawerIfOpen();

    const mainChat = document.querySelector('#main');
    const scrollContainer = findScrollContainer() || mainChat;

    for (let attempt = 0; attempt < 8; attempt++) {
      if (shouldStopScanning) break;

      closeContactInfoDrawerIfOpen();

      // 1. Clica no botão flutuante nativo de descer para o fim da conversa (seta redonda para baixo)
      const downButtons = Array.from(document.querySelectorAll(
        'button[aria-label*="final" i], button[aria-label*="bottom" i], button[aria-label*="rolar para baixo" i], ' +
        'div[role="button"][aria-label*="final" i], div[role="button"][aria-label*="bottom" i], div[role="button"][aria-label*="rolar para baixo" i], ' +
        'div[data-testid="scroll-to-bottom"], span[data-icon="round-down-large"]'
      ));

      for (const btn of downButtons) {
        if (btn.closest('#fiscalizacampo-panel') || btn.closest('#fiscalizacampo-floating-btn')) continue;
        const target = btn.closest('button, div[role="button"]') || btn;
        try { target.click(); } catch (e) {}
      }

      // 2. Força rolagem vertical para o fim
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 20000, bubbles: true }));
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }

      await interruptibleSleep(200);

      // Se já está próximo do rodapé (menos de 250px do fim), considera alcançado
      if (scrollContainer && (scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 250)) {
        break;
      }
    }

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
    await interruptibleSleep(300);
  }

  /**
   * Rola a conversa para baixo até alcançar a Data Final estipulada
   */
  async function scrollDownToDate(targetDateEndInt, rangeEndLabel) {
    const statusText = document.getElementById('fac-status-text');
    const mainChat = document.querySelector('#main');
    const scrollContainer = findScrollContainer() || mainChat;
    if (!scrollContainer) return;

    const todayDateInt = parseInt(formatDateToYMD(new Date()).replace(/-/g, ''), 10);
    const isTargetingToday = (!targetDateEndInt || targetDateEndInt >= todayDateInt);

    // Se a data final for hoje ou posterior, desce imediatamente tudo até o rodapé em 1 passo ágil
    if (isTargetingToday) {
      if (statusText) {
        statusText.textContent = `Posicionando no final da conversa (${rangeEndLabel})...`;
      }
      await scrollToBottomOfChat();
      return;
    }

    if (statusText) {
      statusText.textContent = `Descendo conversa até ${rangeEndLabel}...`;
    }

    // Descida ágil até encontrar a data final no topo visível do chat
    for (let step = 0; step < 60; step++) {
      if (shouldStopScanning) break;

      scrollContainer.scrollTop += 2400;
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: 3000, bubbles: true }));
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      await interruptibleSleep(100);

      // Lê a data mais antiga visível atualmente na tela do chat
      const currentTopDate = findEarliestVisibleDate();
      if (currentTopDate) {
        const dateInt = currentTopDate.getFullYear() * 10000 + (currentTopDate.getMonth() + 1) * 100 + currentTopDate.getDate();
        updateLiveDateDisplay(formatDisplayDate(currentTopDate));
        if (dateInt >= targetDateEndInt) {
          break; // O topo visível do chat alcançou a data final!
        }
      }

      // Se já está no rodapé absoluto
      if (scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 250) {
        break;
      }
    }
  }

  /**
   * Pré-carrega mensagens da conversa na memória do WhatsApp Web:
   * 1. Rola a tela da conversa (scrollContainer) para cima (em direção ao passado).
   * 2. Otimizado para conversas com alto volume (1000+ fotos por dia), pulando diretamente
   *    para o topo do lote para disparar a próxima requisição imediatamente.
   * 3. Resiliência máxima (até 120 tentativas com active bounce no topo) aguardando sincronização de rede.
   * 4. Encerra assim que alcançar a Data Limite e retorna para a data de hoje.
   */
  async function preloadChatHistoryIntoMemory(targetDateLimitInt, limitLabel) {
    const statusText = document.getElementById('fac-status-text');
    const progressFill = document.getElementById('fac-progress-fill');

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      console.warn('[Conserva_Fotos] Painel de rolagem da conversa não encontrado.');
      return;
    }

    if (statusText) {
      statusText.textContent = `Carregando histórico na memória do WhatsApp até ${limitLabel}...`;
    }

    let lowestDateFound = null;
    let consecutiveStagnant = 0;
    const MAX_STAGNANT_RETRIES = 120; // Resiliência alta: até 120 tentativas (~60s de buffer de rede)
    const MAX_TOTAL_STEPS = 6000;    // Suporta conversas massivas de 30+ dias com 1000 fotos/dia

    for (let step = 0; step < MAX_TOTAL_STEPS; step++) {
      if (shouldStopScanning) break;

      if (progressFill) {
        progressFill.style.width = `${Math.min(95, 4 + ((step % 40) * 2.3))}%`;
      }

      // Clica em banners de sincronização / mensagens antigas do servidor
      clickOlderMessagesBanner();

      const prevScrollTop = scrollContainer.scrollTop;

      if (prevScrollTop > 200) {
        // Rola rapidamente para cima com delta natural que dispara os IntersectionObservers do WhatsApp
        scrollContainer.scrollTop = Math.max(0, prevScrollTop - 1500);
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -2000, bubbles: true }));
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        consecutiveStagnant = 0;
        await interruptibleSleep(200);
      } else {
        // Já está no topo visível (scrollTop <= 200)
        consecutiveStagnant++;

        // Bouncing ativo no topo: força o IntersectionObserver do WhatsApp a solicitar mais dados
        scrollContainer.scrollTop = 250;
        await interruptibleSleep(50);
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -3500, bubbles: true }));
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        clickOlderMessagesBanner();

        // Checa se há spinner nativo de carregamento do WhatsApp
        const spinner = document.querySelector('#main div[data-testid="spinner"], #main div[role="progressbar"], #main circle');
        if (spinner) {
          await interruptibleSleep(700);
        }

        const dateStr = lowestDateFound ? formatDisplayDate(lowestDateFound) : 'Detectando...';
        if (statusText) {
          statusText.textContent = `Sincronizando WhatsApp... (${consecutiveStagnant}/${MAX_STAGNANT_RETRIES}) | Data atual: ${dateStr}`;
        }

        // Se após 120 tentativas com bounce e espera nenhuma nova mensagem chegou do servidor
        if (consecutiveStagnant >= MAX_STAGNANT_RETRIES) {
          if (statusText) {
            statusText.textContent = `Fim das mensagens sincronizadas pelo WhatsApp no servidor (${dateStr}). Prosseguindo...`;
          }
          break;
        }
      }

      // Lê a data mais antiga visível atualmente na tela do chat
      const earliestVisible = findEarliestVisibleDate();
      if (earliestVisible) {
        if (!lowestDateFound || earliestVisible < lowestDateFound) {
          lowestDateFound = earliestVisible;
          consecutiveStagnant = 0; // Data anterior detectada! Zera contador de estagnação
        }

        const displayDate = formatDisplayDate(lowestDateFound);
        updateLiveDateDisplay(displayDate);

        if (statusText && prevScrollTop > 0) {
          statusText.textContent = `Memória WhatsApp: lendo ${displayDate} (alvo: ${limitLabel})...`;
        }

        // Checagem estrita da Data Limite:
        if (targetDateLimitInt > 0) {
          const yr = lowestDateFound.getFullYear();
          const dateInt = yr * 10000 + (lowestDateFound.getMonth() + 1) * 100 + lowestDateFound.getDate();
          if (dateInt <= targetDateLimitInt) {
            if (statusText) {
              statusText.textContent = `✅ Data limite alcançada no histórico (${displayDate})! Retornando para hoje...`;
            }
            break; // Data limite alcançada! Não continua subindo!
          }
        }
      }

      // Verifica início absoluto do chat (apenas se não houver data limite ou após várias tentativas de sincronização)
      if (isAtBeginningOfChat() && (targetDateLimitInt === 0 || consecutiveStagnant >= 40)) {
        if (statusText) {
          statusText.textContent = 'Início absoluto do histórico alcançado no carregamento.';
        }
        break;
      }

      // Pausa cadenciada para o WebSocket e a árvore virtual do React renderizarem
      await interruptibleSleep(prevScrollTop === 0 ? 380 : 180);
    }

    if (shouldStopScanning) return;

    // Retorna a conversa para a última data (hoje / final do chat)
    if (statusText) {
      statusText.textContent = 'Histórico sincronizado na memória. Retornando para a data de hoje...';
    }
    await scrollToBottomOfChat();
    await interruptibleSleep(500);
    await scrollToBottomOfChat();
    await interruptibleSleep(400);

    if (statusText) {
      statusText.textContent = 'Iniciando captura no visualizador e barra horizontal...';
    }
    await interruptibleSleep(300);
  }

  // =========================================================================
  // FLUXO DE EXECUÇÃO: INICIA VARREDURA
  // =========================================================================
  async function startScanWorkflow() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;
    currentScanRunId = Date.now();
    finishReason = 'END_OF_CHAT';
    albumCeilingWarnings.length = 0; // Limpa avisos de álbuns anteriores
    photoAccumulator.clear();
    minDateReached = null;

    // Inicia cronômetro de tempo de processamento em tempo real
    startScanTimer();

    // Garante que o IndexedDB esteja inicializado e limpo para nova execução
    await TempBlobStorage.init();
    await TempBlobStorage.clear();

    document.querySelectorAll('[data-fac-album-checked]').forEach((el) => el.removeAttribute('data-fac-album-checked'));
    document.querySelectorAll('[data-fac-download-triggered]').forEach((el) => el.removeAttribute('data-fac-download-triggered'));

    const groupInput = document.getElementById('fac-active-group-name');
    const groupName = groupInput && groupInput.value.trim() ? groupInput.value.trim() : getActiveGroupName();
    const prefixes = getPrefixesList();
    const dateLimitInput = document.getElementById('fac-date-limit');
    const dateAllCheck = document.getElementById('fac-date-all');

    const empresaInput = document.getElementById('fac-empresa');

    const userEmpresa = empresaInput ? empresaInput.value.trim() : '';
    const userArea = '';
    const userEquipe = '';
    const namingPattern = 'EMPRESA_AREA_DATA_SEQ';
    const structure = 'empresa-data';
    const maxPhotosLimit = 0; // Sem limite de quantidade, até a data limite

    if (userEmpresa) localStorage.setItem('fac_saved_empresa', userEmpresa);

    let targetDateLimitInt = 0; // Data Inicial / Mais antiga (Limite de parada)
    let targetDateEndInt = 99999999; // Data Final / Mais recente (Partida da coleta)
    let limitLabel = 'sem limite de data';
    let rangeEndLabel = 'hoje';

    const dateEndInput = document.getElementById('fac-date-end');
    if (dateEndInput && dateEndInput.value) {
      localStorage.setItem('fac_saved_date_end', dateEndInput.value);
      const endParts = dateEndInput.value.split('-');
      if (endParts.length === 3) {
        targetDateEndInt = parseInt(endParts[0], 10) * 10000 + parseInt(endParts[1], 10) * 100 + parseInt(endParts[2], 10);
        rangeEndLabel = `${endParts[2]}/${endParts[1]}/${endParts[0]}`;
      }
    }

    if (!dateAllCheck.checked && dateLimitInput && dateLimitInput.value) {
      localStorage.setItem('fac_saved_date_limit', dateLimitInput.value);
      const parts = dateLimitInput.value.split('-');
      if (parts.length === 3) {
        targetDateLimitInt = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        limitLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    // Normaliza se a data inicial foi digitada maior que a data final
    if (targetDateLimitInt > 0 && targetDateLimitInt > targetDateEndInt) {
      const temp = targetDateLimitInt;
      targetDateLimitInt = targetDateEndInt;
      targetDateEndInt = temp;
      const tempLabel = limitLabel;
      limitLabel = rangeEndLabel;
      rangeEndLabel = tempLabel;
    }

    const liveBox = document.getElementById('fac-live-status-box');
    const startBtn = document.getElementById('fac-btn-start-auto');
    const runningActions = document.getElementById('fac-running-actions');
    const stopBtn = document.getElementById('fac-btn-stop');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');
    const progressFill = document.getElementById('fac-progress-fill');
    const statLastDate = document.getElementById('fac-stat-last-photo-date');

    lastCapturedPhotoDateStr = 'Nenhuma';
    oldestCapturedDateObj = null;
    if (statLastDate) statLastDate.textContent = 'Nenhuma';

    liveBox.classList.remove('hidden');
    startBtn.classList.add('hidden');
    const idleActions = document.getElementById('fac-idle-actions');
    if (idleActions) idleActions.classList.add('hidden');
    if (runningActions) runningActions.classList.remove('hidden');
    if (stopBtn) {
      stopBtn.classList.remove('hidden');
      stopBtn.style.opacity = '1';
      stopBtn.innerHTML = '⏹️ PARAR E BAIXAR AGORA (<span id="fac-stop-count">0</span> fotos)';
    }

    stopCount.textContent = '0';
    if (floatingCount) floatingCount.textContent = '0';
    statPhotos.textContent = '0';
    progressFill.style.width = '5%';

    if (scanMode === 'gallery') {
      await runGalleryScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, limitLabel, maxPhotosLimit);
    } else {
      ensureInChatsView();

      const alreadyOpenViewer = findActiveViewerElement();
      if (!alreadyOpenViewer) {
        // 1. Sincronização Inteligente Prévia no Chat:
        // Se houver Data Inicial definida (conversas longas de dias/semanas atrás),
        // rola o histórico no #main até carregar os lotes do servidor na memória do WhatsApp
        if (targetDateLimitInt > 0 && !dateAllCheck.checked) {
          const statusText = document.getElementById('fac-status-text');
          if (statusText) statusText.textContent = `⚡ Sincronizando mensagens do chat até ${limitLabel}...`;
          await preloadChatHistoryIntoMemory(targetDateLimitInt, limitLabel);

          if (!shouldStopScanning) {
            // Retorna suavemente até a Data Final configurada
            await scrollDownToDate(targetDateEndInt, rangeEndLabel);
          }
        }

        // 2. Abre a foto no chat para atingir o estado do Print 3 (modal com régua horizontal)
        const statusText = document.getElementById('fac-status-text');
        if (statusText) statusText.textContent = '⚡ Modo Automático: Posicionando na foto do chat (Print 3)...';

        let opened = await openFirstChatPhotoAutomatically(targetDateEndInt, targetDateLimitInt);
        if (!opened) {
          opened = await openFirstChatPhotoAutomatically(targetDateEndInt, targetDateLimitInt);
        }
      }

      // 3. Inicia a coleta contínua diretamente com a foto e barra horizontal abertas (Print 3)
      await runViewerContinuousScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, targetDateEndInt, limitLabel, rangeEndLabel, maxPhotosLimit);
    }
  }

  // =========================================================================
  // ETAPA 1: ROLAR E SINCRONIZAR HISTÓRICO NO CHAT (Passado ➔ Retorno à Data Final)
  // Rola até a Data Inicial (passado) e depois desce até a Data Final, avisando na tela que está OK!
  // =========================================================================
  async function runSyncHistoryWorkflow() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;
    currentScanRunId = Date.now();

    const groupInput = document.getElementById('fac-active-group-name');
    const groupName = groupInput && groupInput.value.trim() ? groupInput.value.trim() : getActiveGroupName();
    const dateLimitInput = document.getElementById('fac-date-limit');
    const dateEndInput = document.getElementById('fac-date-end');
    const dateAllCheck = document.getElementById('fac-date-all');

    let targetDateLimitInt = 0;
    let targetDateEndInt = 99999999;
    let limitLabel = 'início do histórico';
    let rangeEndLabel = 'hoje';

    if (dateEndInput && dateEndInput.value) {
      localStorage.setItem('fac_saved_date_end', dateEndInput.value);
      const endParts = dateEndInput.value.split('-');
      if (endParts.length === 3) {
        targetDateEndInt = parseInt(endParts[0], 10) * 10000 + parseInt(endParts[1], 10) * 100 + parseInt(endParts[2], 10);
        rangeEndLabel = `${endParts[2]}/${endParts[1]}/${endParts[0]}`;
      }
    }

    if (!dateAllCheck.checked && dateLimitInput && dateLimitInput.value) {
      localStorage.setItem('fac_saved_date_limit', dateLimitInput.value);
      const parts = dateLimitInput.value.split('-');
      if (parts.length === 3) {
        targetDateLimitInt = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        limitLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    if (targetDateLimitInt > 0 && targetDateLimitInt > targetDateEndInt) {
      const temp = targetDateLimitInt;
      targetDateLimitInt = targetDateEndInt;
      targetDateEndInt = temp;
      const tempLabel = limitLabel;
      limitLabel = rangeEndLabel;
      rangeEndLabel = tempLabel;
    }

    const liveBox = document.getElementById('fac-live-status-box');
    const statusText = document.getElementById('fac-status-text');
    const runningActions = document.getElementById('fac-running-actions');
    const stopBtn = document.getElementById('fac-btn-stop');

    if (liveBox) liveBox.classList.remove('hidden');
    if (runningActions) runningActions.classList.remove('hidden');
    if (stopBtn) {
      stopBtn.classList.remove('hidden');
      stopBtn.innerHTML = '⏹️ INTERROMPER ROLAGEM';
    }

    if (statusText) {
      statusText.innerHTML = `🔄 <strong>Etapa 1 em execução:</strong> Rolando para o passado até ${limitLabel}...`;
    }

    // 1. Rola para trás até alcançar a Data Inicial (ex: 15/09/2026)
    await preloadChatHistoryIntoMemory(targetDateLimitInt, limitLabel);

    // 2. Rola para frente até alcançar a Data Final (ex: 20/09/2026 ou hoje)
    if (!shouldStopScanning) {
      if (statusText) {
        statusText.innerHTML = `🔄 <strong>Etapa 1 em execução:</strong> Retornando na conversa até ${rangeEndLabel}...`;
      }
      await scrollDownToDate(targetDateEndInt, rangeEndLabel);
    }

    isScanning = false;
    if (runningActions) runningActions.classList.add('hidden');

    // 3. Emite o aviso de tela claro que a rolagem foi concluída com sucesso
    if (statusText) {
      statusText.innerHTML = `🎉 <strong>Rolagem Concluída com Sucesso!</strong><br/>Histórico entre <strong>${limitLabel}</strong> e <strong>${rangeEndLabel}</strong> sincronizado.<br/><br/>👉 <strong>Abra qualquer foto no chat</strong> para exibir a barra horizontal e clique no botão verde <strong>"2. 📸 Iniciar Coleta no Modal"</strong>.`;
      statusText.style.background = 'rgba(16, 185, 129, 0.15)';
      statusText.style.border = '1px solid #10b981';
      statusText.style.color = '#34d399';
      statusText.style.padding = '8px';
      statusText.style.borderRadius = '6px';
    }
  }

  // =========================================================================
  // ETAPA 2: CAPTURA DAS FOTOS NO MODAL ABERTO (Com Barra Horizontal)
  // Inicia DIRETAMENTE no modal que o usuário abriu, sem mexer no chat de fundo!
  // =========================================================================
  async function runCaptureOnlyWorkflow() {
    if (isScanning) return;
    isScanning = true;
    shouldStopScanning = false;
    currentScanRunId = Date.now();
    finishReason = 'END_OF_CHAT';
    photoAccumulator.clear();

    startScanTimer();
    await TempBlobStorage.init();
    await TempBlobStorage.clear();

    const groupInput = document.getElementById('fac-active-group-name');
    const groupName = groupInput && groupInput.value.trim() ? groupInput.value.trim() : getActiveGroupName();
    const prefixes = getPrefixesList();
    const dateLimitInput = document.getElementById('fac-date-limit');
    const dateEndInput = document.getElementById('fac-date-end');
    const dateAllCheck = document.getElementById('fac-date-all');

    const empresaInput = document.getElementById('fac-empresa');
    const userEmpresa = empresaInput ? empresaInput.value.trim() : '';
    const userArea = '';
    const userEquipe = '';
    const namingPattern = 'EMPRESA_AREA_DATA_SEQ';
    const structure = 'empresa-data';
    const maxPhotosLimit = 0;

    let targetDateLimitInt = 0;
    let targetDateEndInt = 99999999;
    let limitLabel = 'início do histórico';
    let rangeEndLabel = 'hoje';

    if (dateEndInput && dateEndInput.value) {
      localStorage.setItem('fac_saved_date_end', dateEndInput.value);
      const endParts = dateEndInput.value.split('-');
      if (endParts.length === 3) {
        targetDateEndInt = parseInt(endParts[0], 10) * 10000 + parseInt(endParts[1], 10) * 100 + parseInt(endParts[2], 10);
        rangeEndLabel = `${endParts[2]}/${endParts[1]}/${endParts[0]}`;
      }
    }

    if (!dateAllCheck.checked && dateLimitInput && dateLimitInput.value) {
      localStorage.setItem('fac_saved_date_limit', dateLimitInput.value);
      const parts = dateLimitInput.value.split('-');
      if (parts.length === 3) {
        targetDateLimitInt = parseInt(parts[0], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[2], 10);
        limitLabel = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    if (targetDateLimitInt > 0 && targetDateLimitInt > targetDateEndInt) {
      const temp = targetDateLimitInt;
      targetDateLimitInt = targetDateEndInt;
      targetDateEndInt = temp;
      const tempLabel = limitLabel;
      limitLabel = rangeEndLabel;
      rangeEndLabel = tempLabel;
    }

    const liveBox = document.getElementById('fac-live-status-box');
    const runningActions = document.getElementById('fac-running-actions');
    const stopBtn = document.getElementById('fac-btn-stop');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');
    const progressFill = document.getElementById('fac-progress-fill');
    const statLastDate = document.getElementById('fac-stat-last-photo-date');
    const statusText = document.getElementById('fac-status-text');

    if (statusText) {
      statusText.style.background = '';
      statusText.style.border = '';
      statusText.style.color = '';
      statusText.style.padding = '';
      statusText.style.borderRadius = '';
    }

    lastCapturedPhotoDateStr = 'Nenhuma';
    oldestCapturedDateObj = null;
    if (statLastDate) statLastDate.textContent = 'Nenhuma';

    if (liveBox) liveBox.classList.remove('hidden');
    if (runningActions) runningActions.classList.remove('hidden');
    if (stopBtn) {
      stopBtn.classList.remove('hidden');
      stopBtn.style.opacity = '1';
      stopBtn.innerHTML = '⏹️ PARAR E BAIXAR AGORA (<span id="fac-stop-count">0</span> fotos)';
    }

    if (stopCount) stopCount.textContent = '0';
    if (floatingCount) floatingCount.textContent = '0';
    if (statPhotos) statPhotos.textContent = '0';
    if (progressFill) progressFill.style.width = '5%';

    // Executa DIRETAMENTE a coleta pelo modal (barra horizontal + botão '<')
    await runViewerContinuousScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, targetDateEndInt, limitLabel, rangeEndLabel, maxPhotosLimit);
  }

  // =========================================================================
  // ARQUITETURA STREAM REATIVO (PRESENTE ➔ PASSADO) v2.9.7
  // Baseado na Engenharia Reversa do Virtual Scroll do WhatsApp Web:
  // 1. Sentido Único Linear (Presente ➔ Passado): sem viagens de ida e volta que quebram o React.
  // 2. Monitoramento Reativo (MutationObserver): captura cada foto no milissegundo em que entra no DOM.
  // 3. Chave Primária Estável (div[data-id]): filtro de duplicidade garantido com Set().
  // 4. Extração Imediata & Descarte de RAM: grava no IndexedDB e limpa o Blob da memória.
  // 5. Throttling Cadenciado (1.5s a 2.0s): tempo ideal para o React montar e descriptografar mídias.
  // 6. Critério de Parada Cronológica: encerra assim que o divisor/data cruzar a data limite.
  // =========================================================================
  async function runReactiveStreamScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, limitLabel, maxPhotosLimit) {
    const statusText = document.getElementById('fac-status-text');
    const progressFill = document.getElementById('fac-progress-fill');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');
    const prefixes = getPrefixesList();

    const limitMsg = maxPhotosLimit > 0 ? ` (Limite: ${maxPhotosLimit} fotos)` : '';
    statusText.textContent = `Iniciando extração reativa até ${limitLabel}${limitMsg}...`;

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      alert('Não foi possível identificar o painel de mensagens do WhatsApp. Certifique-se de que a conversa está aberta.');
      finishReason = 'ERROR';
      await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
      return;
    }

    const processedMsgIds = new Set();
    let consecutiveStagnantSteps = 0;
    let step = 0;
    let isExtractingBatch = false;

    // Dispara downloads prévios de mídias que estejam com ícone de download
    triggerMediaDownloads();

    /**
     * Varredura reativa de mensagens no DOM:
     * Disparada tanto pelo MutationObserver quanto a cada passo do scroll cadenciado
     */
    const extractVisibleMessages = async () => {
      if (isExtractingBatch || shouldStopScanning) return;
      isExtractingBatch = true;

      try {
        dismissUnwantedModals();
        triggerMediaDownloads();

        const messageElements = Array.from(
          scrollContainer.querySelectorAll('div[data-id], .message-in, .message-out, div[data-testid^="msg-"]')
        );

        for (const msgEl of messageElements) {
          if (shouldStopScanning) break;

          const dataId = msgEl.getAttribute('data-id') || msgEl.closest('[data-id]')?.getAttribute('data-id') || '';
          const preText = msgEl.getAttribute('data-pre-plain-text') || msgEl.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
          const stableId = dataId || preText || `msg_node_${Math.round(msgEl.getBoundingClientRect().top)}`;

          // Se esta mensagem já foi integralmente inspecionada, pula
          if (processedMsgIds.has(stableId)) continue;

          // Localiza imagens dentro da mensagem (excluindo avatares)
          const imgs = Array.from(msgEl.querySelectorAll('img')).filter((img) => {
            if (img.closest('div[data-testid="avatar"], div[data-testid="chat-avatar"], .avatar')) return false;
            return Boolean(img.src);
          });

          // Verifica se há botão de download pendente
          const hasDownloadBtn = msgEl.querySelector(
            'div[data-testid="media-download-button"], button[data-testid="download-button"], span[data-icon="arrow-down"], span[data-icon="download"]'
          );

          if (hasDownloadBtn) {
            const btnClick = hasDownloadBtn.closest('button, div[role="button"]') || hasDownloadBtn;
            try { btnClick.click(); } catch(e) {}
          }

          // Se a mensagem não possui imagens e nem botão de download, marca como processada
          if (imgs.length === 0 && !hasDownloadBtn) {
            processedMsgIds.add(stableId);
            continue;
          }

          // Extrai metadados e data da bolha
          const bubbleText = (msgEl.innerText || '').trim();
          const meta = extractMetadataFromText(bubbleText, msgEl, prefixes);
          const photoDate = meta.dateObj;

          // Se temos uma data comprovada e atingiu a data limite:
          if (photoDate && targetDateLimitInt > 0) {
            const dateInt = photoDate.getFullYear() * 10000 + (photoDate.getMonth() + 1) * 100 + photoDate.getDate();
            if (dateInt < targetDateLimitInt) {
              finishReason = 'DATE_REACHED';
              shouldStopScanning = true;
              statusText.textContent = `Data limite alcançada (${meta.dateStr})! Concluindo...`;
              break;
            }
          }

          if (meta.dateStr) {
            updateLiveDateDisplay(meta.dateStr);
          }

          // Processa as imagens da mensagem
          if (imgs.length > 0) {
            for (let i = 0; i < imgs.length; i++) {
              if (shouldStopScanning) break;
              const img = imgs[i];
              const photoKey = `${stableId}_slot_${i}`;

              if (photoAccumulator.has(photoKey)) continue;

              const extracted = await extractBlobFromImageElement(img, dataId);
              if (extracted && extracted.blob && extracted.blob.size >= 400) {
                // Persiste imediatamente no IndexedDB para liberar RAM
                await TempBlobStorage.store(photoKey, extracted.blob);

                photoAccumulator.set(photoKey, {
                  key: photoKey,
                  meta,
                  rawText: bubbleText,
                  isHd: extracted.isHd,
                  isThumbnail: !extracted.isHd,
                  resolutionCategory: extracted.category,
                  size: extracted.blob.size,
                  width: extracted.dims.width,
                  height: extracted.dims.height,
                  timestamp: photoDate ? photoDate.getTime() : Date.now(),
                  cappedAlbum: false,
                  blob: extracted.blob,
                });

                if (meta?.dateStr) {
                  updateLastPhotoDateDisplay(meta.dateStr);
                }

                statPhotos.textContent = String(photoAccumulator.size);
                stopCount.textContent = String(photoAccumulator.size);
                if (floatingCount) floatingCount.textContent = String(photoAccumulator.size);
              }
            }
          }

          // Marca como processada
          processedMsgIds.add(stableId);
        }
      } catch (err) {
        console.warn('[Conserva_Fotos] Erro na extração de mensagens visíveis:', err);
      } finally {
        isExtractingBatch = false;
      }
    };

    // 1. Configura MutationObserver no contêiner de mensagens do chat
    const observer = new MutationObserver(() => {
      if (!shouldStopScanning) {
        extractVisibleMessages();
      }
    });

    try {
      observer.observe(scrollContainer, { childList: true, subtree: true });
    } catch (e) {
      console.warn('[Conserva_Fotos] Falha ao ativar MutationObserver:', e);
    }

    // 2. Extrai mensagens do estado inicial (presente)
    statusText.textContent = 'Coletando mídias do momento presente...';
    await extractVisibleMessages();
    await interruptibleSleep(500);

    // 3. Loop de rolagem cadenciada (Presente ➔ Passado)
    while (!shouldStopScanning) {
      if (maxPhotosLimit > 0 && photoAccumulator.size >= maxPhotosLimit) {
        finishReason = 'LIMIT_REACHED';
        statusText.textContent = `Limite configurado de ${maxPhotosLimit} fotos atingido!`;
        break;
      }

      step++;
      progressFill.style.width = `${Math.min(94, 8 + (step % 86))}%`;

      // Processa mídias visíveis
      await extractVisibleMessages();
      if (shouldStopScanning) break;

      // Verifica data limite a partir dos divisores e mensagens do topo
      const earliestDate = findEarliestVisibleDate();
      if (earliestDate) {
        if (!minDateReached || earliestDate < minDateReached) {
          minDateReached = earliestDate;
          updateLiveDateDisplay(formatDisplayDate(minDateReached));
        }

        const yr = earliestDate.getFullYear();
        const earliestDateInt = yr * 10000 + (earliestDate.getMonth() + 1) * 100 + earliestDate.getDate();

        if (targetDateLimitInt > 0 && earliestDateInt < targetDateLimitInt) {
          finishReason = 'DATE_REACHED';
          statusText.textContent = `Data limite alcançada (${formatDisplayDate(earliestDate)})! Compactando ${photoAccumulator.size} fotos...`;
          break;
        }
      }

      // Verifica início absoluto do histórico
      if (isAtBeginningOfChat()) {
        finishReason = 'END_OF_CHAT';
        statusText.textContent = 'Início absoluto do histórico alcançado!';
        break;
      }

      // Clica em banners de sincronização / mensagens antigas se houver
      clickOlderMessagesBanner();

      // Executa rolagem cadenciada para cima (em direção ao passado)
      const prevScrollTop = scrollContainer.scrollTop;
      scrollContainer.scrollTop = Math.max(0, prevScrollTop - 650);
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -750, bubbles: true }));
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      // Throttling essencial (1500ms a 2000ms):
      // Permite ao React do WhatsApp buscar as próximas mensagens do servidor/IndexedDB e descriptografar os Blobs
      await interruptibleSleep(1600);

      // Se o scroll chegou a 0 (topo visível):
      if (scrollContainer.scrollTop === 0) {
        consecutiveStagnantSteps++;
        statusText.textContent = `Aguardando carregamento de mensagens anteriores... (${consecutiveStagnantSteps}/6)`;

        // Empurrão suave para destravar o Infinite Scroll
        scrollContainer.scrollTop = 260;
        await interruptibleSleep(120);
        scrollContainer.scrollTop = 0;
        scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -1600, bubbles: true }));
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        clickOlderMessagesBanner();

        if (consecutiveStagnantSteps >= 6) {
          finishReason = 'END_OF_CHAT';
          statusText.textContent = 'Histórico sincronizado finalizado com sucesso.';
          break;
        }
      } else {
        consecutiveStagnantSteps = 0;
        statusText.textContent = `Varrendo histórico (${currentDateReading}) | ${photoAccumulator.size} fotos salvas`;
      }
    }

    // Desconecta o MutationObserver
    try {
      observer.disconnect();
    } catch (e) {}

    // Finalização e geração dos pacotes
    await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
  }

  /**
   * Localiza com precisão a FOTO PRINCIPAL em alta resolução exibida no centro do visualizador do WhatsApp Web.
   * EXCLUI 100% miniaturas da régua/barra inferior (que têm dimensões reduzidas como 72x72px, 72x40px e 1KB).
   */
  function findMainViewerPhoto(viewer) {
    if (!viewer) return null;

    // A régua/barra horizontal de miniaturas fica nos últimos 140 pixels do rodapé da tela
    const galleryThresholdTop = Math.max(200, window.innerHeight - 130);

    const allImgs = Array.from(document.querySelectorAll('img[src]')).filter((img) => {
      if (!img.src) return false;
      if (img.closest('#fiscalizacampo-panel, #fiscalizacampo-floating-btn, #main, #side')) return false;

      // Exclui qualquer miniatura da galeria inferior
      if (img.closest('div[data-testid="media-viewer-gallery"], div[role="listbox"], div[class*="gallery" i], div[class*="tray" i], div[class*="strip" i]')) {
        return false;
      }

      const rect = img.getBoundingClientRect();

      // Miniaturas ficam presas no rodapé da janela (últimos 130px):
      if (rect.top >= galleryThresholdTop) return false;

      // Miniaturas têm altura física menor ou igual a 85px
      if (rect.height <= 85 || rect.width <= 85) return false;

      // Miniaturas de 72x72 px ou 72x40 px têm dimensões naturais reduzidas
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        if (img.naturalWidth <= 150 && img.naturalHeight <= 150) {
          return false;
        }
      }

      return true;
    });

    if (allImgs.length === 0) return null;

    // Ordena pela maior área visual na tela (a foto principal em exibição no centro)
    allImgs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const areaA = (ra.width || 0) * (ra.height || 0);
      const areaB = (rb.width || 0) * (rb.height || 0);
      return areaB - areaA;
    });

    return allImgs[0];
  }

  /**
   * Localiza a imagem, vídeo ou áudio atualmente aberto no visualizador de fotos do WhatsApp Web
   * REGRA FUNDAMENTAL: Elementos dentro de #main (chat de mensagens) NUNCA são o visualizador de mídias!
   * O visualizador de fotos do WhatsApp Web é um modal de tela cheia que fica SEMPRE fora de #main e #side.
   */
  function findActiveViewerElement() {
    // 0. Se houver modal de figurinha ("Adicionar às favoritas") aberto por acidente, fecha imediatamente e ignora
    closeStickerModalIfOpen();

    // 1. Localiza o container do visualizador de tela cheia do WhatsApp (SEMPRE fora de #main e #side)
    const explicitViewer = document.querySelector(
      'div[data-testid="media-viewer"], div[data-testid="lightbox-wrapper"], div[data-animate-media-viewer="true"], div[data-testid="popup-media-viewer"]'
    );

    let viewer = null;
    if (explicitViewer && !explicitViewer.closest('#main, #side, #fiscalizacampo-panel') && explicitViewer.id !== 'fiscalizacampo-panel') {
      viewer = explicitViewer;
    } else {
      // Procura por diálogo/modal fora do chat principal que tenha os botões típicos do visualizador
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[tabindex="-1"]'));
      for (const d of dialogs) {
        if (d.id === 'fiscalizacampo-panel' || d.closest('#fiscalizacampo-panel, #main, #side, div[data-testid="conversation-panel-wrapper"]')) continue;
        const hasViewerIndicators = Boolean(
          d.querySelector('div[data-testid="media-viewer-gallery"], span[data-icon="x-viewer"], button[data-testid="media-viewer-close"]') ||
          (d.querySelector('button[aria-label*="Fechar" i], span[data-icon="x"]') && d.querySelector('button[aria-label*="Anterior" i], span[data-icon="chevron-left"], button[aria-label*="Próximo" i], span[data-icon="chevron-right"]'))
        );
        if (hasViewerIndicators) {
          viewer = d;
          break;
        }
      }
    }

    // Se NÃO houver container do visualizador de tela cheia fora de #main, checa se há a régua de miniaturas
    if (!viewer) {
      const gallery = document.querySelector('div[data-testid="media-viewer-gallery"]');
      if (gallery && !gallery.closest('#main, #side, #fiscalizacampo-panel')) {
        viewer = gallery.closest('div[role="dialog"], div[tabindex="-1"], div[style*="z-index"]') || gallery.parentElement;
      }
    }

    // Se não encontrou viewer ou se o elemento estiver dentro do chat comum (#main), o visualizador NÃO está aberto!
    if (!viewer || viewer.closest('#main, #side, #fiscalizacampo-panel')) {
      return null;
    }

    // 1.0 Se este dialog for o popup de figurinha, fecha e descarta
    const vText = (viewer.innerText || '').toLowerCase();
    if (vText.includes('adicionar às favoritas') || vText.includes('add to favorites') || viewer.querySelector('div[data-testid="sticker-details"]')) {
      closeStickerModalIfOpen();
      return null;
    }

    // 1.1 É áudio no visualizador?
    const audio = viewer.querySelector('audio') || (viewer.querySelector('span[data-icon="audio-play"], span[data-icon="ptt-play"], span[data-icon="headset"]') ? viewer : null);
    if (audio) {
      return { viewer, img: null, isVideo: false, isAudio: true, audioEl: viewer.querySelector('audio') };
    }

    // 1.2 É vídeo no visualizador?
    const video = viewer.querySelector('video') || (viewer.querySelector('span[data-icon="media-play"], button[aria-label*="Reproduzir" i]') ? viewer : null);
    if (video) {
      return { viewer, img: null, isVideo: true, isAudio: false, videoEl: viewer.querySelector('video') };
    }

    // 1.3 É imagem aberta no modal de tela cheia? (Foto principal central, NUNCA miniaturas da régua)
    const mainPhoto = findMainViewerPhoto(viewer);
    if (mainPhoto) {
      return { viewer, img: mainPhoto, isVideo: false, isAudio: false };
    }

    // 1.4 Se o modal está aberto com a barra inferior ou controles, mas a imagem ainda está renderizando
    const galleryBar = viewer.querySelector('div[data-testid="media-viewer-gallery"]') || document.querySelector('div[data-testid="media-viewer-gallery"]');
    if (galleryBar || viewer.querySelector('span[data-icon="x-viewer"], button[data-testid="media-viewer-close"]')) {
      return { viewer, img: null, isVideo: false, isAudio: false, isPendingLoad: true };
    }

    return null;
  }

  /**
   * Localiza e abre a foto mais recente da conversa de forma 100% automática,
   * pulando vídeos, figurinhas (stickers), áudios, textos e PDFs com garantia total de não abrir os "Dados do contato".
   * Se na data atual (ex: hoje) não houver fotos, sobe ativamente a conversa até encontrar a foto mais recente válida.
   */
  async function openFirstChatPhotoAutomatically(targetDateEndInt = 99999999, targetDateLimitInt = 0) {
    closeStickerModalIfOpen();
    if (findActiveViewerElement()) return true;

    // Fecha gaveta lateral de contato caso esteja aberta
    closeContactInfoDrawerIfOpen();

    const mainChat = document.querySelector('#main');
    if (!mainChat) return false;

    const scrollContainer = findScrollContainer() || mainChat;
    const statusText = document.getElementById('fac-status-text');

    const findPhotoClickables = () => {
      // Procura imagens de mensagens do chat (incluindo álbuns 2x2 e fotos individuais)
      const allImgs = Array.from(mainChat.querySelectorAll(
        '.message-in img, .message-out img, div[role="row"] img, div[data-testid^="msg-"] img, div[data-testid="image-thumb"] img, div[data-testid="album"] img, div[data-id] img, div[data-testid="media-canvas"] img, div[role="button"] img, img'
      ));

      const items = [];
      for (const img of allImgs) {
        if (!img.src) continue;
        if (img.closest('#fiscalizacampo-panel') || img.closest('#fiscalizacampo-floating-btn')) continue;

        // Exclui estritamente avatares e fotos de perfil de contatos
        if (img.closest('div[class*="avatar"], div[role="button"][aria-label*="perfil" i], div[data-testid="avatar"], div[data-testid="chat-avatar"]')) continue;

        // Exclui estritamente figurinhas (stickers) do WhatsApp
        const isSticker = Boolean(
          img.closest('div[data-testid="sticker-thumb"], div[class*="sticker" i], div[data-testid="sticker-msg"]') ||
          (img.alt && (img.alt.toLowerCase().includes('sticker') || img.alt.toLowerCase().includes('figurinha'))) ||
          (img.getAttribute('data-plain-text') && img.getAttribute('data-plain-text').toLowerCase().includes('sticker')) ||
          img.closest('.message-in, .message-out, div[data-testid^="msg-"], div[role="row"]')?.querySelector('span[data-icon="star-btn"], button[aria-label*="favorit" i]')
        );
        if (isSticker) continue;

        // Pula miniaturas de vídeo
        const bubble = img.closest('.message-in, .message-out, div[data-testid^="msg-"], div[role="row"], div[data-id]');
        if (bubble) {
          const isVideoBubble = Boolean(
            bubble.querySelector('video, div[data-testid="video-thumb"], span[data-icon="media-play"], span[data-icon="video-pip"]')
          );
          if (isVideoBubble) continue;
        }

        const rect = img.getBoundingClientRect();
        // Fotos reais no WhatsApp têm dimensões a partir de 45px (álbuns 2x2 têm 65-80px, avatares têm 30 a 40px)
        if (rect.width >= 45 && rect.height >= 45 && img.src) {
          const thumbContainer = img.closest('div[role="button"], div[data-testid="media-canvas"], div[data-testid="image-thumb"]') || img.parentElement || img;
          items.push({ img, clickable: thumbContainer });
        }
      }
      return items;
    };

    // 1. Tenta abrir imediatamente se já houver fotos visíveis na tela
    let initialItems = findPhotoClickables();
    if (initialItems.length > 0) {
      for (let i = initialItems.length - 1; i >= 0; i--) {
        const item = initialItems[i];
        try { item.clickable.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
        await interruptibleSleep(100);

        dispatchFullClick(item.clickable);
        if (item.img && item.img !== item.clickable) {
          dispatchFullClick(item.img);
        }
        if (item.clickable.parentElement && item.clickable.parentElement !== mainChat) {
          dispatchFullClick(item.clickable.parentElement);
        }

        const opened = await waitForCondition(() => Boolean(findActiveViewerElement()), { timeoutMs: 2500, intervalMs: 80 });
        if (opened) {
          closeContactInfoDrawerIfOpen();
          return true;
        }
      }
    }

    // 2. Se NÃO houver fotos no rodapé (ex: hoje só teve áudios, textos e PDFs),
    // rola a conversa PARA CIMA de forma ágil e contínua até localizar a foto mais recente
    if (statusText) {
      statusText.textContent = 'Buscando fotos no chat (subindo mensagens de texto, áudio e PDF)...';
    }

    const MAX_SEARCH_STEPS = 250; // Cobre dezenas de milhares de pixels no histórico (200+ fotos e mensagens)
    for (let step = 0; step < MAX_SEARCH_STEPS; step++) {
      if (shouldStopScanning) break;

      closeContactInfoDrawerIfOpen();

      // Salto rápido de 1400px para cima
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - 1400);
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -1800, bubbles: true }));
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      clickOlderMessagesBanner();

      await interruptibleSleep(140);

      // Lê data visível atual
      const earliest = findEarliestVisibleDate();
      if (earliest) {
        const dInt = earliest.getFullYear() * 10000 + (earliest.getMonth() + 1) * 100 + earliest.getDate();
        updateLiveDateDisplay(formatDisplayDate(earliest));
        // Se já passou para trás da data limite inicial (ex: antes de 24/09), não continua subindo eternamente
        if (targetDateLimitInt > 0 && dInt < targetDateLimitInt) {
          break;
        }
      }

      const foundItems = findPhotoClickables();
      if (foundItems.length > 0) {
        if (statusText) {
          statusText.textContent = 'Foto localizada! Abrindo no visualizador de mídias...';
        }

        // Clica na foto mais recente deste bloco
        for (let i = foundItems.length - 1; i >= 0; i--) {
          const item = foundItems[i];
          try { item.clickable.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
          await interruptibleSleep(100);

          dispatchFullClick(item.clickable);
          if (item.img && item.img !== item.clickable) {
            dispatchFullClick(item.img);
          }

          const opened = await waitForCondition(() => Boolean(findActiveViewerElement()), { timeoutMs: 3000, intervalMs: 80 });
          if (opened) {
            closeContactInfoDrawerIfOpen();
            return true;
          }
        }
      }

      // Se bateu no topo absoluto da conversa e não encontrou mais fotos
      if (scrollContainer.scrollTop === 0 && isAtBeginningOfChat()) {
        break;
      }
    }

    closeContactInfoDrawerIfOpen();
    return Boolean(findActiveViewerElement());
  }

  /**
   * Interage ativamente com a régua/galeria de miniaturas horizontal na parte inferior do modal:
   * 1. Rola a barra horizontal para a esquerda (direção do passado)
   * 2. Clica em botões de download pendentes nas miniaturas
   * 3. Clica na miniatura não visitada mais à esquerda para forçar o carregamento de fotos de dias anteriores
   */
  function interactWithGalleryBar(visitedSrcs) {
    const galleryBar = document.querySelector('div[data-testid="media-viewer-gallery"], div[role="listbox"], div[class*="gallery"]');
    if (!galleryBar) return false;

    // 1. Rola a barra horizontal para a esquerda (mídias mais antigas)
    try {
      galleryBar.scrollLeft = Math.max(0, galleryBar.scrollLeft - 350);
    } catch (e) {}

    // 2. Dispara o download de mídias pendentes na régua inferior
    const downloadBtns = Array.from(galleryBar.querySelectorAll('div[data-testid="media-download-button"], span[data-icon="arrow-down"], span[data-icon="download"], button[aria-label*="Baixar" i], button[aria-label*="Download" i]'));
    for (const btn of downloadBtns) {
      const clickEl = btn.closest('button, div[role="button"]') || btn;
      try { clickEl.click(); } catch (e) {}
    }

    // 3. Localiza miniaturas não visitadas na régua horizontal
    const galleryImgs = Array.from(galleryBar.querySelectorAll('img')).filter((img) => {
      const src = img.src || '';
      return src && !visitedSrcs.has(src) && !img.closest('#fiscalizacampo-panel');
    });

    if (galleryImgs.length > 0) {
      // Clica na miniatura mais à esquerda para saltar dias sem fotos
      const targetThumb = galleryImgs[0];
      const clickEl = targetThumb.closest('div[role="button"], button') || targetThumb;
      try { clickEl.click(); } catch (e) {}
      return true;
    }

    return false;
  }

  /**
   * Se o visualizador abriu no início ou meio de um álbum/grupo de fotos na data final,
   * avança para a direita ('>' ou ArrowRight) até a ÚLTIMA foto mais recente do grupo/data final.
   */
  async function fastForwardToLastPhotoOfGroup(targetDateEndInt, rangeEndLabel) {
    const statusText = document.getElementById('fac-status-text');
    let steps = 0;
    const MAX_FORWARD_STEPS = 400; // Suporta grupos e álbuns extensos (250+ fotos)

    // Estratégia 1: Barra horizontal inferior de miniaturas do WhatsApp Web
    // Clica diretamente na miniatura mais à direita do lote visível para pular direto para a última foto
    try {
      const galleryBar = document.querySelector('div[data-testid="media-viewer-gallery"], div[role="listbox"], div[class*="gallery"]');
      if (galleryBar) {
        galleryBar.scrollLeft = 999999;
        await interruptibleSleep(120);

        const thumbs = Array.from(galleryBar.querySelectorAll('img')).filter((img) => img.src && !img.closest('#fiscalizacampo-panel'));
        if (thumbs.length > 1) {
          const lastThumb = thumbs[thumbs.length - 1];
          const clickTarget = lastThumb.closest('div[role="button"], button') || lastThumb;
          dispatchFullClick(clickTarget);
          await interruptibleSleep(300);
        }
      }
    } catch (e) {}

    // Estratégia 2: Avanço contínuo via botão '>' e ArrowRight até a última foto do grupo/dia
    while (steps < MAX_FORWARD_STEPS && !shouldStopScanning) {
      const active = findActiveViewerElement();
      if (!active || !active.img) break;

      const previousSrc = active.img.src;

      // Lê a data da foto atual: se já for de data posterior à final, não avança mais
      const headerInfo = getStrictViewerDateAndAuthor(active.viewer);
      if (headerInfo && headerInfo.date && targetDateEndInt > 0) {
        const y = headerInfo.date.getFullYear();
        const m = headerInfo.date.getMonth() + 1;
        const d = headerInfo.date.getDate();
        const curDateInt = y * 10000 + m * 100 + d;
        if (curDateInt > targetDateEndInt) {
          // Ultrapassou a data final estipulada
          break;
        }
      }

      if (statusText) {
        statusText.textContent = `Avançando para a última foto da data final... (${steps + 1})`;
      }

      // Clica em '>' e envia ArrowRight
      clickMediaViewerNextButton();
      dispatchArrowRight();

      // Aguarda imagem mudar com tolerância adequada a conexões e navegadores lentos
      const changed = await waitForCondition(() => {
        const cur = findActiveViewerElement();
        return Boolean(cur && cur.img && cur.img.src && cur.img.src !== previousSrc);
      }, { timeoutMs: 1400, intervalMs: 60 });

      if (!changed) {
        break; // Não mudou mais, alcançou a última foto do grupo
      }

      // Se após avançar, a nova foto ultrapassou a data final, retrocede 1 foto e encerra
      const newActive = findActiveViewerElement();
      const newHeader = getStrictViewerDateAndAuthor(newActive?.viewer);
      if (newHeader && newHeader.date && targetDateEndInt > 0) {
        const ny = newHeader.date.getFullYear();
        const nm = newHeader.date.getMonth() + 1;
        const nd = newHeader.date.getDate();
        const nDateInt = ny * 10000 + nm * 100 + nd;
        if (nDateInt > targetDateEndInt) {
          // Ultrapassou! Volta 1 foto para trás ('<')
          clickMediaViewerPreviousButton();
          dispatchArrowLeft();
          await interruptibleSleep(250);
          break;
        }
      }

      steps++;
      await interruptibleSleep(120);
    }
  }

  // =========================================================================
  // MODO 0 (NOVO): EXTRAÇÃO CONTÍNUA PELO VISUALIZADOR (ESTILO BAIXADOR WHATSAPP)
  // Ponto de partida na foto aberta, lê data exata no topo e avança automaticamente
  // =========================================================================
  async function runViewerContinuousScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, targetDateEndInt = 99999999, limitLabel = '', rangeEndLabel = '', maxPhotosLimit = 0) {
    const statusText = document.getElementById('fac-status-text');
    const progressFill = document.getElementById('fac-progress-fill');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');
    const prefixes = getPrefixesList();

    if (statusText) statusText.textContent = 'Conectando ao visualizador de mídias do WhatsApp...';

    let viewerData = findActiveViewerElement();

    // Se o visualizador não estiver aberto, tenta abrir a primeira foto visível de forma automática
    if (!viewerData) {
      if (statusText) statusText.textContent = 'Abrindo foto da conversa automaticamente...';
      await openFirstChatPhotoAutomatically(targetDateEndInt, targetDateLimitInt);
      viewerData = findActiveViewerElement();
    }

    // Se ainda não abriu, aguarda o usuário clicar em qualquer foto ou a interface carregar
    if (!viewerData && !shouldStopScanning) {
      if (statusText) {
        statusText.textContent = '👉 Abra qualquer foto da conversa para exibir a barra horizontal e iniciar a captura...';
      }
      viewerData = await waitForCondition(() => findActiveViewerElement(), { timeoutMs: 12000, intervalMs: 200 });
    }

    if (!viewerData) {
      if (statusText) statusText.textContent = 'Nenhuma foto aberta no visualizador. Abra uma foto e clique novamente em Iniciar!';
      const startBtn = document.getElementById('fac-btn-start-auto');
      const stopBtn = document.getElementById('fac-btn-stop');
      if (startBtn) startBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
      isScanning = false;
      return;
    }

    // Se abriu no meio ou no início de um grupo/álbum de fotos, avança para a ÚLTIMA foto da data final
    if (statusText) statusText.textContent = 'Posicionando na última foto da data final...';
    await fastForwardToLastPhotoOfGroup(targetDateEndInt, rangeEndLabel);

    let consecutiveUnchangedCount = 0;
    const MAX_UNCHANGED_ATTEMPTS = 18; // Tolerância estendida para ultrapassar dias sem foto ou carregamento de lote
    const NAVIGATION_PAUSE_MS = 400;   // Pausa de segurança configurável (entre 250ms e 800ms)
    const visitedSrcs = new Set();
    let stepCount = 0;
    let lastKnownPhotoDateObj = null;

    while (!shouldStopScanning) {
      if (maxPhotosLimit > 0 && photoAccumulator.size >= maxPhotosLimit) {
        finishReason = 'LIMIT_REACHED';
        if (statusText) statusText.textContent = `Limite configurado de ${maxPhotosLimit} fotos alcançado! Compactando...`;
        break;
      }

      stepCount++;
      if (progressFill) progressFill.style.width = `${Math.min(94, 8 + (stepCount % 86))}%`;

      // 1. Trata diálogo popup de imagem indisponível no celular se houver
      const dialogEl = Array.from(document.querySelectorAll('div[role="dialog"], div[data-testid="popup-contents"]')).find((d) => {
        if (d.id === 'fiscalizacampo-panel' || d.closest('#fiscalizacampo-panel') || d.closest('#fac-global-stop-bar')) return false;
        const txt = (d.innerText || d.textContent || '').toLowerCase();
        return (
          txt.includes('indisponível') ||
          txt.includes('não está mais no seu celular') ||
          txt.includes('não é possível abrir') ||
          txt.includes('falha ao baixar') ||
          txt.includes('download failed')
        );
      });

      if (dialogEl) {
        if (statusText) statusText.textContent = 'Foto indisponível no celular ignorada. Retrocedendo...';
        dismissErrorDialogs();
      }

      // 2. Obtém elemento do visualizador ativo
      const current = findActiveViewerElement();
      const currentImg = current ? current.img : null;
      const mediaViewer = current ? current.viewer : null;

      // Se o visualizador fechou REALMENTE durante a varredura (não há nenhum modal ativo)
      if (!current) {
        if (statusText) {
          statusText.textContent = '👉 Visualizador fechado. Clique em uma foto na conversa para retomar...';
        }
        const reopened = await waitForCondition(() => findActiveViewerElement(), { timeoutMs: 15000, intervalMs: 250 });
        if (!reopened) {
          finishReason = 'USER_STOPPED';
          break;
        }
        continue;
      }

      // Se for ÁUDIO no modal: NUNCA fecha e pula imediatamente para a mídia anterior ('<')
      if (current.isAudio) {
        if (statusText) {
          statusText.textContent = '🎵 Áudio detectado no modal — pulando para a foto anterior...';
        }

        // Lê a data do cabeçalho da mídia para atualizar a linha do tempo e checar a data limite
        const headerInfo = getStrictViewerDateAndAuthor(mediaViewer);
        if (headerInfo && headerInfo.dateStr) {
          updateLiveDateDisplay(headerInfo.dateStr);
        }
        if (headerInfo && headerInfo.date && targetDateLimitInt > 0) {
          const dy = headerInfo.date.getFullYear();
          const dm = headerInfo.date.getMonth() + 1;
          const dd = headerInfo.date.getDate();
          const dInt = dy * 10000 + dm * 100 + dd;
          if (dInt < targetDateLimitInt) {
            finishReason = 'DATE_REACHED';
            if (statusText) statusText.textContent = `Data limite alcançada (${headerInfo.dateStr})! Finalizando coleta...`;
            break;
          }
        }

        // Avança imediatamente para trás ('<')
        const clickedPrev = clickMediaViewerPreviousButton();
        if (!clickedPrev) {
          dispatchArrowLeft();
        }
        // Se houver régua de miniaturas, tenta clicar na próxima miniatura à esquerda
        interactWithGalleryBar(visitedSrcs);

        await interruptibleSleep(NAVIGATION_PAUSE_MS);
        continue;
      }

      // Se for VÍDEO no modal: NÃO coleta e pula imediatamente para a foto anterior ('<')
      if (current.isVideo) {
        if (statusText) {
          statusText.textContent = '🎬 Vídeo detectado no modal — pulando para a foto anterior...';
        }

        const headerInfo = getStrictViewerDateAndAuthor(mediaViewer);
        if (headerInfo && headerInfo.dateStr) {
          updateLiveDateDisplay(headerInfo.dateStr);
        }
        if (headerInfo && headerInfo.date && targetDateLimitInt > 0) {
          const dy = headerInfo.date.getFullYear();
          const dm = headerInfo.date.getMonth() + 1;
          const dd = headerInfo.date.getDate();
          const dInt = dy * 10000 + dm * 100 + dd;
          if (dInt < targetDateLimitInt) {
            finishReason = 'DATE_REACHED';
            if (statusText) statusText.textContent = `Data limite alcançada (${headerInfo.dateStr})! Finalizando coleta...`;
            break;
          }
        }

        const clickedPrev = clickMediaViewerPreviousButton();
        if (!clickedPrev) {
          dispatchArrowLeft();
        }
        interactWithGalleryBar(visitedSrcs);

        await interruptibleSleep(NAVIGATION_PAUSE_MS);
        continue;
      }

      // Se for outra mídia não fotográfica (ex: documento)
      if (!currentImg || !currentImg.src) {
        if (statusText) {
          statusText.textContent = '⏭️ Mídia não fotográfica no modal — pulando...';
        }
        const clickedPrev = clickMediaViewerPreviousButton();
        if (!clickedPrev) {
          dispatchArrowLeft();
        }
        interactWithGalleryBar(visitedSrcs);
        await interruptibleSleep(NAVIGATION_PAUSE_MS);
        continue;
      }

      if (currentImg && currentImg.src) {
        const mediaSrc = currentImg.src;

        // Extração e Deduplicação
        if (!visitedSrcs.has(mediaSrc)) {
          visitedSrcs.add(mediaSrc);

          // Leitura dos metadados e data/hora do cabeçalho do visualizador
          const headerInfo = getStrictViewerDateAndAuthor(mediaViewer);
          const captionEl = mediaViewer?.querySelector('div[data-testid="media-caption"], div[class*="caption"]');
          const captionText = (captionEl?.innerText || '').trim();

          const photoDate = headerInfo.date;
          if (photoDate && !isNaN(photoDate.getTime())) {
            lastKnownPhotoDateObj = photoDate;
          }

          let dateKey = '';
          let dateStr = '';
          let photoDateInt = 0;
          if (photoDate && !isNaN(photoDate.getTime())) {
            const yyyy = photoDate.getFullYear();
            const mm = String(photoDate.getMonth() + 1).padStart(2, '0');
            const dd = String(photoDate.getDate()).padStart(2, '0');
            dateKey = `${yyyy}${mm}${dd}`;
            dateStr = `${dd}/${mm}/${yyyy}`;
            photoDateInt = yyyy * 10000 + (photoDate.getMonth() + 1) * 100 + photoDate.getDate();
            
            // Atualiza DATA LIDA (Data atual em exibição no modal)
            updateLiveDateDisplay(dateStr);
          }

          // Verificação de parada por Data Limite configurada (Data Inicial mais antiga)
          if (photoDate && targetDateLimitInt > 0) {
            if (photoDateInt < targetDateLimitInt) {
              finishReason = 'DATE_REACHED';
              if (statusText) statusText.textContent = `Data limite alcançada (${dateStr})! Finalizando coleta...`;
              break; // Interrompe o loop automaticamente ao ultrapassar a data limite
            }
          }

          // Verificação se a foto é mais recente que a Data Final (Partida da Coleta)
          const isNewerThanEnd = (photoDate && targetDateEndInt > 0 && photoDateInt > targetDateEndInt);

          if (isNewerThanEnd) {
            if (statusText) {
              statusText.textContent = `Avançando: foto de ${dateStr} posterior à data de partida (${rangeEndLabel || 'limite'})...`;
            }
          } else {
            // 1. Prioridade Máxima: Extração Direta da Mídia Bruta do WhatsApp (arquivo original da câmera sem perdas)
            let blob = null;
            let dims = { width: 0, height: 0 };
            let isRealHd = false;

            const viewerMsgId =
              currentImg.getAttribute('data-id') ||
              currentImg.closest('[data-id]')?.getAttribute('data-id') ||
              mediaViewer?.querySelector('div[aria-selected="true"] [data-id], div[class*="selected"] [data-id]')?.getAttribute('data-id') ||
              mediaViewer?.querySelector('[data-id]')?.getAttribute('data-id');

            if (viewerMsgId) {
              try {
                const direct = await requestResolveMedia(viewerMsgId);
                if (direct && direct.blob && direct.blob.size >= 10000) {
                  blob = direct.blob;
                  dims = await getImageDimensionsFromBlob(blob);
                  isRealHd = (dims.width >= 500 || dims.height >= 500 || blob.size >= 35000);
                }
              } catch (e) {}
            }

            // 2. Extração via Blob decodificado do DOM com espera de alta resolução completa
            if (!blob) {
              // Se a foto no centro ainda estiver em preview intermediário, aguarda carregar a resolução máxima
              if (currentImg && (!currentImg.complete || (currentImg.naturalWidth < 600 && currentImg.naturalHeight < 600))) {
                await waitForCondition(() => {
                  const p = findMainViewerPhoto(mediaViewer || document.body);
                  return Boolean(p && p.complete && (p.naturalWidth >= 600 || p.naturalHeight >= 600));
                }, { timeoutMs: 1600, intervalMs: 60 });
              }

              const bestPhoto = findMainViewerPhoto(mediaViewer || document.body) || currentImg;
              const photoSrc = bestPhoto.src || mediaSrc;

              blob = await fetchBlobDirectly(photoSrc);
              if (blob) {
                dims = await getImageDimensionsFromBlob(blob);
              }

              // Se o blob direto for pequeno ou o canvas conseguir maior fidelidade da imagem renderizada
              if (!blob || blob.size < 3500 || (bestPhoto.naturalWidth > 0 && bestPhoto.naturalWidth > dims.width)) {
                const canvasBlob = await captureImageViaCanvas(bestPhoto);
                if (canvasBlob && (!blob || canvasBlob.size > blob.size || (bestPhoto.naturalWidth > dims.width))) {
                  blob = canvasBlob;
                  dims = await getImageDimensionsFromBlob(blob);
                }
              }

              isRealHd = (dims.width >= 500 || dims.height >= 500 || (blob && blob.size >= 30000));
            }

            if (blob && (blob.size >= 3500 || dims.width > 150 || dims.height > 150)) {
              const photoKey = `view_img_${mediaSrc.replace(/^blob:[^/]+\//, '').slice(-32)}_${photoAccumulator.size}`;

              await TempBlobStorage.store(photoKey, blob);

              const rawTextContext = captionText || headerInfo.rawHeader || 'Foto WhatsApp';
              const meta = extractMetadataFromText(rawTextContext, mediaViewer || document.body, prefixes);
              if (dateKey) {
                meta.dateKey = dateKey;
                meta.dateStr = dateStr;
                meta.dateObj = photoDate;
              }

              photoAccumulator.set(photoKey, {
                key: photoKey,
                meta,
                rawText: rawTextContext,
                isHd: isRealHd,
                isThumbnail: !isRealHd,
                resolutionCategory: isRealHd ? 'Alta Resolução (Visualizador WhatsApp)' : 'Média Resolução',
                size: blob.size,
                width: dims.width,
                height: dims.height,
                timestamp: photoDate ? photoDate.getTime() : Date.now(),
                cappedAlbum: false,
                blob: blob,
              });

              // Atualiza ÚLTIMA FOTO (Representando a data MAIS ANTIGA coletada/baixada)
              const capturedDate = photoDate || meta?.dateObj;
              if (capturedDate) {
                updateLastPhotoDateDisplay(capturedDate);
              } else if (meta?.dateStr) {
                updateLastPhotoDateDisplay(meta.dateStr);
              }

              if (statPhotos) statPhotos.textContent = String(photoAccumulator.size);
              if (stopCount) stopCount.textContent = String(photoAccumulator.size);
              if (floatingCount) floatingCount.textContent = String(photoAccumulator.size);
              const limitDisplay = maxPhotosLimit > 0 ? ` / ${maxPhotosLimit}` : '';
              if (statusText) statusText.textContent = `Visualizador: ${photoAccumulator.size}${limitDisplay} fotos | Data: ${dateStr || 'Detectando...'}`;
            }
          }
        }
      }

      if (shouldStopScanning) break;

      // 3. NAVEGAÇÃO ROBUSTA PARA A FOTO ANTERIOR (DIREÇÃO AO PASSADO)
      const previousSrc = currentImg ? currentImg.src : '';

      // Camada 1: Clica no botão '<' da lateral esquerda da tela (detecção por seletor e coordenadas físicas)
      clickMediaViewerPreviousButton();

      // Camada 2: Disparo sintético de teclado ArrowLeft em múltiplos nós
      dispatchArrowLeft();

      // Sincronização por carregamento de nó: Promise assíncrona que aguarda a alteração efetiva da imagem principal (src)
      const imageChanged = await waitForCondition(() => {
        const active = findActiveViewerElement();
        return Boolean(active && active.img && active.img.src && active.img.src !== previousSrc);
      }, { timeoutMs: 1200, intervalMs: 50 });

      if (imageChanged) {
        consecutiveUnchangedCount = 0;
      } else {
        consecutiveUnchangedCount++;

        // Se ainda há data limite configurada e a foto atual ainda NÃO atingiu essa data limite,
        // força a busca e interação com a barra horizontal antes de desistir
        if (statusText) {
          statusText.textContent = `Avançando galeria para ultrapassar dias sem foto... (${consecutiveUnchangedCount}/${MAX_UNCHANGED_ATTEMPTS})`;
        }

        // Tenta desengasgar o carregamento clicando em miniaturas da régua inferior
        interactWithGalleryBar(visitedSrcs);

        // Verifica se a seta da esquerda do modal está desabilitada de forma definitiva
        const prevBtn = document.querySelector(
          'button[aria-label*="Anterior" i], div[data-testid="media-viewer-prev"], button[data-testid="media-viewer-prev"], span[data-icon="chevron-left"]'
        );
        const isPrevDisabled = prevBtn && (prevBtn.hasAttribute('disabled') || prevBtn.getAttribute('aria-disabled') === 'true');

        // Checa se a data conhecida mais recente já ultrapassou a data limite
        let isDateLimitReached = false;
        if (lastKnownPhotoDateObj && targetDateLimitInt > 0) {
          const dateInt = lastKnownPhotoDateObj.getFullYear() * 10000 + (lastKnownPhotoDateObj.getMonth() + 1) * 100 + lastKnownPhotoDateObj.getDate();
          if (dateInt < targetDateLimitInt) {
            isDateLimitReached = true;
          }
        }

        if (isDateLimitReached) {
          finishReason = 'DATE_REACHED';
          if (statusText) statusText.textContent = `Data limite alcançada! Finalizando coleta...`;
          break;
        }

        // Se atingiu o limite de tentativas sem mudança E a seta está desativada E não há mais miniaturas pendentes
        if (consecutiveUnchangedCount >= MAX_UNCHANGED_ATTEMPTS && isPrevDisabled) {
          finishReason = 'END_OF_CHAT';
          if (statusText) statusText.textContent = 'Fim das fotos disponíveis no modal.';
          break;
        }
      }

      // Pausa de segurança configurável (entre 250ms e 800ms) entre os comandos de navegação
      await interruptibleSleep(NAVIGATION_PAUSE_MS);
    }

    dismissUnwantedModals();
    await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
  }

  // =========================================================================
  // MODO 1: VARREDURA NO CHAT
  // =========================================================================
  async function runChatScan(groupName, prefixes, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, limitLabel, maxPhotosLimit) {
    const statusText = document.getElementById('fac-status-text');
    const progressFill = document.getElementById('fac-progress-fill');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');

    const limitMsg = maxPhotosLimit > 0 ? ` (Limite: ${maxPhotosLimit} fotos)` : ' (Sem limite de fotos)';
    statusText.textContent = `Iniciando varredura até ${limitLabel}${limitMsg}...`;

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      alert('Não foi possível identificar o painel de mensagens do WhatsApp. Certifique-se de que a conversa está aberta.');
      finishReason = 'ERROR';
      await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
      return;
    }

    await expandVisibleAlbums(prefixes);
    await collectVisiblePhotos(prefixes);
    statPhotos.textContent = String(photoAccumulator.size);
    stopCount.textContent = String(photoAccumulator.size);
    if (floatingCount) floatingCount.textContent = String(photoAccumulator.size);

    const initialEarliest = findEarliestVisibleDate();
    if (initialEarliest) {
      minDateReached = initialEarliest;
      updateLiveDateDisplay(formatDisplayDate(minDateReached));
    }

    let consecutiveStagnantSteps = 0;
    let step = 0;

    const getVisibleMessageAnchors = () => {
      const msgs = scrollContainer.querySelectorAll('.message-in, .message-out, div[data-testid^="msg-"]');
      return Array.from(msgs).map((el) => el.getAttribute('data-id') || el.innerText?.slice(0, 30)).filter(Boolean);
    };

    while (!shouldStopScanning) {
      if (maxPhotosLimit > 0 && photoAccumulator.size >= maxPhotosLimit) {
        finishReason = 'LIMIT_REACHED';
        statusText.textContent = `Limite configurado de ${maxPhotosLimit} fotos alcançado com sucesso! Compactando...`;
        break;
      }

      step++;
      progressFill.style.width = `${Math.min(94, 8 + (step % 86))}%`;

      dismissUnwantedModals();

      // Expande todos os álbuns visíveis em TODOS os passos (não apenas a cada 3)
      await expandVisibleAlbums(prefixes);
      if (shouldStopScanning) break;

      clickOlderMessagesBanner();

      const beforeAnchors = new Set(getVisibleMessageAnchors());

      // Rolagem suave e controlada para dar tempo à lista virtualizada do WhatsApp montar mídias
      const currentScrollTop = scrollContainer.scrollTop;
      scrollContainer.scrollTop = Math.max(0, currentScrollTop - 550);
      scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -650, bubbles: true }));
      scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

      const anchorsChanged = await waitForCondition(() => {
        const currentAnchors = getVisibleMessageAnchors();
        return currentAnchors.some((a) => !beforeAnchors.has(a));
      }, { timeoutMs: 1600, intervalMs: 80 });

      if (shouldStopScanning) break;

      const newlyAdded = await collectVisiblePhotos(prefixes);
      statPhotos.textContent = String(photoAccumulator.size);
      stopCount.textContent = String(photoAccumulator.size);
      if (floatingCount) floatingCount.textContent = String(photoAccumulator.size);

      const earliestDate = findEarliestVisibleDate();
      if (earliestDate) {
        if (!minDateReached || earliestDate < minDateReached) {
          minDateReached = earliestDate;
          updateLiveDateDisplay(formatDisplayDate(minDateReached));
        }

        const yr = earliestDate.getFullYear();
        const earliestDateInt = yr * 10000 + (earliestDate.getMonth() + 1) * 100 + earliestDate.getDate();

        if (targetDateLimitInt > 0 && earliestDateInt < targetDateLimitInt) {
          finishReason = 'DATE_REACHED';
          statusText.textContent = `Data limite alcançada (${formatDisplayDate(earliestDate)})! Compactando ${photoAccumulator.size} fotos...`;
          break;
        }
      }

      if (isAtBeginningOfChat()) {
        finishReason = 'END_OF_CHAT';
        statusText.textContent = 'Início absoluto da conversa alcançado!';
        break;
      }

      if (!anchorsChanged && newlyAdded === 0) {
        consecutiveStagnantSteps++;
        statusText.textContent = `Aguardando carregamento de mensagens antigas... (${consecutiveStagnantSteps}/20)`;

        if (consecutiveStagnantSteps % 3 === 0) {
          clickOlderMessagesBanner();
          scrollContainer.scrollTop = 350;
          await interruptibleSleep(100);
          scrollContainer.scrollTop = 0;
          scrollContainer.dispatchEvent(new WheelEvent('wheel', { deltaY: -2200, bubbles: true }));
          scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
        }

        if (consecutiveStagnantSteps >= 20) {
          finishReason = 'TIMEOUT_STAGNANT';
          statusText.textContent = 'Fim provável do histórico disponível sincronizado.';
          break;
        }
      } else {
        consecutiveStagnantSteps = 0;
        const limitDisplay = maxPhotosLimit > 0 ? ` / ${maxPhotosLimit}` : '';
        statusText.textContent = `Lendo ${currentDateReading} | ${photoAccumulator.size}${limitDisplay} fotos coletadas`;
      }
    }

    await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
  }

  // =========================================================================
  // MODO 2: EXTRAÇÃO PELA GALERIA DE MÍDIAS
  // =========================================================================
  async function runGalleryScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, limitLabel, maxPhotosLimit) {
    const statusText = document.getElementById('fac-status-text');
    const progressFill = document.getElementById('fac-progress-fill');
    const stopCount = document.getElementById('fac-stop-count');
    const floatingCount = document.getElementById('fac-floating-count');
    const statPhotos = document.getElementById('fac-stat-photos');

    statusText.textContent = 'Abrindo Painel de Mídias do WhatsApp Web...';

    let galleryContainer = document.querySelector('div[data-testid="media-gallery-section"], div[data-testid="media-grid"]');

    if (!galleryContainer) {
      const header = document.querySelector('#main header, div[data-testid="conversation-header"]');
      if (header) {
        header.click();
        await interruptibleSleep(600);
      }

      const mediaLinksDocCandidate = Array.from(document.querySelectorAll('span, div, button')).find((el) => {
        const t = (el.textContent || '').trim().toLowerCase();
        return (t.includes('mídias, links e docs') || t.includes('media, links and docs') || (t.includes('mídia') && t.includes('links'))) && el.offsetParent !== null;
      });

      if (mediaLinksDocCandidate) {
        const clickTarget = mediaLinksDocCandidate.closest('div[role="button"], button') || mediaLinksDocCandidate;
        clickTarget.click();
        await interruptibleSleep(800);
      }
    }

    let mediaScroll = findGalleryScrollContainer();

    if (!mediaScroll) {
      statusText.textContent = 'Galeria não aberta. Alternando para o modo conversa com álbuns...';
      await interruptibleSleep(1000);
      await runChatScan(groupName, getPrefixesList(), structure, userEmpresa, userArea, userEquipe, namingPattern, targetDateLimitInt, limitLabel, maxPhotosLimit);
      return;
    }

    statusText.textContent = 'Galeria conectada! Extraindo acervo com identificação estável...';
    let galleryStep = 0;
    let stagnantCount = 0;
    let lastAccumulatorCount = 0;

    const getVisibleGalleryImageSources = () => {
      const imgs = mediaScroll.querySelectorAll('img');
      return Array.from(imgs).map((img) => img.src).filter(Boolean);
    };

    while (!shouldStopScanning) {
      if (maxPhotosLimit > 0 && photoAccumulator.size >= maxPhotosLimit) {
        finishReason = 'LIMIT_REACHED';
        statusText.textContent = `Limite configurado de ${maxPhotosLimit} fotos atingido! Concluindo...`;
        break;
      }

      galleryStep++;
      progressFill.style.width = `${Math.min(94, 10 + (galleryStep % 84))}%`;

      const gridImgs = Array.from(mediaScroll.querySelectorAll('img')).filter((img) => {
        const src = img.src || '';
        return src.startsWith('blob:') || src.startsWith('data:image') || src.includes('.whatsapp.net');
      });

      const dateHeaders = Array.from(mediaScroll.querySelectorAll('span, div, h3')).filter((el) => {
        const txt = (el.textContent || '').trim();
        return parseDateDividerText(txt) !== null && el.offsetWidth > 0;
      });

      for (let i = 0; i < gridImgs.length; i++) {
        if (shouldStopScanning) break;
        if (maxPhotosLimit > 0 && photoAccumulator.size >= maxPhotosLimit) break;

        const img = gridImgs[i];
        const rect = img.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        let imgDate = null;
        let closestDateHeader = null;
        for (const dh of dateHeaders) {
          const dhRect = dh.getBoundingClientRect();
          if (dhRect.top < rect.top) {
            closestDateHeader = dh;
          }
        }
        if (closestDateHeader) {
          const parsed = parseDateDividerText(closestDateHeader.textContent);
          if (parsed) imgDate = parsed;
        }

        const dateYMD = imgDate ? formatDateToYMD(imgDate).replace(/-/g, '') : '';
        const dateFormatted = imgDate ? formatDisplayDate(imgDate) : '';

        if (targetDateLimitInt > 0 && imgDate) {
          const imgDateInt = imgDate.getFullYear() * 10000 + (imgDate.getMonth() + 1) * 100 + imgDate.getDate();
          if (imgDateInt < targetDateLimitInt) {
            finishReason = 'DATE_REACHED';
            shouldStopScanning = true;
            statusText.textContent = `Data limite alcançada (${dateFormatted})!`;
            break;
          }
        }

        const photoKey = getStableGalleryMediaId(img, dateYMD);
        if (!photoKey || photoAccumulator.has(photoKey)) continue;

        let blob = null;
        let dims = { width: img.naturalWidth || 0, height: img.naturalHeight || 0 };
        let isRealHd = false;
        let resolutionCategory = 'Resolução não verificada / Miniatura';

        // 1. Tenta extração direta se o elemento contiver data-id da mensagem
        const galMsgId = img.getAttribute('data-id') || img.closest('[data-id]')?.getAttribute('data-id');
        if (galMsgId) {
          const directMedia = await requestResolveMedia(galMsgId);
          if (directMedia && directMedia.blob && directMedia.blob.size >= 600) {
            blob = directMedia.blob;
            dims = await getImageDimensionsFromBlob(blob);
            isRealHd = (dims.width >= 600 || dims.height >= 600 || blob.size >= 40000);
            resolutionCategory = 'Alta Resolução (Extração Direta WhatsApp)';
          }
        }

        // 2. Fallback: fetch da URL blob exibida
        if (!blob) {
          blob = await fetchBlobDirectly(img.src);
          if (blob && blob.size >= 600) {
            dims = await getImageDimensionsFromBlob(blob);
            if (dims.width >= 600 || dims.height >= 600 || blob.size >= 50000) {
              isRealHd = true;
              resolutionCategory = 'Alta Resolução (Galeria)';
            } else if (dims.width >= 350 || dims.height >= 350 || blob.size >= 25000) {
              resolutionCategory = 'Média Resolução (Galeria)';
            }
          }
        }

        // 3. Fallback: visualizador nativo se necessário
        if (!isRealHd && !blob) {
          const clickable = img.closest('div[role="button"], button') || img;
          const captured = await captureRealHdFromViewer(clickable);
          if (captured && captured.blob) {
            blob = captured.blob;
            dims = { width: captured.width, height: captured.height };
            isRealHd = captured.isHd;
            resolutionCategory = captured.resolutionCategory;
          }
        }

        if (blob && blob.size >= 600) {
          await TempBlobStorage.store(photoKey, blob);

          photoAccumulator.set(photoKey, {
            key: photoKey,
            meta: {
              item: 'GERAL',
              areaFrente: 'GERAL',
              km: '',
              rodovia: '',
              empresa: '',
              equipe: '',
              dateKey: dateYMD,
              dateStr: dateFormatted,
              dateObj: imgDate,
            },
            rawText: dateFormatted ? `Foto Galeria WhatsApp ${dateFormatted}` : 'Foto Galeria WhatsApp',
            isHd: isRealHd,
            isThumbnail: !isRealHd,
            resolutionCategory,
            size: blob.size,
            width: dims.width,
            height: dims.height,
            timestamp: Date.now(),
            cappedAlbum: false,
            blob: blob,
          });

          if (dateFormatted) {
            updateLastPhotoDateDisplay(dateFormatted);
          }
        }
      }

      statPhotos.textContent = String(photoAccumulator.size);
      stopCount.textContent = String(photoAccumulator.size);
      if (floatingCount) floatingCount.textContent = String(photoAccumulator.size);

      const beforeImgs = new Set(getVisibleGalleryImageSources());

      mediaScroll.scrollTop += 650;
      mediaScroll.dispatchEvent(new WheelEvent('wheel', { deltaY: 850, bubbles: true }));
      mediaScroll.dispatchEvent(new Event('scroll', { bubbles: true }));

      const newImagesRendered = await waitForCondition(() => {
        const currentImgs = getVisibleGalleryImageSources();
        return currentImgs.some((s) => !beforeImgs.has(s));
      }, { timeoutMs: 1200, intervalMs: 80 });

      if (photoAccumulator.size === lastAccumulatorCount && !newImagesRendered) {
        stagnantCount++;
        statusText.textContent = `Aguardando carregamento da galeria... (${stagnantCount}/12)`;
        if (stagnantCount >= 12) {
          finishReason = 'END_OF_CHAT';
          statusText.textContent = 'Fim das mídias disponíveis na Galeria.';
          break;
        }
      } else {
        stagnantCount = 0;
        lastAccumulatorCount = photoAccumulator.size;
        statusText.textContent = `Galeria: ${photoAccumulator.size} fotos identificadas...`;
      }
    }

    await finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern);
  }

  // Helper para acionar download direto do arquivo ZIP
  async function triggerZipDownloadViaServiceWorker(zipBlob, safeZipName) {
    fallbackDomDownload(zipBlob, safeZipName);
    return true;
  }

  function fallbackDomDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    setTimeout(() => {
      downloadLink.remove();
      URL.revokeObjectURL(url);
    }, 10000);
  }

  // =========================================================================
  // PONTO 2: FINALIZAÇÃO COM LIBERAÇÃO EFETIVA DE MEMÓRIA (INDEXEDDB & BATCH FLUSH)
  // =========================================================================
  async function finishScan(groupName, structure, userEmpresa, userArea, userEquipe, namingPattern) {
    const elapsedSeconds = stopScanTimer();
    const timeFormatted = formatElapsedTime(elapsedSeconds);
    const timeVerbose = formatElapsedTimeVerbose(elapsedSeconds);

    const progressFill = document.getElementById('fac-progress-fill');
    const statusText = document.getElementById('fac-status-text');
    const startBtn = document.getElementById('fac-btn-start-auto');
    const runningActions = document.getElementById('fac-running-actions');
    const stopBtn = document.getElementById('fac-btn-stop');

    if (runningActions) runningActions.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
    const idleActions = document.getElementById('fac-idle-actions');
    if (idleActions) idleActions.classList.remove('hidden');

    if (finishReason === 'USER_CANCELLED_NO_DOWNLOAD') {
      if (statusText) statusText.textContent = '⏹️ Varredura cancelada pelo usuário. Nenhum arquivo foi baixado.';
      if (startBtn) startBtn.classList.remove('hidden');
      if (idleActions) idleActions.classList.remove('hidden');
      if (progressFill) progressFill.style.width = '0%';
      isScanning = false;
      return;
    }

    if (progressFill) progressFill.style.width = '92%';

    try {
      const finalPhotoList = Array.from(photoAccumulator.values());

      if (finalPhotoList.length === 0) {
        if (statusText) statusText.textContent = `Nenhuma foto encontrada (${timeVerbose} de busca).`;
        if (startBtn) startBtn.classList.remove('hidden');
        isScanning = false;
        return;
      }

      if (statusText) statusText.textContent = `Empacotando ${finalPhotoList.length} fotos (${timeVerbose} decorridos)...`;
      await ensureLibrariesLoaded();

      const finalJSZip = window.JSZip || (typeof JSZip !== 'undefined' ? JSZip : null);
      if (!finalJSZip) {
        alert('Não foi possível carregar a biblioteca JSZip. Verifique a instalação da extensão.');
        if (startBtn) startBtn.classList.remove('hidden');
        isScanning = false;
        return;
      }

      const localNow = new Date();
      const todayLocal = formatDateToYMD(localNow).replace(/-/g, '');

      const defaultEmpresa = userEmpresa || 'EMPRESA';
      const defaultArea = userArea || 'AREA';

      const allRecords = [];
      const countPerPrefix = new Map();

      for (let idx = 0; idx < finalPhotoList.length; idx++) {
        const item = finalPhotoList[idx];
        const itemMeta = item?.meta || {};
        const isDateValid = Boolean(itemMeta.dateKey && itemMeta.dateKey.length === 8 && itemMeta.dateKey !== 'SEM_DATA' && !isNaN(Number(itemMeta.dateKey)));
        const photoDateKey = isDateValid ? itemMeta.dateKey : 'SEM_DATA';
        const photoDateFormatted = isDateValid ? itemMeta.dateStr : 'Não identificada';

        const fotoEmpresa = userEmpresa || itemMeta.empresa || defaultEmpresa;
        const fotoGrupo = groupName || 'GRUPO';

        const safeEmpresa = sanitizeForFilename(fotoEmpresa, 'EMPRESA');
        const safeGrupo = sanitizeForFilename(fotoGrupo, 'CONVERSA');

        const seqKey = `${safeEmpresa}_${safeGrupo}_${photoDateKey}`;
        const currentSeq = (countPerPrefix.get(seqKey) || 0) + 1;
        countPerPrefix.set(seqKey, currentSeq);

        const seq = String(currentSeq).padStart(3, '0');

        // Nome do arquivo com base na hierarquia EMPRESA_CONVERSA_DATA_SEQ
        let fileName = `${safeEmpresa}_${safeGrupo}_${photoDateKey}_${seq}.jpg`;
        if (item.isUnavailable) {
          fileName = `INDISPONIVEL_${safeEmpresa}_${safeGrupo}_${photoDateKey}_${seq}.jpg`;
        }
        // Pasta organizada DIRETAMENTE pelas pastas das datas na raiz do ZIP, sem pastas intermediárias
        let folderPath = photoDateKey;

        allRecords.push({
          key: item.key,
          Arquivo: fileName,
          Pasta: folderPath,
          Empresa: fotoEmpresa,
          Conversa: fotoGrupo,
          'Data Postagem': photoDateFormatted,
          Resolucao: item.resolutionCategory || 'Resolução não verificada / Miniatura',
          Dimensoes: item.width && item.height ? `${item.width}x${item.height} px` : 'Mídia Indisponível',
          Tamanho_KB: Math.round((item.size || 0) / 1024),
          fallbackBlob: item.blob,
        });
      }

      const totalBatches = Math.ceil(allRecords.length / MAX_PHOTOS_PER_ZIP_BATCH);
      let batchesSuccessfullyDownloaded = 0;

      for (let b = 0; b < totalBatches; b++) {
        const batchRecords = allRecords.slice(b * MAX_PHOTOS_PER_ZIP_BATCH, (b + 1) * MAX_PHOTOS_PER_ZIP_BATCH);
        const batchNum = b + 1;
        const batchSuffix = totalBatches > 1 ? `_Parte_${batchNum}_de_${totalBatches}` : '';

        if (statusText) statusText.textContent = `Compactando lote ${batchNum} de ${totalBatches} (${batchRecords.length} fotos)...`;

        let zip = new finalJSZip();

        // Carrega no JSZip os blobs do lote atual
        for (const rec of batchRecords) {
          let blob = null;
          if (TempBlobStorage.isAvailable()) {
            try {
              blob = await TempBlobStorage.retrieve(rec.key);
            } catch (e) {}
          }
          if (!blob) {
            blob = rec.fallbackBlob;
          }

          if (blob) {
            zip.file(`${rec.Pasta}/${rec.Arquivo}`, blob);
          }
        }

        // Adiciona a planilha Excel do lote contendo estritamente as colunas solicitadas
        try {
          if (window.XLSX) {
            const excelData = batchRecords.map((r) => ({
              Empresa: r.Empresa,
              Conversa: r.Conversa,
              'Data Postagem': r['Data Postagem'],
              Resolucao: r.Resolucao,
              Dimensoes: r.Dimensoes,
              Tamanho_KB: r.Tamanho_KB,
            }));
            const ws = window.XLSX.utils.json_to_sheet(excelData);
            const wb = window.XLSX.utils.book_new();
            window.XLSX.utils.book_append_sheet(wb, ws, 'Indice_Fotos');
            const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const xlsxName = totalBatches > 1 ? `INDICE_CAMPOS_Parte_${batchNum}.xlsx` : 'INDICE_E_CONFERENCIA_CAMPOS.xlsx';
            zip.file(xlsxName, wbout);
          }
        } catch (e) {
          console.warn('[Conserva_Fotos] Erro ao anexar planilha XLSX:', e);
        }

        try {
          const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
          const safeEmpresaClean = sanitizeForFilename(defaultEmpresa, 'EMPRESA');
          const safeGrupoClean = sanitizeForFilename(groupName, 'Conversa');

          // Formatação das Datas Inicial e Final para o nome do arquivo ZIP
          const dateLimitInput = document.getElementById('fac-date-limit');
          const dateEndInput = document.getElementById('fac-date-end');
          const dateAllCheck = document.getElementById('fac-date-all');

          const formatInputDate = (val) => {
            if (!val) return '';
            const p = val.split('-');
            if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`; // DD-MM-AAAA
            return val.replace(/[^0-9a-zA-Z]/g, '');
          };

          const startStr = (!dateAllCheck || !dateAllCheck.checked) && dateLimitInput && dateLimitInput.value
            ? formatInputDate(dateLimitInput.value)
            : 'Inicio';
          const endStr = dateEndInput && dateEndInput.value
            ? formatInputDate(dateEndInput.value)
            : formatInputDate(formatDateToYMD(new Date()));

          let dateRangePart = '';
          if (startStr === 'Inicio') {
            dateRangePart = `_Ate_${endStr}`;
          } else if (startStr === endStr) {
            dateRangePart = `_${startStr}`;
          } else {
            dateRangePart = `_${startStr}_a_${endStr}`;
          }

          const safeZipName = `Fotos_Whats_${safeEmpresaClean}_${safeGrupoClean}${dateRangePart}${batchSuffix}.zip`;

          await triggerZipDownloadViaServiceWorker(zipBlob, safeZipName);

          batchesSuccessfullyDownloaded++;

          // =====================================================================
          // LIBERAÇÃO EFETIVA DE MEMÓRIA:
          // Exclui os blobs deste lote do IndexedDB e apaga referências do mapa imediatamente
          // =====================================================================
          for (const rec of batchRecords) {
            if (TempBlobStorage.isAvailable()) {
              try { await TempBlobStorage.remove(rec.key); } catch(e) {}
            }
            rec.fallbackBlob = null;
            photoAccumulator.delete(rec.key);
          }

          zip = null;

        } catch (err) {
          console.error('[Conserva_Fotos] Falha ao gerar arquivo ZIP:', err);
          if (statusText) statusText.textContent = `Erro ao compactar lote ${batchNum}: ${err.message}`;
          if (startBtn) startBtn.classList.remove('hidden');
          isScanning = false;
          return;
        }

        if (totalBatches > 1 && b < totalBatches - 1) {
          await interruptibleSleep(600);
        }
      }

      // Limpa qualquer resíduo restante do IndexedDB
      try { await TempBlobStorage.clear(); } catch(e) {}

      if (progressFill) progressFill.style.width = '100%';

      const batchInfo = totalBatches > 1 ? ` em ${batchesSuccessfullyDownloaded} arquivos ZIP divididos` : '';
      let statusMsg = '';

      if (finishReason === 'USER_STOPPED') {
        statusMsg = `⏹️ Coleta interrompida: ${allRecords.length} fotos salvas em ${timeVerbose}${batchInfo} com planilha Excel.`;
      } else if (finishReason === 'LIMIT_REACHED') {
        statusMsg = `ℹ️ Limite atingido: ${allRecords.length} fotos salvas em ${timeVerbose}${batchInfo} com planilha Excel.`;
      } else if (finishReason === 'DATE_REACHED') {
        statusMsg = `📅 Data limite alcançada: ${allRecords.length} fotos salvas em ${timeVerbose}${batchInfo} com planilha Excel.`;
      } else if (finishReason === 'TIMEOUT_STAGNANT') {
        statusMsg = `⏱️ Histórico sincronizado concluído (Watchdog 15s): ${allRecords.length} fotos salvas em ${timeVerbose}${batchInfo} com planilha Excel.`;
      } else {
        statusMsg = `✅ Coleta concluída! ${allRecords.length} fotos salvas em ${timeVerbose}${batchInfo} com planilha Excel.`;
      }

      if (albumCeilingWarnings.length > 0) {
        statusMsg += ` ⚠️ Atenção: ${albumCeilingWarnings.length} álbum(ns) com +${MAX_ALBUM_PHOTOS} fotos atingiram o teto de segurança e foram interrompidos.`;
      }

      if (statusText) statusText.textContent = statusMsg;

    } catch (fatalScanErr) {
      console.error('[Conserva_Fotos] Erro fatal no empacotamento:', fatalScanErr);
      if (statusText) statusText.textContent = `⚠️ Erro ao empacotar: ${fatalScanErr.message}. Tente novamente.`;
    } finally {
      if (runningActions) runningActions.classList.add('hidden');
      if (stopBtn) {
        stopBtn.classList.add('hidden');
        stopBtn.style.opacity = '1';
        stopBtn.innerHTML = '⏹️ PARAR E BAIXAR AGORA (<span id="fac-stop-count">0</span> fotos)';
      }
      if (startBtn) startBtn.classList.remove('hidden');
      isScanning = false;
    }
  }

  /**
   * Abre ou fecha (toggle) a caixa única da extensão na tela do WhatsApp Web
   */
  function toggleExtensionPanel() {
    if (!panel) {
      initExtensionUI();
    }
    if (!panel) return;

    panel.classList.remove('hidden');
    const isCollapsed = panel.classList.contains('collapsed');
    const closeIcon = document.getElementById('fac-close-icon');

    if (isCollapsed) {
      panel.classList.remove('collapsed');
      if (closeIcon) closeIcon.textContent = '▲';
      updateActiveGroupName();
      updateNamingPreview();

      // Garante que o painel esteja sempre dentro dos limites visíveis da janela
      const rect = panel.getBoundingClientRect();
      if (
        rect.right < 80 ||
        rect.left > window.innerWidth - 60 ||
        rect.bottom < 60 ||
        rect.top > window.innerHeight - 60
      ) {
        panel.style.left = `${Math.max(20, window.innerWidth - 360)}px`;
        panel.style.top = '76px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
    } else {
      panel.classList.add('collapsed');
      if (closeIcon) closeIcon.textContent = '▼';
    }
  }

  // Listener para chamadas diretas do ícone da extensão no Chrome (One-Click Action)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request && request.action === 'toggle_panel') {
        toggleExtensionPanel();
        sendResponse({ ok: true, isOpened: panel && !panel.classList.contains('hidden') });
      }
      return true;
    });
  }

  // Inicialização no WhatsApp Web
  const interval = setInterval(() => {
    if (document.querySelector('#app') || document.querySelector('#main') || document.body) {
      initExtensionUI();
      clearInterval(interval);
    }
  }, 1000);
})();
