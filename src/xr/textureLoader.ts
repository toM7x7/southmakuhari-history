import * as THREE from 'three';

const TILE_ROOT = 'https://cyberjapandata.gsi.go.jp/xyz';
const TILE_SIZE = 256;

export interface TileTextureOptions {
  layer: string;
  lat: number;
  lng: number;
  zoom?: number;
  extension?: 'png' | 'jpg';
  fallbackLayer?: string;
  fallbackExtension?: 'png' | 'jpg';
  tileSpan?: number;
}

export async function loadTileTexture({
  layer,
  lat,
  lng,
  zoom = 16,
  extension = 'jpg',
  fallbackLayer,
  fallbackExtension = extension,
  tileSpan = 2,
}: TileTextureOptions): Promise<THREE.Texture> {
  const span = Math.max(1, Math.floor(tileSpan));
  const { x: centerX, y: centerY } = latLngToTile(lat, lng, zoom);
  const topLeftX = centerX - Math.floor(span / 2);
  const topLeftY = centerY - Math.floor(span / 2);

  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE * span;
  canvas.height = TILE_SIZE * span;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D contextを取得できませんでした');
  }

  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const promises: Array<Promise<{ row: number; col: number; image: HTMLImageElement | null }>> = [];

  for (let row = 0; row < span; row += 1) {
    for (let col = 0; col < span; col += 1) {
      const tileX = topLeftX + col;
      const tileY = topLeftY + row;
      const urls: string[] = [
        buildTileUrl(layer, extension, zoom, tileX, tileY),
      ];
      if (fallbackLayer) {
        urls.push(buildTileUrl(fallbackLayer, fallbackExtension, zoom, tileX, tileY));
      }

      promises.push(
        loadImageWithFallback(urls).then((image) => ({ row, col, image })).catch(() => ({ row, col, image: null })),
      );
    }
  }

  const tiles = await Promise.all(promises);

  tiles.forEach(({ row, col, image }) => {
    const dx = col * TILE_SIZE;
    const dy = row * TILE_SIZE;
    if (image) {
      context.drawImage(image, dx, dy, TILE_SIZE, TILE_SIZE);
    } else {
      context.fillStyle = '#1e293b';
      context.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
    }
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.anisotropy = 4;
  return texture;
}

function buildTileUrl(layer: string, extension: 'png' | 'jpg', zoom: number, x: number, y: number) {
  return `${TILE_ROOT}/${layer}/${zoom}/${x}/${y}.${extension}`;
}

function loadImageWithFallback(urls: string[]): Promise<HTMLImageElement | null> {
  const tryLoad = (index: number): Promise<HTMLImageElement | null> => {
    if (index >= urls.length) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => {
        tryLoad(index + 1).then(resolve);
      };
      image.src = urls[index];
    });
  };

  return tryLoad(0);
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}
