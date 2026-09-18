# Integrations and Clients

This directory contains pre-made configurations and setup instructions for popular AI clients and developer tools:

- **[LibreChat](./librechat/librechat.example.yaml)**: Full multi-model chat interface with artifacts and session management.
- **[Open-WebUI](./open-webui/README.md)**: Modern ChatGPT-like web interface.
- **[NextChat](./nextchat/README.md)**: Lightweight cross-platform web client.
- **[Cursor IDE](./cursor/README.md)**: AI-first code editor integration.
- **[Continue.dev](./continue/config.example.json)**: Open-source AI assistant for VS Code and JetBrains IDEs.
- **[Cline & Roo-Code](./cline/README.md)**: Autonomous coding agents.

### Quick Connection Parameters

- **Base URL**: `http://127.0.0.1:9655/v1` (or `http://host.docker.internal:9655/v1` for Docker containers)
- **API Key**: Any non-empty string (e.g., `sk-freedeepseek`)
- **Default Models**: `deepseek-chat`, `deepseek-reasoner`, `deepseek-v3`, `deepseek-r1`, `deepseek-coder`, `deepseek-vl`
