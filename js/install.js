/* js/install.js - show install button for Android and handle click */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('installPWAButton');
  if (!btn) return;
  window.addEventListener('pwa-install-available', () => {
    btn.style.display = 'inline-block';
  });
  btn.addEventListener('click', async () => {
    if (window.triggerPWAInstall) {
      const res = await window.triggerPWAInstall();
      console.log('PWA install result:', res);
    } else {
      alert('Instalacja niedostępna: spróbuj z poziomu przeglądarki.');
    }
  });
});
