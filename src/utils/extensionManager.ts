import JSZip from 'jszip';

export interface ExtensionFileDefinition {
  name: string;
  path: string;
  isBinary?: boolean;
}

const EXTENSION_FILES: ExtensionFileDefinition[] = [
  { name: 'manifest.json', path: '/chrome-extension/manifest.json' },
  { name: 'background.js', path: '/chrome-extension/background.js' },
  { name: 'content.js', path: '/chrome-extension/content.js' },
  { name: 'content.css', path: '/chrome-extension/content.css' },
  { name: 'popup.html', path: '/chrome-extension/popup.html' },
  { name: 'popup.js', path: '/chrome-extension/popup.js' },
  { name: 'jszip.min.js', path: '/chrome-extension/jszip.min.js' },
  { name: 'xlsx.full.min.js', path: '/chrome-extension/xlsx.full.min.js' },
  { name: 'LEIA-ME_COMO_INSTALAR.txt', path: '/chrome-extension/LEIA-ME_COMO_INSTALAR.txt' },
];

/**
 * Carrega todos os arquivos da extensão em memória
 */
export async function loadExtensionFiles(): Promise<{ name: string; content: string | Uint8Array }[]> {
  const loaded: { name: string; content: string | Uint8Array }[] = [];

  for (const f of EXTENSION_FILES) {
    const res = await fetch(f.path);
    if (!res.ok) {
      throw new Error(`Falha ao carregar arquivo da extensão: ${f.name} (Status: ${res.status})`);
    }
    if (f.name.endsWith('.min.js')) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength === 0) {
        throw new Error(`Arquivo ${f.name} está vazio.`);
      }
      loaded.push({ name: f.name, content: new Uint8Array(buf) });
    } else {
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error(`Arquivo ${f.name} está vazio.`);
      }
      if (f.name === 'manifest.json') {
        try {
          JSON.parse(text);
        } catch (e: any) {
          throw new Error(`Conteúdo inválido no manifest.json: ${e.message}`);
        }
      }
      loaded.push({ name: f.name, content: text });
    }
  }

  return loaded;
}

/**
 * Salva os arquivos da extensão diretamente em uma pasta no computador do usuário
 * (Funciona em janelas normais, não em iframes cross-origin restritos pelo Chrome)
 */
export async function saveExtensionDirectlyToFolder(
  dirHandle: any,
  onProgress?: (fileName: string) => void
): Promise<{ count: number; folderName: string }> {
  const files = await loadExtensionFiles();

  for (const f of files) {
    onProgress?.(f.name);
    const fileHandle = await dirHandle.getFileHandle(f.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(f.content);
    await writable.close();
  }

  return { count: files.length, folderName: dirHandle.name || 'Pasta Selecionada' };
}

/**
 * Baixa todos os arquivos soltos individualmente (dispensa 100% programa de ZIP)
 */
export async function downloadExtensionFilesIndividually(
  onProgress?: (name: string) => void
): Promise<number> {
  const files = await loadExtensionFiles();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(`Baixando ${f.name} (${i + 1}/${files.length})...`);
    const blob =
      typeof f.content === 'string'
        ? new Blob([f.content], { type: 'text/plain;charset=utf-8' })
        : new Blob([f.content as BlobPart], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    await new Promise((r) => setTimeout(r, 300));
    URL.revokeObjectURL(url);
    a.remove();
  }
  return files.length;
}

/**
 * Gera e dispara o download do ZIP da extensão usando Blob em memória (100% garantido em qualquer navegador)
 */
export async function downloadExtensionZipBlob(
  onProgress?: (status: string) => void
): Promise<void> {
  onProgress?.('Carregando arquivos...');
  const files = await loadExtensionFiles();

  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.content);
  }

  onProgress?.('Gerando arquivo ZIP compatível com Windows e Mac...');
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'FiscalizACampo_Extensao_Chrome.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
