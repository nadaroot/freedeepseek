# Cline / Roo-Code Integration

FreeDeepseekAPI supports both Anthropic Messages format (`/v1/messages`) and OpenAI format (`/v1/chat/completions`).

### Option 1: OpenAI-Compatible Provider

- **API Provider**: OpenAI Compatible
- **Base URL**: `http://127.0.0.1:9655/v1`
- **API Key**: `sk-freedeepseek`
- **Model ID**: `deepseek-chat` or `deepseek-coder`

### Option 2: Anthropic-Compatible Provider

- **API Provider**: Anthropic
- **Base URL**: `http://127.0.0.1:9655`
- **API Key**: `sk-freedeepseek`
- **Model ID**: `claude-3-5-sonnet-20241022` (automatically mapped to DeepSeek-V3 / Coder)
