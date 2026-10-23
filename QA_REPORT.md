# Snack & Dash v0.0.1.0 — QA REPORT

検証日：2026-10-23

## 通過したテスト

- JavaScript: `node --check` で `art.js`、`audio.js`、`game.js`、`controls.js`、`app.js` の構文チェック
- Chromiumのテスト用DOMで、デスクトップの矢印キー移動とESC一時停止・再開
- タッチUIを持つ画面でジョイスティック移動、Pointer Eventsでの指離し時の停止
- タッチDASHによる一度だけの残数消費
- 十字キー・左右反転・設定切替、`pointercancel`での入力解除
- 端末縦向きと横向きのUI配置（スクリーンショット目視）
- Gamepad API模擬機器でスティック移動、押しっぱなしダッシュ重複防止、Start系で一時停止
- 既存の得点保存スキーマと敵の速度式が変更されていないこと
- ブラウザの未捕捉JavaScript例外0件（上記の試験シナリオ）

## 注意

- Chromiumのテスト実行環境で `localhost` と `file://` が管理者ポリシーによりブロックされたため、ブラウザ統合テストはテスト用DOMへのインライン読み込みで実施。HTTPの実配信・Cloudflare本番デプロイは対象外。
- iOS Safari、Android Chrome、実物のXbox/PlayStation/Switchコントローラーでは未実施。
- OS・ブラウザ・メーカー固有のGamepad APIのマッピングは異なり得ます。
- テストが全ブラウザでの100%動作を保証するものではありません。
- 音声合成の既存実装は変更せず、音声の重複発音バグについての根本修正はこのバージョンの対象外です。
