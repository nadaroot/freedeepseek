# Cursor IDE Integration

Use DeepSeek models inside Cursor for chat and code generation.

### Setup Steps:

1. Open Cursor Settings: `Cursor Settings` -> `Models`.
2. Disable default OpenAI API key or enable **OpenAI API Key**.
3. Click **Override OpenAI Base URL**:
   - URL: `http://127.0.0.1:9655/v1`
4. In the **Model Names** section, add:
   - `deepseek-chat`
   - `deepseek-coder`
   - `deepseek-reasoner`
5. Save settings and select the model in Cursor Chat (`Cmd+L` / `Ctrl+L`).
