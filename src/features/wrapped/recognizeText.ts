import { Capacitor, registerPlugin } from '@capacitor/core';

// On-device OCR. Android uses Google ML Kit through the app's own TextScan
// plugin (android/.../ocr/TextScanPlugin.java); the model lives in Play
// Services, so the APK barely grows. Everywhere else (iOS for now, web)
// tesseract.js is loaded on demand: its code, wasm and English model (a few
// MB, from the jsDelivr CDN) only download the first time someone imports a
// Wrapped. The image itself never leaves the device.

type ScanBlock = { top: number; left: number; right: number; lines: string[] };

type TextScanPlugin = {
  recognize(options: { base64: string }): Promise<{ blocks: ScanBlock[] }>;
};

const NATIVE_PLUGIN = 'TextScan';
const TextScan = registerPlugin<TextScanPlugin>(NATIVE_PLUGIN);
const MAX_SIDE = 2000;

export type OcrBlocks = string[][];

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    image.src = src;
  });

// Wrapped screenshots are tall; capping the long side keeps the bridge payload
// and the OCR time small without losing the big artist names.
const toCanvas = async (blob: Blob) => {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

// Reading order for the parser: each column top to bottom, columns left to
// right, so "Top Artists" stays above its list even when "Top Songs" sits
// beside it. The narrowest blocks (headings) define the columns; every other
// block joins the column it overlaps most horizontally.
export const orderBlocks = (blocks: ScanBlock[]): OcrBlocks => {
  const columns: { left: number; right: number; blocks: ScanBlock[] }[] = [];
  for (const block of blocks.slice().sort((a, b) => a.right - a.left - (b.right - b.left))) {
    let best: (typeof columns)[number] | null = null;
    let bestOverlap = 0;
    for (const column of columns) {
      const overlap = Math.min(column.right, block.right) - Math.max(column.left, block.left);
      if (overlap > bestOverlap) {
        best = column;
        bestOverlap = overlap;
      }
    }
    if (best) best.blocks.push(block);
    else columns.push({ left: block.left, right: block.right, blocks: [block] });
  }
  return columns
    .sort((a, b) => a.left - b.left)
    .flatMap(column => column.blocks.sort((a, b) => a.top - b.top).map(block => (block.lines || []).filter(Boolean)));
};

const nativeOcr = async (canvas: HTMLCanvasElement): Promise<OcrBlocks> => {
  const base64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1] ?? '';
  const result = await TextScan.recognize({ base64 });
  return orderBlocks(result.blocks || []);
};

const webOcr = async (canvas: HTMLCanvasElement): Promise<OcrBlocks> => {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    if (data.blocks?.length) {
      return data.blocks.map(block =>
        block.paragraphs.flatMap(paragraph => paragraph.lines.map(line => line.text.trim())).filter(Boolean),
      );
    }
    return [data.text.split('\n').map(line => line.trim()).filter(Boolean)];
  } finally {
    void worker.terminate();
  }
};

export const usesNativeOcr = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(NATIVE_PLUGIN);

export const recognizeImageText = async (blob: Blob): Promise<OcrBlocks> => {
  const canvas = await toCanvas(blob);
  if (usesNativeOcr()) {
    try {
      return await nativeOcr(canvas);
    } catch {
      // Play Services model not there yet (fresh install, no Play): fall back.
    }
  }
  return webOcr(canvas);
};
