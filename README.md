# WebUI

OpenAI互換APIを使用するチャットUIです。Ollama、OpenAI、Anthropic、Google Generative AIなど、様々なLLMプロバイダーと連携できます。

## 機能

- **チャット**: テキストメッセージの送受信、ストリーミング対応
- **ファイル添付**: 画像、PDF、テキストファイルのアップロード
- **会話管理**: 複数の会話を保存・復元・複製
- **モデル選択**: models.devレジストリから利用可能なモデルを検索・選択
- **推論パラメータ**: Temperature、Top-P、Top-K、Max Tokens等を調整可能
- **メッセージ編集**: ユーザーメッセージの編集・再送信、アシスタント応答の再生成
- **リッチレンダリング**: Markdown、数式（KaTeX）、コードブロック、Mermaid図
- **ダークモード**: ライト/ダークテーマの切り替え
- **レスポンシブ**: モバイル・タブレット対応

## 技術スタック

- React 19 + TypeScript
- Vite
- Tailwind CSS 4
- Streamdown（マークダウンレンダリング）
- IndexedDB（添付ファイル保存）

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーが起動し、ブラウザでアクセスできます。

## ビルド

```bash
npm run build
npm run preview
```

## 対応API

OpenAI互換のAPIエンドポイントに対応しています：

- Ollama（ローカルLLM）
- OpenAI
- Anthropic
- Google Generative AI
- その他OpenAI互換エンドポイント

設定画面からAPIエンドポイント、APIキー、モデル名を設定してください。

## ライセンス

MIT
