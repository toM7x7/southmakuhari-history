# v0 Implementation Checkpoint

## 完了 (D1 着手範囲)
- Vite + React + TypeScript の足場を構築し、MapLibre GL を導入。
- 地理院タイル (std) をベースレイヤとして読み込み。
- `/public/data/timeline.json` / `old_sea.geojson` の初版を配置し、コンポーネントからフェッチ。
- 年代スライダーと旧海ラインの透過度連動、スポット切替 UI を実装。

## 次タスク案 (優先順)
1. **年代レイヤの読み込み最適化**
   - レイヤ初期化時に `map.setPaintProperty` を用いたフェード補間の調整 (現状 350ms)。
   - レイヤの `minzoom`/`maxzoom` をマップし直し、リクエスト負荷を検証。
2. **旧海ラインの精緻化 (D4)**
   - `old_sea.geojson` を細分化し、年代別アルファカーブの調整。
   - 推定ラインの注記テキストを UI モーダルに反映。
3. **XR 板モデルの準備 (D5–D6)**
   - Three.js を導入し、WebXR マネージャーの初期化土台を用意。
   - スライダーと板テクスチャの同期モック。
4. **iOS フォールバック (D7)**
   - `<model-viewer>` を読み込み、Quick Look 用 USDZ プレースホルダを配置。
   - XR ボタンをクライアント環境で分岐制御。
5. **UI 仕上げ (D8)**
   - クレジット常設表示をアクセシブルに微調整。
   - 注意モーダル・ヒントテキスト・Vision Pro 向けトグル文言などを配置。
6. **QA & キャッシュ戦略 (D9–D10)**
   - Vercel デプロイ用設定 (HTTP キャッシュヘッダ) を設計。
   - 主要ブラウザ／デバイスの動作確認リスト作成。

## データ/ファイル TODO
- `old_sea.geojson` の座標精度向上 (GSI 1961–69, 1945–50 を参照)。
- `public/models/board.usdz` など XR フォールバック用アセットの配置先確定。
- タイムラインに年表 (Should 要件) を拡張する場合の `timeline.json` スキーマ案。
