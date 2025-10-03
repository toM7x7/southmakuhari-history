import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import './App.css';
import { WebXRBoard, type XRMode } from './xr/WebXRBoard';
import { loadTileTexture } from './xr/textureLoader';

interface Era {
  id: string;
  title: string;
  layer: string;
  fallbackLayer?: string;
}

interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  z: number;
}

interface TimelineData {
  eras: Era[];
  spots: Spot[];
}

const TILE_ROOT = 'https://cyberjapandata.gsi.go.jp/xyz';
const ERA_TILE_EXTENSION: Record<string, 'png' | 'jpg'> = {
  ort_USA10: 'png',
  ort_old10: 'png',
  gazo1: 'jpg',
  gazo2: 'jpg',
  gazo3: 'jpg',
  gazo4: 'jpg',
  ort: 'jpg',
};

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'gsi-std': {
      type: 'raster',
      tiles: [`${TILE_ROOT}/std/{z}/{x}/{y}.png`],
      tileSize: 256,
      attribution: '地理院タイル',
      maxzoom: 18,
    },
  },
  layers: [
    {
      id: 'gsi-std-layer',
      type: 'raster',
      source: 'gsi-std',
      minzoom: 0,
      maxzoom: 18,
    },
  ],
};

const MOBILE_BREAKPOINT = 768;
const FADE_DURATION = 350;
const QUICK_LOOK_USDZ = '/models/board.usdz';
const QUICK_LOOK_GLB = '/models/board.glb';

const getMobileMatch = () =>
  typeof window !== 'undefined'
    ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
    : false;

const detectIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layerAnimationsRef = useRef<Map<string, number>>(new Map());
  const xrContainerRef = useRef<HTMLDivElement | null>(null);
  const xrBoardRef = useRef<WebXRBoard | null>(null);

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [selectedEraIndex, setSelectedEraIndex] = useState(0);
  const [activeSpotId, setActiveSpotId] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [xrModes, setXrModes] = useState<XRMode[]>([]);
  const [isCheckingXR, setIsCheckingXR] = useState(true);
  const [xrError, setXrError] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(getMobileMatch);
  const [isMobileControlsOpen, setIsMobileControlsOpen] = useState(getMobileMatch);
  const [hasQuickLookAsset, setHasQuickLookAsset] = useState(false);
  const [hasQuickLookCompanion, setHasQuickLookCompanion] = useState(false);

  const isIOS = useMemo(detectIOS, []);

  useEffect(() => {
    let isMounted = true;
    fetch('/data/timeline.json')
      .then((response) => {
        if (!response.ok) throw new Error(`timeline.json: ${response.status} ${response.statusText}`);
        return response.json() as Promise<TimelineData>;
      })
      .then((data) => {
        if (!isMounted) return;
        setTimeline(data);
        setSelectedEraIndex(0);
        setActiveSpotId(data.spots[0]?.id ?? null);
      })
      .catch((error) => {
        console.error(error);
        if (isMounted) setDataError('年代データの取得に失敗しました');
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const updateMatches = (matches: boolean) => {
      setIsMobileViewport(matches);
      setIsMobileControlsOpen(matches);
    };

    updateMatches(mediaQuery.matches);
    const listener = (event: MediaQueryListEvent) => updateMatches(event.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    if (!timeline || mapRef.current || !mapContainerRef.current) return;

    const initialSpot = timeline.spots.find((spot) => spot.id === activeSpotId) ?? timeline.spots[0];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: BASE_STYLE,
      center: initialSpot ? [initialSpot.lng, initialSpot.lat] : [140.05792, 35.65944],
      zoom: initialSpot?.z ?? 14,
      maxZoom: isMobileViewport ? 16 : 18,
      minZoom: isMobileViewport ? 9.5 : 10,
      attributionControl: false,
      fadeDuration: FADE_DURATION,
    });

    mapRef.current = map;
    const animations = layerAnimationsRef.current;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      setupEraLayers(map, timeline);
      setupOldSeaLayers(map);
      setIsMapReady(true);
    });

    return () => {
      animations.forEach((animationId) => cancelAnimationFrame(animationId));
      animations.clear();
      map.remove();
      mapRef.current = null;
    };
  }, [timeline, activeSpotId, isMobileViewport]);

  useEffect(() => {
    const map = mapRef.current as MapLibreMap & {
      touchPitch?: { enable: () => void; disable: () => void };
    } | null;
    if (!isMapReady || !map) return;

    map.setMaxZoom(isMobileViewport ? 16 : 18);
    map.setMinZoom(isMobileViewport ? 9.5 : 10);

    if (isMobileViewport) {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.touchPitch?.disable();
    } else {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.touchPitch?.enable();
    }
  }, [isMobileViewport, isMapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!isMapReady || !map) return;

    const sidePadding = isMobileViewport ? 18 : 40;
    const bottomPadding = isMobileViewport && isMobileControlsOpen ? 240 : 48;
    map.setPadding({ top: 40, left: sidePadding, right: sidePadding, bottom: bottomPadding });
  }, [isMobileViewport, isMobileControlsOpen, isMapReady]);

  useEffect(() => {
    if (!xrContainerRef.current || xrBoardRef.current) return;

    const board = new WebXRBoard({ parent: xrContainerRef.current });
    xrBoardRef.current = board;
    let cancelled = false;

    board
      .detectSupportedModes()
      .then((modes) => {
        if (!cancelled) setXrModes(modes);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingXR(false);
      });

    return () => {
      cancelled = true;
      board.dispose();
      xrBoardRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isIOS) return;
    let cancelled = false;

    import('@google/model-viewer').catch(() => undefined);

    const checkAsset = (url: string, setter: (available: boolean) => void) => {
      fetch(url, { method: 'HEAD' })
        .then((response) => {
          if (!cancelled) setter(response.ok);
        })
        .catch(() => {
          if (!cancelled) setter(false);
        });
    };

    checkAsset(QUICK_LOOK_USDZ, setHasQuickLookAsset);
    checkAsset(QUICK_LOOK_GLB, setHasQuickLookCompanion);

    return () => {
      cancelled = true;
    };
  }, [isIOS]);

  useEffect(() => {
    if (!isMapReady || !timeline) return;
    const map = mapRef.current;
    if (!map) return;

    timeline.eras.forEach((era, index) => {
      const layerId = layerIdForEra(era.id);
      const targetOpacity = index === selectedEraIndex ? 1 : 0;
      animateLayerOpacity(map, layerId, targetOpacity, layerAnimationsRef.current);

      if (era.fallbackLayer) {
        const fallbackId = fallbackLayerIdForEra(era.id);
        const fallbackOpacity = index === selectedEraIndex ? 0.65 : 0;
        animateLayerOpacity(map, fallbackId, fallbackOpacity, layerAnimationsRef.current);
      }
    });

    const fillOpacity = computeOldSeaFillOpacity(selectedEraIndex, timeline.eras.length);
    const lineOpacity = computeOldSeaLineOpacity(selectedEraIndex, timeline.eras.length);

    if (map.getLayer('oldsea-fill')) {
      map.setPaintProperty('oldsea-fill', 'fill-opacity', fillOpacity);
    }
    if (map.getLayer('oldsea-line')) {
      map.setPaintProperty('oldsea-line', 'line-opacity', lineOpacity);
    }
  }, [selectedEraIndex, isMapReady, timeline]);

  const queueXRTextureUpdate = useCallback(() => {
    const board = xrBoardRef.current;
    const map = mapRef.current;
    if (!board || !timeline || !map) return;

    const era = timeline.eras[selectedEraIndex];
    if (!era) return;

    const center = map.getCenter();
    const zoomCeil = isMobileViewport ? 16 : 17;
    const zoomFloor = isMobileViewport ? 11 : 12;
    const zoom = clamp(Math.round(map.getZoom()), zoomFloor, zoomCeil);
    const extension = ERA_TILE_EXTENSION[era.layer] ?? 'jpg';
    const fallbackExtension = era.fallbackLayer ? ERA_TILE_EXTENSION[era.fallbackLayer] ?? 'jpg' : undefined;
    const tileSpan = isMobileViewport ? 2 : 3;

    board.queueTextureLoader(() =>
      loadTileTexture({
        layer: era.layer,
        lat: center.lat,
        lng: center.lng,
        zoom,
        extension,
        fallbackLayer: era.fallbackLayer,
        fallbackExtension,
        tileSpan,
      }),
    );
  }, [selectedEraIndex, timeline, isMobileViewport]);

  useEffect(() => {
    if (!timeline || !xrBoardRef.current || !mapRef.current) return;

    queueXRTextureUpdate();
    xrBoardRef.current.refreshTexture();

    const map = mapRef.current;
    const handleMoveEnd = () => {
      queueXRTextureUpdate();
      xrBoardRef.current?.refreshTexture();
    };

    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [timeline, queueXRTextureUpdate]);

  const onSpotSelect = useCallback(
    (spotId: string) => {
      if (!timeline || !mapRef.current) return;
      const spot = timeline.spots.find((item) => item.id === spotId);
      if (!spot) return;
      setActiveSpotId(spotId);
      mapRef.current.flyTo({
        center: [spot.lng, spot.lat],
        zoom: clamp(spot.z, 12, isMobileViewport ? 16 : 17),
        duration: 800,
      });
    },
    [timeline, isMobileViewport],
  );

  const currentEra = useMemo(() => timeline?.eras[selectedEraIndex] ?? null, [timeline, selectedEraIndex]);
  const xrAvailable = xrModes.length > 0;
  const xrButtonLabel = useMemo(() => {
    if (isCheckingXR) return 'XRサポート確認中';
    if (xrModes.includes('immersive-ar')) return 'ARモードで見る';
    if (xrModes.includes('immersive-vr')) return 'VRモードで見る';
    return 'XR未対応端末';
  }, [isCheckingXR, xrModes]);

  const showQuickLook = isIOS && !xrAvailable && hasQuickLookAsset;
  const quickLookMissing = isIOS && !xrAvailable && !hasQuickLookAsset;
  const controlsAreExpanded = !isMobileViewport || isMobileControlsOpen;
  const showArPrepHint = (isMobileViewport && xrModes.includes('immersive-ar')) || showQuickLook;

  const handleEnterXR = async () => {
    if (!xrBoardRef.current) return;
    setXrError(null);

    const preferredMode = xrModes.includes('immersive-ar')
      ? 'immersive-ar'
      : xrModes.includes('immersive-vr')
        ? 'immersive-vr'
        : null;

    if (!preferredMode) {
      setXrError('XRをサポートする端末が検出できませんでした');
      return;
    }

    try {
      queueXRTextureUpdate();
      await xrBoardRef.current.refreshTexture();
      await xrBoardRef.current.enter(preferredMode);
    } catch (error) {
      console.error(error);
      setXrError(error instanceof Error ? error.message : 'XR起動に失敗しました');
    }
  };

  return (
    <div className="app-shell">
      <div ref={mapContainerRef} className="map-surface" />
      <div className="overlay">
        <header className="overlay__header">
          <div className="overlay__title">
            <span className="overlay__product">南幕張ヒストリア（仮）</span>
            <span className="overlay__subtitle">年代を重ねて“海だった頃”を感じるXRプロトタイプ v0</span>
          </div>
          <div className="overlay__credit">
            <span>出典：地理院タイル（年代別の写真・オルソ画像）</span>
            <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">
              タイル一覧
            </a>
          </div>
        </header>

        <div
          className="overlay__controls"
          data-mobile={isMobileViewport ? 'true' : 'false'}
          data-open={controlsAreExpanded ? 'true' : 'false'}
        >
          <div className="control-card control-card--spots">
            <div className="control-header">
              <span className="control-title">スポット</span>
            </div>
            <div className="control-body control-body--spots">
              {timeline?.spots.map((spot) => (
                <button
                  key={spot.id}
                  type="button"
                  className={`spot-button${spot.id === activeSpotId ? ' spot-button--active' : ''}`}
                  onClick={() => onSpotSelect(spot.id)}
                >
                  {spot.name}
                </button>
              ))}
            </div>
          </div>

          <div className="control-card control-card--era">
            <div className="control-header">
              <span className="control-title">年代</span>
              {currentEra && <span className="control-value">{currentEra.title}</span>}
            </div>
            <div className="control-body">
              {timeline ? (
                <div className="era-slider">
                  <input
                    type="range"
                    min={0}
                    max={timeline.eras.length - 1}
                    step={1}
                    value={selectedEraIndex}
                    aria-label="年代スライダー"
                    onChange={(event) => setSelectedEraIndex(Number(event.target.value))}
                  />
                  <div className="era-slider__labels">
                    {timeline.eras.map((era, index) => (
                      <span
                        key={era.id}
                        className={`era-slider__label${index === selectedEraIndex ? ' era-slider__label--active' : ''}`}
                      >
                        {era.title}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <span className="control-placeholder">年代データを読み込み中...</span>
              )}
              {currentEra?.fallbackLayer && (
                <span className="control-hint control-hint--warning">※ 撮影欠損を {currentEra.fallbackLayer} で補完表示中</span>
              )}
            </div>
          </div>

          <div className="control-card control-card--xr">
            <div className="control-header">
              <span className="control-title">XR</span>
            </div>
            <div className="control-body">
              {xrAvailable && (
                <button
                  type="button"
                  className="xr-button"
                  disabled={!xrAvailable || isCheckingXR}
                  onClick={handleEnterXR}
                >
                  {xrButtonLabel}
                </button>
              )}

              {showQuickLook && (
                <>
                  {hasQuickLookCompanion &&
                    createElement('model-viewer', {
                      style: { width: 0, height: 0, position: 'absolute', visibility: 'hidden' },
                      src: QUICK_LOOK_GLB,
                      'ios-src': QUICK_LOOK_USDZ,
                      ar: true,
                      'ar-modes': 'quick-look',
                      'ar-scale': 'fixed',
                    })}
                  <a className="quicklook-button" rel="ar" href={QUICK_LOOK_USDZ}>
                    Quick Lookで見る
                  </a>
                </>
              )}

              {quickLookMissing && (
                <span className="control-hint control-hint--warning">
                  Quick Look用の`/public/models/board.usdz`を配置するとARフォールバックが有効になります。
                </span>
              )}

              <span className="control-hint">
                対応端末ではWebXR（AR/VR）へ遷移。未対応環境ではQuick Lookフォールバックを提供します。
              </span>
              {showArPrepHint && (
                <span className="control-hint control-hint--info">AR開始時は端末をゆっくり動かし床面を検出してください。</span>
              )}
              {xrError && <span className="control-error">{xrError}</span>}
            </div>
          </div>
        </div>

        {isMobileViewport && (
          <button
            type="button"
            className={`mobile-toggle${controlsAreExpanded ? ' mobile-toggle--active' : ''}`}
            onClick={() => setIsMobileControlsOpen((prev) => !prev)}
            aria-pressed={controlsAreExpanded}
            aria-label={controlsAreExpanded ? '操作パネルを閉じる' : '操作パネルを開く'}
          >
            {controlsAreExpanded ? 'パネルを閉じる' : '操作パネル'}
          </button>
        )}

        {dataError && <div className="data-error">{dataError}</div>}
        <div ref={xrContainerRef} className="xr-canvas-host" />
      </div>
    </div>
  );
}

function setupEraLayers(map: MapLibreMap, timeline: TimelineData) {
  timeline.eras.forEach((era) => {
    const sourceId = sourceIdForEra(era.id);
    if (!map.getSource(sourceId)) {
      const extension = ERA_TILE_EXTENSION[era.layer] ?? 'png';
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [`${TILE_ROOT}/${era.layer}/{z}/{x}/{y}.${extension}`],
        tileSize: 256,
        maxzoom: 17,
      });
    }

    if (era.fallbackLayer) {
      const fallbackSourceId = fallbackSourceIdForEra(era.id);
      if (!map.getSource(fallbackSourceId)) {
        const fallbackExtension = ERA_TILE_EXTENSION[era.fallbackLayer] ?? 'jpg';
        map.addSource(fallbackSourceId, {
          type: 'raster',
          tiles: [`${TILE_ROOT}/${era.fallbackLayer}/{z}/{x}/{y}.${fallbackExtension}`],
          tileSize: 256,
          maxzoom: 17,
        });
      }

      const fallbackLayerId = fallbackLayerIdForEra(era.id);
      if (!map.getLayer(fallbackLayerId)) {
        map.addLayer({
          id: fallbackLayerId,
          type: 'raster',
          source: fallbackSourceId,
          layout: { visibility: 'visible' },
          paint: {
            'raster-opacity': 0,
            'raster-fade-duration': FADE_DURATION,
          },
        });
      }
    }

    const layerId = layerIdForEra(era.id);
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        layout: { visibility: 'visible' },
        paint: {
          'raster-opacity': 0,
          'raster-fade-duration': FADE_DURATION,
        },
      });
    }
  });
}

