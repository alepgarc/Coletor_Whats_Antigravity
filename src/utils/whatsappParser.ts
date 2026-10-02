import {
  parseWhatsAppHeaderLine,
  cleanWhatsAppInvisibleChars,
  getISOWeekAndYear,
  formatISOWeekLabel,
  formatDateToDateKey,
} from './dateUtils';
import { WhatsAppRawMessage, PhotoRecord } from '../types';

export interface CodeNormalizationResult {
  code: string; // canonical format, e.g. "BSO 03" or "Não identificado"
  rawMatch: string;
}

/**
 * Normaliza prefixos e números para formato canônico:
 * Ex: "bso-3" -> "BSO 03"
 * Ex: "BSO03" -> "BSO 03"
 * Ex: "BSO 3" -> "BSO 03"
 * Ex: "ROC-12" -> "ROC 12"
 */
export function extractAndNormalizeCode(
  text: string,
  userPrefixes: string[]
): CodeNormalizationResult | null {
  if (!text || !userPrefixes.length) return null;

  // Monta regex segura a partir dos prefixos informados pelo usuário
  const cleanPrefixes = userPrefixes
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (!cleanPrefixes.length) return null;

  // Regex tolerante: aceita espaços, hífens, underscores opcionais entre o prefixo e o número
  // Ex: BSO-03, BSO 3, BSO03, bso_03, (BSO 03)
  const pattern = new RegExp(
    `(?:^|[^a-zA-Z0-9À-ÿ])(${cleanPrefixes.join('|')})[\\s\\-_]*0*(\\d+)(?=[^a-zA-Z0-9À-ÿ]|$)`,
    'i'
  );

  const match = text.match(pattern);
  if (match) {
    const rawPrefix = match[1].toUpperCase();
    const num = parseInt(match[2], 10);
    // Pad com zero se for de 1 a 9 -> "03", senão número normal
    const numStr = num < 10 ? `0${num}` : `${num}`;
    return {
      code: `${rawPrefix} ${numStr}`,
      rawMatch: match[0].trim(),
    };
  }

  return null;
}

/**
 * Extrai informações de campo adicionais (Empresa, Equipe, Km, Rodovia, Serviço)
 */
export function extractFieldMetadata(text: string) {
  let empresa = '';
  let equipe = '';
  let km = '';
  let rodovia = '';
  let servico = '';

  if (!text) return { empresa, equipe, km, rodovia, servico };

  // Empresa / Contratada
  const empresaMatch = text.match(/(?:empresa|contratada|empreiteira)[:\s]+([A-Za-z0-9À-ÿ\s.\-]+?)(?:,|\n|;|$)/i);
  if (empresaMatch) {
    empresa = empresaMatch[1].trim();
  }

  // Equipe / Turma
  const equipeMatch = text.match(/(?:equipe|turma|frente)[:\s]+([A-Za-z0-9À-ÿ\s.\-]+?)(?:,|\n|;|$)/i);
  if (equipeMatch) {
    equipe = equipeMatch[1].trim();
  }

  // Km / Estaca (ex: km 245+300, km 180, km 42,5, km 120.4)
  const kmMatch = text.match(/(?:km|quil[oô]metro|estaca|est\.)[:\s]*(\d+(?:[\s\+\.,]\d+)?)/i);
  if (kmMatch) {
    km = kmMatch[1].replace(/\s+/g, '').trim();
    if (!km.toLowerCase().startsWith('km')) {
      km = `km ${km}`;
    }
  }

  // Rodovia (ex: SP-330, BR-101, SP 310, etc.)
  const rodoviaMatch = text.match(/(?:rodovia|rod\.|sp-|br-)[:\s]*([A-Za-z]{2,3}[-\s]?\d{3})/i);
  if (rodoviaMatch) {
    rodovia = rodoviaMatch[1].toUpperCase().replace(/\s+/g, '-');
  }

  // Serviço / Atividade
  const servicoMatch = text.match(/(?:servi[çc]o|atividade|execu[çc][ãa]o)[:\s]+([A-Za-z0-9À-ÿ\s.\-]+?)(?:,|\n|;|$)/i);
  if (servicoMatch) {
    servico = servicoMatch[1].trim();
  } else {
    // Busca palavras-chave de conservação comuns se não houver prefixo "serviço:"
    const keywords = [
      'roçada manual', 'roçada mecânica', 'roçada', 'tapa-buraco', 'tapa buraco',
      'limpeza de bueiro', 'drenagem', 'capina', 'pintura de ligação', 'recapeamento',
      'defensa metálica', 'sinalização horizontal', 'sinalização vertical', 'poda de árvore',
      'remoção de entulho', 'limpeza de pista', 'recomposição de aterro'
    ];
    for (const kw of keywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(text)) {
        servico = kw.charAt(0).toUpperCase() + kw.slice(1);
        break;
      }
    }
  }

  return { empresa, equipe, km, rodovia, servico };
}

