// Verified Canonical Web images load from Local R2; this handles unavailable legacy media.
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || image.src.includes('/canonical-placeholder.svg')) return;
  image.src = '/process/assets/canonical-placeholder.svg';
}, true);
