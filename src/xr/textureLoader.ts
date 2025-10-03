import * as THREE from 'three';

const TILE_ROOT = 'https://cyberjapandata.gsi.go.jp/xyz';

export interface TileTextureOptions {
  layer: string;
  lat: number;
  lng: number;
  zoom?: number;
  extension?: 'png' | 'jpg';
  fallbackLayer?: string;
}

export function loadTileTexture({
  layer,
  lat,
  lng,
  zoom = 16,
  extension = 'jpg',
  fallbackLayer,
}: TileTextureOptions): Promise<THREE.Texture> {
  const { x, y } = latLngToTile(lat, lng, zoom);

  const urls = [
    `${TILE_ROOT}/${layer}/${zoom}/${x}/${y}.${extension}`,
  ];

  if (fallbackLayer) {
    urls.push(`${TILE_ROOT}/${fallbackLayer}/${zoom}/${x}/${y}.${extension}`);
  }

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('');

  return loadWithFallback(loader, urls, 0);
}

function loadWithFallback(loader: THREE.TextureLoader, urls: string[], index: number): Promise<THREE.Texture> {
  if (index >= urls.length) {
    return Promise.reject(new Error('全てのテクスチャ読み込みに失敗しました'));
  }

  return new Promise((resolve, reject) => {
    loader.load(
      urls[index],
      (texture: THREE.Texture) => {
        resolve(texture);
      },
      undefined,
      () => {
        loadWithFallback(loader, urls, index + 1).then(resolve).catch(reject);
      },
    );
  });
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}


