/**
 * Conserva_Fotos - Background Service Worker (Manifest V3)
 * 
 * Funcionalidade de 1 Clique Direto:
 * - Se o usuário já estiver na aba do WhatsApp Web: abre/alterna o painel Conserva_Fotos diretamente nela
 *   (SEM abrir pop-up intermediário, SEM abrir nova janela e SEM duplicar abas).
 * - Se o usuário estiver em outra aba: localiza a aba já aberta do WhatsApp Web, traz para a frente e abre o painel.
 * - Só cria uma nova aba se o WhatsApp Web não estiver aberto em nenhuma janela do navegador.
 */

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 1. O usuário já está com a aba do WhatsApp Web ativa?
    if (tab && tab.url && tab.url.includes('web.whatsapp.com')) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggle_panel' }, () => {
        if (chrome.runtime.lastError) {
          // Ignora caso o content script ainda esteja inicializando
        }
      });
      return;
    }

    // 2. Se estiver em outra aba, procura se já existe uma aba do WhatsApp Web aberta
    const waTabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    if (waTabs && waTabs.length > 0) {
      const targetTab = waTabs[0];
      // Traz a aba do WhatsApp existente para o primeiro plano
      await chrome.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
      setTimeout(() => {
        chrome.tabs.sendMessage(targetTab.id, { action: 'toggle_panel' }, () => {
          if (chrome.runtime.lastError) {}
        });
      }, 150);
      return;
    }

    // 3. Apenas se nenhuma aba do WhatsApp Web estiver aberta no navegador, cria uma nova
    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  } catch (err) {
    console.error('[Conserva_Fotos] Erro no background ao acionar painel:', err);
  }
});
