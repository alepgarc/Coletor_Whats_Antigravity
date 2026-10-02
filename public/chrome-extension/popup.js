document.getElementById('open-wa-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://web.whatsapp.com' });
});
