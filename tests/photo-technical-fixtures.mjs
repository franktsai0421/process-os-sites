import sharp from 'sharp';
export async function technicalPhotoFixtures() {
  const label = (width, height, transparent = false) =>
    Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="30" y="30" width="${width - 60}" height="${height - 60}" rx="18" fill="${transparent ? '#edf8facc' : '#edf8fa'}" stroke="#183f48" stroke-width="4"/><g font-family="Noto Sans CJK TC,sans-serif" fill="#172e34"><text x="70" y="110" font-size="42">↑ TOP ／ 上方 ／ PHÍA TRÊN</text><text x="70" y="185" font-size="34">SYNTHETIC QA NAMEPLATE</text><text x="70" y="250" font-size="26">MODEL QA-2910 · SERIAL SN-018374</text><text x="70" y="310" font-size="24">設備銘牌／Nhãn thiết bị · 220 V · 50 Hz</text><text x="70" y="370" font-size="20">公差 ±0.02 mm · Độ chính xác 0,02 mm</text><text x="70" y="425" font-size="16">Small label 16px: AB8B-0123456789 / tiếng Việt / 檢驗</text><text x="70" y="475" font-size="12">Small label 12px: SERIAL SN-018374 · 220V · ±0.02mm</text><text x="70" y="525" font-size="10">Calibration control 10px: O0 I1 lL B8 S5 0123456789</text><text x="70" y="${height - 70}" font-size="25">SYNTHETIC FIXTURE — NO COMPANY DATA</text></g></svg>`,
    );
  const png = await sharp(label(2000, 1200, true))
    .png({ compressionLevel: 3 })
    .toBuffer();
  const portrait = await sharp(label(800, 1200))
    .rotate(-90)
    .jpeg({ quality: 94 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const landscape = await sharp(label(1600, 1000))
    .jpeg({ quality: 94 })
    .toBuffer();
  const webp = await sharp(label(1400, 900, true))
    .webp({ lossless: true })
    .toBuffer();
  return [
    {
      name: 'technical-transparent.png',
      mimeType: 'image/png',
      buffer: png,
      width: 2000,
      height: 1200,
    },
    {
      name: 'phone-orientation6.jpg',
      mimeType: 'image/jpeg',
      buffer: portrait,
      width: 800,
      height: 1200,
    },
    {
      name: 'technical-landscape.jpg',
      mimeType: 'image/jpeg',
      buffer: landscape,
      width: 1600,
      height: 1000,
    },
    {
      name: 'technical-transparent.webp',
      mimeType: 'image/webp',
      buffer: webp,
      width: 1400,
      height: 900,
    },
  ];
}