function setupOldSeaLayers(map: MapLibreMap) {
  if (!map.getSource('oldsea')) {
    map.addSource('oldsea', {
      type: 'geojson',
      data: '/data/old_sea.geojson',
    });
  }

  if (!map.getLayer('oldsea-fill')) {
    map.addLayer({
      id: 'oldsea-fill',
      type: 'fill',
      source: 'oldsea',
      paint: {
        'fill-color': '#0077FF',
        'fill-opacity': 0.3,
      },
    });
  }

  if (!map.getLayer('oldsea-line')) {
    map.addLayer({
      id: 'oldsea-line',
      type: 'line',
      source: 'oldsea',
      paint: {
        'line-color': '#0077FF',
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
    });
  }
}

function sourceIdForEra(id: string) {
  return `era-src-${id}`;
}

function fallbackSourceIdForEra(id: string) {
  return `era-src-${id}-fallback`;
}

function layerIdForEra(id: string) {
  return `era-${id}`;
}

function fallbackLayerIdForEra(id: string) {
  return `era-${id}-fallback`;
}

function computeOldSeaFillOpacity(index: number, total: number) {
  if (total <= 1) return 0.25;
  const ratio = 1 - index / (total - 1);
  return 0.18 + ratio * 0.22;
}

function computeOldSeaLineOpacity(index: number, total: number) {
  if (total <= 1) return 0.9;
  const ratio = 1 - index / (total - 1);
  return 0.4 + ratio * 0.6;
}

function animateLayerOpacity(
  map: MapLibreMap,
  layerId: string,
  target: number,
  animations: Map<string, number>,
) {
  if (!map.getLayer(layerId)) return;

  const clampedTarget = clamp(target, 0, 1);
  const startOpacity = (map.getPaintProperty(layerId, 'raster-opacity') as number) ?? 0;
  if (Math.abs(startOpacity - clampedTarget) < 0.001) {
    map.setPaintProperty(layerId, 'raster-opacity', clampedTarget);
    return;
  }

  const existingAnimation = animations.get(layerId);
  if (existingAnimation) {
    cancelAnimationFrame(existingAnimation);
    animations.delete(layerId);
  }

  const startTime = performance.now();

  const step = (now: number) => {
    const progress = clamp((now - startTime) / FADE_DURATION, 0, 1);
    const eased = easeInOut(progress);
    const current = startOpacity + (clampedTarget - startOpacity) * eased;
    map.setPaintProperty(layerId, 'raster-opacity', current);

    if (progress < 1) {
      const frameId = requestAnimationFrame(step);
      animations.set(layerId, frameId);
    } else {
      animations.delete(layerId);
      map.setPaintProperty(layerId, 'raster-opacity', clampedTarget);
    }
  };

  const frameId = requestAnimationFrame(step);
  animations.set(layerId, frameId);
}

export default App;


