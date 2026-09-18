# Open-WebUI Integration

Connect FreeDeepseekAPI to Open-WebUI via OpenAI API settings.

### Setup Steps:

1. Open Open-WebUI: `Settings` -> `Admin Settings` -> `Connections`.
2. In the **OpenAI API** section:
   - **URL**: `http://host.docker.internal:9655/v1` (if running in Docker) or `http://127.0.0.1:9655/v1` (if running locally).
   - **API Key**: `sk-freedeepseek` (any string).
3. Click the verify/refresh button. Open-WebUI will automatically fetch the available models:
   - `deepseek-chat` / `deepseek-v3` (Fast chat)
   - `deepseek-reasoner` / `deepseek-r1` (Reasoning mode)
   - `deepseek-vl` (Vision and image recognition)
