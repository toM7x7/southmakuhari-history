# 南幕張ヒストリア v0 開発メモ

## プロダクト概要
JR幕張駅〜海浜幕張駅周辺の“昔は海だった”情景を、年代別空中写真と旧海ラインの重ね合わせで体験するWebアプリです。MapLibre GLで2Dマップを描画し、Three.js + WebXRで2m角のフェードボードをAR/VR空間に展開します。iOS端末向けにはQuick Lookフォールバックを次段で追加予定です。

## セットアップ
1. 依存関係を取得
   ```bash
   npm install
   ```
2. 開発サーバーを起動
   ```bash
   npm run dev
   ```
   ブラウザで表示されるローカルURLにアクセスすると、年代スライダー・スポット切替UI付きのMapLibre地図が動作します。
3. 型チェック＋本番ビルド
   ```bash
   npm run build
   ```
4. Lint
   ```bash
   npm run lint
   ```

## WebXR/ARボード
- 画面右下の「ARモードで見る / VRモードで見る」ボタンからWebXRセッションへ遷移します（端末が対応している場合）。
- セッション開始時に現在のマップ中心座標と選択年代からタイルを取得し、2m角のボードテクスチャを生成します。
- 1984–86年のレイヤは地理院タイル側の撮影欠損が多く404になるため、自動で1987–90年(gazo4)を薄く補完してからボードに適用します。
- セッション終了時はThree.jsのレンダリングループとXRセッションを確実にdisposeしているため、ブラウザバックでの復帰も安全です。

## 年代スライダーの構成理由
| 年代 | タイルID | 選定理由 |
|----|----|----|
| 1945–50 | `ort_USA10` | 米軍撮影の戦後直後写真。干潟・埋立開始前の海岸線が明瞭。 |
| 1961–69 | `ort_old10` | 千葉港の大規模埋立準備期。旧海ラインの変遷が確認可能。 |
| 1974–78 | `gazo1` | 幕張新都心計画に向けた造成期。干潟から埋立地への遷移が顕著。 |
| 1979–83 | `gazo2` | 住宅・鉄道インフラの整備が進む前夜。JR・京葉線双方の文脈が分かる。 |
| 1984–86* | `gazo3` (+ `gazo4` 補完) | 地理院タイルの欠損が多いため1987–90年(`gazo4`)を透過合成。ボード側も同様に補完。 |
| 1987–90 | `gazo4` | 現在の幕張新都心の基礎がほぼ完成し、比較対象として重要。 |
| 現在 | `ort` | 直近のオルソ画像。現地散策時の見比べに使用。 |

`*` 1984–86タイルの404状況は以下のHEADリクエストで確認済みです。
```
https://cyberjapandata.gsi.go.jp/xyz/gazo3/16/58263/25813.jpg -> 404
https://cyberjapandata.gsi.go.jp/xyz/gazo3/16/58263/25812.jpg -> 404
```
そのためUIラベルでも「1984–86*」とし、READMEで補足しています。

## データと出典
- 年代別空中写真: 地理院タイル（出典：地理院タイル｜年代別の写真・オルソ画像）
- 旧海ライン: `/public/data/old_sea.geojson` に推定ポリゴンを格納（properties.confidence=`estimated`）。
- スポット: `/public/data/timeline.json` の `spots` に駅座標を定義。

アプリ画面右上にも常時クレジットを表示し、一覧ページへリンクしています。

## Vercel デプロイ手順（共有用）
1. Vercel CLIをセットアップ
   ```bash
   npm install -g vercel
   vercel login
   ```
2. プロジェクトを初期化
   ```bash
   vercel --prod
   ```
   - Framework: `Vite`
   - Build command: `npm run build`
   - Output directory: `dist`
3. 環境変数は不要。再デプロイは
   ```bash
   vercel --prod
   ```
   でOKです。
4. デフォルトでは静的ファイルが配信されます。タイルアクセスのレスポンス改善が必要な場合は `vercel.json` で `cache-control` を調整します（例: `s-maxage=86400, stale-while-revalidate=3600`）。

## 今後のTODOメモ
- `<model-viewer>` を導入し、iOS SafariでQuick Look (USDZ) にフォールバック。
- 旧海ラインの再トレースとconfidence別バリエーション付け。
- Vision Pro向けのUI文言とVRガイドの追加。
- Vercelデプロイに合わせた自動QA（E2E）フロー整備。
- PMTilesやPLATEAU連携の実証。

---
本READMEはUTF-8（BOM付）で保存しています。IDEで開いた際に文字化けする場合はUTF-8を明示してください。
