/**
 * Gerador de Arquivo HTML Único Portátil (Standalone Offline Single-File HTML)
 * Conforme Seção 1 e 7 do prompt:
 * "Construa uma ferramenta em um único arquivo HTML (CSS e JS embutidos) que processe
 *  tudo localmente no navegador, sem enviar dados a servidor nenhum. Bibliotecas apenas via cdnjs (JSZip, SheetJS)."
 */

export function generatePortableHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FiscalizACampo - Organizador de Fotos de WhatsApp e Medição</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0a0a0a;
      color: #f5f5f5;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .font-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
    header {
      background: #111;
      border-bottom: 1px solid #262626;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand h1 { font-size: 1.15rem; font-weight: 700; color: #fff; }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }
    main { max-width: 1280px; width: 100%; margin: 0 auto; padding: 24px 16px; flex: 1; }
    .card { background: #141414; border: 1px solid #262626; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .dropzone {
      border: 2px dashed #404040;
      border-radius: 12px;
      padding: 32px 16px;
      text-align: center;
      background: #0f0f0f;
      cursor: pointer;
      transition: all 0.2s;
    }
    .dropzone:hover { border-color: #f59e0b; background: rgba(245, 158, 11, 0.04); }
    .btn {
      background: #262626;
      color: #f5f5f5;
      border: 1px solid #404040;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .btn:hover { background: #333; }
    .btn-amber { background: #f59e0b; color: #000; border-color: #f59e0b; }
    .btn-amber:hover { background: #d97706; }
    .btn-group { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 16px; }
    .gallery { display: grid; grid-cols: 1fr; gap: 16px; }
    @media (min-width: 640px) { .gallery { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .gallery { grid-template-columns: repeat(4, 1fr); } }
    .photo-card { background: #171717; border: 1px solid #262626; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }
    .photo-thumb { width: 100%; aspect-ratio: 4/3; object-fit: cover; background: #000; }
    .photo-meta { padding: 10px; font-size: 0.75rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
    .code-tag { font-family: monospace; font-weight: bold; background: #f59e0b; color: #000; padding: 2px 6px; border-radius: 4px; display: inline-block; }
    .status-line { font-size: 0.75rem; color: #a3a3a3; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    th, td { padding: 10px; border-bottom: 1px solid #262626; text-align: left; }
    th { background: #1c1c1c; color: #e5e5e5; }
    footer { border-top: 1px solid #262626; padding: 16px; text-align: center; font-size: 0.75rem; color: #737373; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>FiscalizACampo</h1>
      <span class="badge-amber font-mono">HTML Único Offline</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn btn-amber" onclick="exportZip()">Exportar ZIPs & Planilha</button>
      <button class="btn" onclick="clearData()">Limpar</button>
    </div>
  </header>

  <main>
    <div class="card">
      <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
        <h3 style="font-size: 1.1rem; font-weight: 600; margin-bottom: 6px;">Arraste aqui os arquivos .ZIP do WhatsApp e a Planilha de Medição</h3>
        <p style="font-size: 0.8rem; color: #a3a3a3; max-width: 500px; margin: 0 auto;">Processamento 100% no seu navegador sem envio para servidores.</p>
        <div class="btn-group" onclick="event.stopPropagation()">
          <input type="file" id="fileInput" multiple accept=".zip" style="display:none" onchange="handleZipsSelected(this.files)">
          <button class="btn" onclick="document.getElementById('fileInput').click()">Selecionar ZIPs do WhatsApp</button>
          <input type="file" id="sheetInput" accept=".xlsx,.csv" style="display:none" onchange="handleSheetSelected(this.files[0])">
          <button class="btn" onclick="document.getElementById('sheetInput').click()">Importar Planilha (.xlsx)</button>
        </div>
      </div>
      <div id="statusLine" class="status-line"></div>
    </div>

    <!-- Contadores -->
    <div class="card" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div>
        <span style="font-size: 0.85rem; font-weight: 600;">Registros de Campo:</span>
        <span id="counterStats" class="font-mono" style="margin-left: 8px; color: #f59e0b;">0 fotos carregadas</span>
      </div>
      <div style="font-size: 0.75rem; color: #737373;">
        Padrão de exportação: <span class="font-mono" style="color: #f5f5f5;">CONS_AAAAMMDD_seq.jpg</span>
      </div>
    </div>

    <!-- Galeria -->
    <div id="galleryContainer" class="gallery"></div>
  </main>

  <footer>
    FiscalizACampo · Conservação Rodoviária & Medição de Obras · Processamento 100% Local no Navegador
  </footer>

  <script>
    let photoRecords = [];
    let spreadsheetRows = [];
    const prefixes = ['BSO', 'SER', 'CON', 'PAV', 'ROC', 'DRE', 'CAP', 'SGP', 'REC', 'TCC', 'TAP', 'OAE', 'SIN', 'TER', 'FAI'];

    function updateStatus(msg) {
      document.getElementById('statusLine').innerText = msg;
    }

    function cleanStr(s) {
      return (s || '').replace(/[\\u200E\\u200F\\u202A-\\u202E\\u202F\\uFEFF]/g, '').trim();
    }

    function parseHeader(line) {
      const clean = cleanStr(line);
      const m1 = clean.match(/^\\[(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\]\\s+([^:]+):\\s*(.*)$/);
      if (m1) {
        let yr = parseInt(m1[3]);
        if (yr < 100) yr += 2000;
        return {
          date: new Date(yr, parseInt(m1[2]) - 1, parseInt(m1[1]), parseInt(m1[4]), parseInt(m1[5])),
          sender: m1[7].trim(),
          text: m1[8] || ''
        };
      }
      const m2 = clean.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4}),?\\s+(\\d{1,2}):(\\d{2})\\s*-\\s+([^:]+):\\s*(.*)$/);
      if (m2) {
        let yr = parseInt(m2[3]);
        if (yr < 100) yr += 2000;
        return {
          date: new Date(yr, parseInt(m2[2]) - 1, parseInt(m2[1]), parseInt(m2[4]), parseInt(m2[5])),
          sender: m2[6].trim(),
          text: m2[7] || ''
        };
      }
      return null;
    }

    function extractCode(text) {
      if (!text) return 'Não identificado';
      const pat = new RegExp('(?:^|[^a-zA-Z0-9À-ÿ])(' + prefixes.join('|') + ')[\\\\s\\\\-_]*0*(\\\\d+)', 'i');
      const m = text.match(pat);
      if (m) {
        const num = parseInt(m[2]);
        const numStr = num < 10 ? '0' + num : '' + num;
        return m[1].toUpperCase() + ' ' + numStr;
      }
      return 'Não identificado';
    }

    async function handleZipsSelected(files) {
      if (!files || !files.length) return;
      updateStatus('Lendo arquivos ZIP selecionados...');
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const zip = await JSZip.loadAsync(await f.arrayBuffer());
          const group = f.name.replace(/\\.zip$/i, '');
          let chatText = '';
          const txtFiles = Object.keys(zip.files).filter(k => !zip.files[k].dir && /\\.txt$/i.test(k));
          if (txtFiles.length) {
            chatText = await zip.files[txtFiles[0]].async('text');
          }
          const lines = chatText.split(/\\r?\\n/);
          const msgs = [];
          let cur = null;
          for (const l of lines) {
            const h = parseHeader(l);
            if (h) {
              if (cur) msgs.push(cur);
              cur = { ...h, medias: [] };
            } else if (cur) {
              cur.text += '\\n' + l;
            }
          }
          if (cur) msgs.push(cur);

          for (const p in zip.files) {
            if (/\\.(jpe?g|png|webp)$/i.test(p) && !zip.files[p].dir) {
              const base = p.split('/').pop();
              const blob = await zip.files[p].async('blob');
              let matchedMsg = msgs.find(m => m.text.includes(base)) || msgs[0] || { date: new Date(), sender: 'Não informado', text: '' };
              const code = extractCode(matchedMsg.text);
              photoRecords.push({
                base,
                blob,
                code,
                group,
                sender: matchedMsg.sender,
                date: matchedMsg.date,
                text: matchedMsg.text
              });
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      updateStatus('Concluído! ' + photoRecords.length + ' fotos carregadas.');
      renderGallery();
    }

    function handleSheetSelected(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        spreadsheetRows = XLSX.utils.sheet_to_json(sheet);
        updateStatus('Planilha de medição carregada: ' + spreadsheetRows.length + ' linhas.');
      };
      reader.readAsBinaryString(file);
    }

    function renderGallery() {
      const cont = document.getElementById('galleryContainer');
      document.getElementById('counterStats').innerText = photoRecords.length + ' fotos carregadas';
      cont.innerHTML = '';
      photoRecords.forEach((p, idx) => {
        const url = URL.createObjectURL(p.blob);
        const card = document.createElement('div');
        card.className = 'photo-card';
        card.innerHTML = \`
          <img src="\${url}" class="photo-thumb" loading="lazy">
          <div class="photo-meta">
            <div>
              <span class="code-tag">\${p.code}</span>
              <div style="font-weight: 600; margin-top: 4px; color: #fff;">\${p.base}</div>
              <div style="color: #737373; font-size: 0.7rem; font-family: monospace;">\${p.date.toLocaleString('pt-BR')}</div>
            </div>
            <div style="margin-top: 6px; color: #a3a3a3; font-size: 0.7rem;">\${p.sender} · \${p.group.substring(0, 15)}...</div>
          </div>
        \`;
        cont.appendChild(card);
      });
    }

    async function exportZip() {
      if (!photoRecords.length) { alert('Nenhuma foto para exportar.'); return; }
      updateStatus('Gerando ZIP com pastas organizadas...');
      const outZip = new JSZip();
      photoRecords.forEach((p, idx) => {
        const seq = String(idx + 1).padStart(3, '0');
        const ymd = p.date.toISOString().slice(0, 10).replace(/-/g, '');
        const outName = 'CONS_' + ymd + '_' + seq + '.jpg';
        const folder = p.code.replace(/\\s+/g, '_');
        outZip.file(folder + '/' + outName, p.blob);
      });

      const blob = await outZip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Medicao_Conservacao_' + new Date().toISOString().slice(0, 10) + '.zip';
      a.click();
      updateStatus('Download do ZIP concluído!');
    }

    function clearData() {
      if (confirm('Limpar todas as fotos?')) {
        photoRecords = [];
        renderGallery();
        updateStatus('Limpo com sucesso.');
      }
    }
  </script>
</body>
</html>`;
}
