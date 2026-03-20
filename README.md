# WebUI

A modern, lightweight chat interface for OpenAI-compatible APIs.

Connect to Ollama, OpenAI, Anthropic, Google AI, or any OpenAI-compatible endpoint.

## Features

- **Streaming responses** — Real-time token-by-token output
- **File attachments** — Images, PDFs, and text files
- **Rich rendering** — Markdown, LaTeX math, code highlighting, Mermaid diagrams
- **Conversation management** — Save, restore, and duplicate chats
- **Model registry** — Search and select models from models.dev
- **Inference controls** — Temperature, top-p, top-k, max tokens, and more
- **Dark mode** — Light and dark themes
- **Responsive** — Works on desktop and mobile

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ihasq/webui.git
cd webui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Configuration

Click the settings icon in the sidebar to configure:

| Setting | Description |
|---------|-------------|
| API Endpoint | Your LLM server URL (e.g., `http://localhost:11434/v1` for Ollama) |
| API Key | Required for cloud providers |
| Model | Model name or select from registry |
| System Prompt | Custom system instructions |

### Example: Ollama

```
API Endpoint: http://localhost:11434/v1
Model: llama3.2
```

### Example: OpenAI

```
API Endpoint: https://api.openai.com/v1
API Key: sk-...
Model: gpt-4o
```

## Build

```bash
npm run build
```

Output is in the `dist` directory, ready to deploy to any static hosting.

## Tech Stack

- [React 19](https://react.dev)
- [Vite](https://vite.dev)
- [Tailwind CSS 4](https://tailwindcss.com)
- [Streamdown](https://github.com/nicholasxjy/streamdown) — Markdown rendering
- [KaTeX](https://katex.org) — Math typesetting

## License

MIT