/**
 * Detecta referências de arquivos anexados no texto do WhatsApp.
 * Suporta os múltiplos formatos gerados por iOS e Android em Português e Inglês:
 * - <anexado: 00000001-PHOTO.jpg>
 * - IMG-20260920-WA0001.jpg (arquivo anexado)
 * - <arquivo anexado: foto.jpg>
 * - foto.jpg <anexado>
 * - <attached: photo.jpg>
 */
export function extractMediaReferences(text: string): string[] {
  const fileNames: string[] = [];
  const clean = cleanWhatsAppInvisibleChars(text);

  // Formato <anexado: nome_do_arquivo> ou <attached: filename>
  const tagRegex = /<(?:anexado|attached|arquivo anexado)[:\s]+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(clean)) !== null) {
    const fn = match[1].trim();
    if (fn) fileNames.push(fn);
  }

  // Formato nome_do_arquivo (arquivo anexado)
  const parenRegex = /([a-zA-Z0-9À-ÿ_\-. ]+\.(?:jpg|jpeg|png|webp|heic|mp4|mov|opus|m4a|pdf))\s*\((?:arquivo anexado|attached)\)/gi;
  while ((match = parenRegex.exec(clean)) !== null) {
    const fn = match[1].trim();
    if (fn && !fileNames.includes(fn)) fileNames.push(fn);
  }

  // Formato WhatsApp Image 2026-09-20 at 14.30.00.jpeg
  const directFileRegex = /(?:^|\s)([a-zA-Z0-9_\-. ]+\.(?:jpg|jpeg|png|webp|heic))\b/gi;
  while ((match = directFileRegex.exec(clean)) !== null) {
    const fn = match[1].trim();
    if (fn && !fileNames.includes(fn)) {
      fileNames.push(fn);
    }
  }

  return fileNames;
}

/**
 * Lê o arquivo .txt de conversa do WhatsApp respeitando mensagens de múltiplas linhas
 */
