import JSZip from 'jszip';
import * as XLSX from 'xlsx';

/**
 * Cria uma imagem sintética ilustrativa no canvas para representar fotos de campo
 */
function createSyntheticRoadPhotoBlob(
  title: string,
  km: string,
  tag: string,
  isBefore: boolean = false
): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(new Blob(['dummy'], { type: 'image/jpeg' }));
      return;
    }

    // Céu
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 200);
    skyGrad.addColorStop(0, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 640, 200);

    // Canteiro de vegetação
    ctx.fillStyle = isBefore ? '#15803d' : '#4ade80';
    ctx.fillRect(0, 180, 640, 80);

    // Pista asfáltica
    const roadGrad = ctx.createLinearGradient(0, 240, 0, 480);
    roadGrad.addColorStop(0, '#334155');
    roadGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = roadGrad;
    ctx.beginPath();
    ctx.moveTo(180, 240);
    ctx.lineTo(460, 240);
    ctx.lineTo(640, 480);
    ctx.lineTo(0, 480);
    ctx.closePath();
    ctx.fill();

    // Faixa central amarela
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 6;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(320, 240);
    ctx.lineTo(320, 480);
    ctx.stroke();
    ctx.setLineDash([]);

    // Faixa lateral branca
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(200, 240);
    ctx.lineTo(40, 480);
    ctx.stroke();

    // Elemento de conservação (Cone ou Placa ou Remendo)
    if (tag.includes('PAV') || tag.includes('TAP')) {
      // Mancha de asfalto novo / tapa buraco
      ctx.fillStyle = isBefore ? '#0f172a' : '#020617';
      ctx.beginPath();
      ctx.ellipse(380, 360, isBefore ? 40 : 50, isBefore ? 25 : 30, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!isBefore) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else if (tag.includes('ROC')) {
      // Roçada
      ctx.fillStyle = isBefore ? '#166534' : '#86efac';
      ctx.fillRect(40, 220, 120, 50);
    }

    // Carimbo de fiscalização no rodapé (Data, Km, Tag)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 410, 640, 70);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`CONSERVAÇÃO RODOVIÁRIA · ${tag}`, 16, 435);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px monospace';
    ctx.fillText(`${km} · ${title}`, 16, 455);
    ctx.fillText(isBefore ? '[STATUS: ANTES DA INTERVENÇÃO]' : '[STATUS: APÓS CONCLUSÃO]', 16, 472);

    canvas.toBlob(
      (blob) => {
        resolve(blob || new Blob(['error'], { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.85
    );
  });
}

/**
 * Cria a planilha modelo de referência de medição para demonstração
 */
export function createSampleSpreadsheetBlob(): Uint8Array {
  const wb = XLSX.utils.book_new();

  const rows = [
    {
      'Código': 'BSO-003',
      'Rodovia': 'SP-330',
      'km': 'km 245+300',
      'Responsável': 'Carlos Fiscal',
      'Serviço': 'Roçada manual e mecânica',
      'Empresa': 'Pavicenter Engenharia',
      'Status': 'Aprovado para Medição',
      'Previsão (m²)': 15000,
    },
    {
      'Código': 'DRE-005',
      'Rodovia': 'SP-310',
      'km': 'km 180+200',
      'Responsável': 'Marcos Engenheiro',
      'Serviço': 'Desobstrução de bueiro triplo',
      'Empresa': 'Drenasul Obras',
      'Status': 'Em Andamento',
      'Previsão (m²)': 250,
    },
    {
      'Código': 'PAV-001',
      'Rodovia': 'SP-330',
      'km': 'km 210+000',
      'Responsável': 'Renata Inspetora',
      'Serviço': 'Tapa-buraco CBUQ',
      'Empresa': 'Pavicenter Engenharia',
      'Status': 'Aprovado para Medição',
      'Previsão (m²)': 450,
    },
    {
      'Código': 'ROC-012',
      'Rodovia': 'SP-310',
      'km': 'km 192+800',
      'Responsável': 'Carlos Fiscal',
      'Serviço': 'Capina e limpeza de canteiro',
      'Empresa': 'Verde Limpo Serviços',
      'Status': 'Aprovado para Medição',
      'Previsão (m²)': 8200,
    },
    {
      'Código': 'CON-099', // Item previsto na planilha mas SEM nenhuma foto no WhatsApp (Gera Lista A)
      'Rodovia': 'SP-330',
      'km': 'km 260+000',
      'Responsável': 'Eduardo Medição',
      'Serviço': 'Recuperação de barreira New Jersey',
      'Empresa': 'Pavicenter Engenharia',
      'Status': 'Pendente Evidência',
      'Previsão (m²)': 120,
    },
    {
      'Código': 'OAE-004', // Outro item sem foto (Gera Lista A)
      'Rodovia': 'SP-310',
      'km': 'km 175+000',
      'Responsável': 'Marcos Engenheiro',
      'Serviço': 'Pintura de guarda-corpo de ponte',
      'Empresa': 'Drenasul Obras',
      'Status': 'Pendente Evidência',
      'Previsão (m²)': 300,
    }
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Base');

  const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(wbOut);
}

/**
 * Gera 2 arquivos ZIPs simulados de exportações reais de WhatsApp
 */
export async function createSampleWhatsAppZips(): Promise<{
  zip1Blob: Blob;
  zip1Name: string;
  zip2Blob: Blob;
  zip2Name: string;
  spreadsheetBlob: Blob;
  spreadsheetName: string;
}> {
  // --- GRUPO 1: Frente Conservação Lote 01 Norte ---
  const zip1 = new JSZip();

  // Fotos sintéticas para o Grupo 1
  const photo1 = await createSyntheticRoadPhotoBlob('Roçada km 245+300', 'km 245+300', 'BSO 03', true);
  const photo2 = await createSyntheticRoadPhotoBlob('Roçada km 245+300 Concluída', 'km 245+300', 'BSO 03', false);
  const photo3 = await createSyntheticRoadPhotoBlob('Tapa buraco km 210', 'km 210+000', 'PAV 01', false);
  const photo4 = await createSyntheticRoadPhotoBlob('Foto geral sem legenda', 'km 230', 'Geral', false);
  const photo5 = await createSyntheticRoadPhotoBlob('Serviço Extra Não Previsto', 'km 222+100', 'TAP 08', false);

  zip1.file('IMG-20260915-WA0001.jpg', photo1);
  zip1.file('IMG-20260915-WA0002.jpg', photo2);
  zip1.file('IMG-20260916-WA0003.jpg', photo3);
  zip1.file('IMG-20260916-WA0004.jpg', photo4);
  zip1.file('IMG-20260917-WA0005.jpg', photo5);

  // Chat TXT do Grupo 1 no formato 1: [dd/mm/aa, hh:mm:ss] Remetente: mensagem
  const chat1Txt = `
[15/09/26, 08:30:00] Mensagens e chamadas são protegidas com a criptografia de ponta a ponta.
[15/09/26, 08:45:10] Carlos Fiscal: Bom dia equipe. Iniciando os trabalhos na SP-330 hoje.
[15/09/26, 08:46:00] Carlos Fiscal: Empresa: Pavicenter Engenharia, Equipe: Alfa, km 245+300.
[15/09/26, 09:12:05] Carlos Fiscal: <anexado: IMG-20260915-WA0001.jpg>
Registro inicial BSO 03 antes de começar a roçada manual.
[15/09/26, 11:30:40] Carlos Fiscal: <anexado: IMG-20260915-WA0002.jpg>
Finalizado serviço bso-03 km 245+300. Tudo limpo e medido.
[16/09/26, 14:10:15] Renata Inspetora: Boa tarde. Segue relatório do tapa buraco.
[16/09/26, 14:11:00] Renata Inspetora: PAV 01 - km 210+000 Empresa: Pavicenter Equipe: Beta CBUQ executado.
[16/09/26, 14:15:30] Renata Inspetora: <anexado: IMG-20260916-WA0003.jpg>
[16/09/26, 16:40:00] Carlos Fiscal: <anexado: IMG-20260916-WA0004.jpg>
[17/09/26, 10:20:10] Carlos Fiscal: Identificamos emergência na pista. Código TAP 08 km 222+100.
[17/09/26, 10:21:00] Carlos Fiscal: <anexado: IMG-20260917-WA0005.jpg>
`.trim();

  zip1.file('_chat.txt', chat1Txt);

  // --- GRUPO 2: Frente Drenagem e Roçada Lote 02 Sul ---
  const zip2 = new JSZip();

  const photo6 = await createSyntheticRoadPhotoBlob('Limpeza de Bueiro km 180', 'km 180+200', 'DRE 05', true);
  const photo7 = await createSyntheticRoadPhotoBlob('Limpeza Bueiro Concluída', 'km 180+200', 'DRE 05', false);
  const photo8 = await createSyntheticRoadPhotoBlob('Capina e Roçada SP-310', 'km 192+800', 'ROC 12', false);
  const photo9 = await createSyntheticRoadPhotoBlob('Roçada BSO 03 Interseção', 'km 245+300', 'BSO 03', false);

  zip2.file('00000001-PHOTO.jpg', photo6);
  zip2.file('00000002-PHOTO.jpg', photo7);
  zip2.file('00000003-PHOTO.jpg', photo8);
  zip2.file('00000004-PHOTO.jpg', photo9);

  // Chat TXT do Grupo 2 no formato 2: dd/mm/aaaa hh:mm - Remetente: mensagem
  const chat2Txt = `
18/09/2026 07:45 - Marcos Engenheiro: Bom dia a todos. Frente Drenasul Obras operando na SP-310.
18/09/2026 08:00 - Marcos Engenheiro: Equipe: Gama, Serviço: Desobstrução de bueiro, km 180+200.
18/09/2026 08:35 - Marcos Engenheiro: DRE05 bueiro assoreado antes da limpeza.
18/09/2026 08:36 - Marcos Engenheiro: 00000001-PHOTO.jpg (arquivo anexado)
18/09/2026 11:20 - Marcos Engenheiro: 00000002-PHOTO.jpg (arquivo anexado)
dre-05 concluído com vazão liberada km 180+200.
19/09/2026 09:15 - Carlos Fiscal: Verde Limpo Serviços - Equipe 03 - ROC-12 km 192+800.
19/09/2026 09:17 - Carlos Fiscal: 00000003-PHOTO.jpg (arquivo anexado)
20/09/2026 15:30 - Marcos Engenheiro: Reforço solicitado na divisa: BSO 03 km 245+300 roçada de apoio.
20/09/2026 15:31 - Marcos Engenheiro: 00000004-PHOTO.jpg (arquivo anexado)
`.trim();

  zip2.file('conversa_whatsapp.txt', chat2Txt);

  const zip1Blob = await zip1.generateAsync({ type: 'blob' });
  const zip2Blob = await zip2.generateAsync({ type: 'blob' });
  const spreadsheetUint8 = createSampleSpreadsheetBlob();
  const spreadsheetBlob = new Blob([spreadsheetUint8 as any], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return {
    zip1Blob,
    zip1Name: 'Conversa WhatsApp - Conservacao Lote 01 Norte.zip',
    zip2Blob,
    zip2Name: 'Conversa WhatsApp - Drenagem e Rocada Lote 02 Sul.zip',
    spreadsheetBlob,
    spreadsheetName: 'Planilha_Medicao_Referencia_Setembro_2026.xlsx',
  };
}
