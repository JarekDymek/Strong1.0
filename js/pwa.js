/*
PWA helper: handles beforeinstallprompt (Android), navigator.storage.persist(), 
and shows simple iOS 'Add to Home Screen' instruction modal.
*/
const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

export function initPWA() {
  // Try to persist storage
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(p => {
      console.log('Storage.persisted:', p);
    }).catch(err => console.warn('persist() error', err));
  }

  // iOS - show small instruction if not installed
  if (isiOS && !window.matchMedia('(display-mode: standalone)').matches) {
    const modal = document.getElementById('ios-install-modal');
    if (modal) {
      modal.style.display = 'block';
      const close = document.getElementById('ios-install-close');
      close && close.addEventListener('click', () => modal.style.display = 'none');
    }
  }

  // Android / Chromium - beforeinstallprompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Emit a custom event so UI can show an "Install" button
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });

  // Expose a simple function to trigger install prompt
  window.triggerPWAInstall = async function() {
    if (!deferredPrompt) {
      console.log('No deferred prompt available');
      return null;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return choice;
  };
}

// auto init on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}