export function parseWhatsAppChatTxt(
  txtContent: string,
  groupName: string
): WhatsAppRawMessage[] {
  const lines = txtContent.split(/\r?\n/);
  const messages: WhatsAppRawMessage[] = [];
  let currentMsg: WhatsAppRawMessage | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const header = parseWhatsAppHeaderLine(line);

    if (header) {
      if (currentMsg) {
        messages.push(currentMsg);
      }

      const mediaFileNames = extractMediaReferences(header.restOfLine);

      currentMsg = {
        id: `${groupName}_msg_${messages.length + 1}`,
        groupName,
        sender: header.sender,
        timestamp: header.date,
        dateStr: header.dateStr,
        timeStr: header.timeStr,
        text: header.restOfLine,
        mediaFileNames,
      };
    } else if (currentMsg) {
      // Linha sem data continua a mensagem anterior
      const trimmed = line.trim();
      if (trimmed) {
        currentMsg.text += `\n${line}`;
        // Procura também possíveis anexos que vieram na linha de continuação
        const extraMedias = extractMediaReferences(line);
        for (const em of extraMedias) {
          if (!currentMsg.mediaFileNames.includes(em)) {
            currentMsg.mediaFileNames.push(em);
          }
        }
      }
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  return messages;
}

/**
 * Associa cada foto do ZIP à mensagem correspondente.
 * Se a foto não tiver código na legenda, procura na mensagem de texto mais próxima
 * do mesmo remetente dentro da janela de tempo (janela configurável, padrão 10 min).
 * Se ainda não tiver código, classifica como "Não identificado". NENHUMA foto é descartada!
 */
export function linkPhotosToMessages(
  mediaFiles: Map<string, { blob: Blob; size: number }>,
  messages: WhatsAppRawMessage[],
  groupName: string,
  userPrefixes: string[],
  windowMinutes: number = 10
): PhotoRecord[] {
  const records: PhotoRecord[] = [];
  const assignedFileNames = new Set<string>();

  // 1. Mapeamento por nome de arquivo referenciado
  const mediaRefToMsg = new Map<string, WhatsAppRawMessage>();
  for (const msg of messages) {
    for (const fn of msg.mediaFileNames) {
      mediaRefToMsg.set(fn.toLowerCase(), msg);
      // Também guarda sem extensão ou apenas o base name
      const simple = fn.split('/').pop()?.toLowerCase();
      if (simple) mediaRefToMsg.set(simple, msg);
    }
  }

  // Percorre todos os arquivos de imagem encontrados no ZIP
  mediaFiles.forEach((fileData, fullFileName) => {
    const baseName = fullFileName.split('/').pop() || fullFileName;
    const lowerBase = baseName.toLowerCase();

    // Filtra apenas imagens (ou vídeos se o usuário anexar)
    const isImage = /\.(jpe?g|png|webp|heic)$/i.test(lowerBase);
    if (!isImage) return;

    assignedFileNames.add(fullFileName);

    // Tenta encontrar a mensagem que cita esse arquivo
    let matchedMsg = mediaRefToMsg.get(lowerBase) || mediaRefToMsg.get(fullFileName.toLowerCase());

    // Se não encontrou por nome direto, procura se o nome está contido em alguma mensagem
    if (!matchedMsg) {
      for (const msg of messages) {
        if (msg.text.toLowerCase().includes(lowerBase)) {
          matchedMsg = msg;
          break;
        }
      }
    }

    // Se ainda não encontrou mensagem associada, tenta extrair a data do próprio nome do arquivo (ex: CONS_YYYYMMDD_seq.jpg ou IMG-YYYYMMDD-WA...)
    let timestamp = matchedMsg ? matchedMsg.timestamp : new Date();
    if (!matchedMsg) {
      const nameDateMatch = baseName.match(/(?:CONS_|IMG[-_]|WhatsApp[-_]Image[-_])?(\d{4})(\d{2})(\d{2})/i);
      if (nameDateMatch) {
        const y = parseInt(nameDateMatch[1], 10);
        const m = parseInt(nameDateMatch[2], 10) - 1;
        const d = parseInt(nameDateMatch[3], 10);
        if (y >= 2020 && y <= 2035 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
          timestamp = new Date(y, m, d, 12, 0, 0);
        }
      }
    }
    let sender = matchedMsg ? matchedMsg.sender : 'Não informado';
    let messageText = matchedMsg ? matchedMsg.text : '';
    let contextTimeDiff: number | undefined = undefined;

    // Agora busca o código (item/frente)
    // Primeiro tenta na legenda/texto da mensagem que continha a foto
    let codeResult = extractAndNormalizeCode(messageText, userPrefixes);
    let meta = extractFieldMetadata(messageText);

    // Se não encontrou código e temos o remetente, busca na mensagem de texto mais próxima
    // do mesmo remetente dentro da janela de tempo (padrão 10 min)
    if (!codeResult && matchedMsg) {
      const targetTime = matchedMsg.timestamp.getTime();
      const maxDiffMs = windowMinutes * 60 * 1000;
      let closestMsg: WhatsAppRawMessage | null = null;
      let minDiff = Infinity;

      for (const candidate of messages) {
        // Ignora a própria mensagem se ela não tinha texto além do anexo
        if (candidate.id === matchedMsg.id) continue;

        // Mesma pessoa
        if (candidate.sender.toLowerCase() === matchedMsg.sender.toLowerCase()) {
          const diff = Math.abs(candidate.timestamp.getTime() - targetTime);
          if (diff <= maxDiffMs && diff < minDiff) {
            const candidateCode = extractAndNormalizeCode(candidate.text, userPrefixes);
            if (candidateCode) {
              minDiff = diff;
              closestMsg = candidate;
              codeResult = candidateCode;
            }
          }
        }
      }

      if (closestMsg && codeResult) {
        contextTimeDiff = Math.round(minDiff / 60000);
        messageText = `${messageText}\n[Contexto ${contextTimeDiff}min: ${closestMsg.text}]`.trim();
        // Enriquece metadados com a mensagem vizinha
        const contextMeta = extractFieldMetadata(closestMsg.text);
        if (!meta.empresa && contextMeta.empresa) meta.empresa = contextMeta.empresa;
        if (!meta.equipe && contextMeta.equipe) meta.equipe = contextMeta.equipe;
        if (!meta.km && contextMeta.km) meta.km = contextMeta.km;
        if (!meta.rodovia && contextMeta.rodovia) meta.rodovia = contextMeta.rodovia;
        if (!meta.servico && contextMeta.servico) meta.servico = contextMeta.servico;
      }
    }

    const { isoWeek, isoYear } = getISOWeekAndYear(timestamp);
    const weekLabel = formatISOWeekLabel(isoWeek, isoYear);
    const dateKey = formatDateToDateKey(timestamp);

    const finalCode = codeResult ? codeResult.code : 'Não identificado';

    records.push({
      id: `${groupName}_${baseName}_${records.length + 1}`,
      fileName: baseName,
      originalFileName: fullFileName,
      groupName,
      sender,
      timestamp,
      isoWeek,
      isoYear,
      weekLabel,
      dateKey,
      code: finalCode,
      rawCodeMatched: codeResult ? codeResult.rawMatch : '',
      km: meta.km || 'Não informado',
      rodovia: meta.rodovia || '',
      empresa: meta.empresa || 'Não informado',
      equipe: meta.equipe || 'Não informado',
      servico: meta.servico || 'Conservação',
      messageText,
      contextMessageTimeDiffMinutes: contextTimeDiff,
      blob: fileData.blob,
      sizeBytes: fileData.size,
      crossStatus: 'unidentified',
    });
  });

  return records;
}
