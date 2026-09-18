# DeepSeek Web API Proxy — Техническая документация

## Обзор

FreeDeepseekAPI — это локальный API-прокси сервер для веб-версии DeepSeek Chat (chat.deepseek.com), предоставляющий доступ к моделям DeepSeek-V3, DeepSeek-R1 (Thinking/Reasoning), Web Search и Native Vision через стандартные интерфейсы:
- OpenAI API (/v1/chat/completions, /v1/models, /v1/responses)
- Anthropic Messages API (/v1/messages для Claude Code и Anthropic SDK)
- Zero Dependencies: чистый Node.js 18+ без сторонних npm-пакетов.

---

## 1. Архитектура и схема работы

```text
┌─────────────────────────────────────────────────────────────┐
│                    Клиенты и приложения                     │
│  (Telegram-боты, Python/Node.js скрипты, Claude Code, etc)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            POST /v1/chat/completions / /v1/messages
            (Текст, Промпты, Изображения Base64, Запросы)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   FreeDeepseekAPI Proxy                     │
│                    (Node.js • Port 9655)                    │
│                                                             │
│ 1. Извлечение текста, tools и Base64 картинок               │
│ 2. Селекция сессий (X-Agent-Session / User ID)              │
│ 3. WASM PoW Challenge Solver (WebAssembly sha3)             │
│ 4. Двухэтапная загрузка файлов (upload_file + ref_file_ids) │
└──────┬───────────────────────┬───────────────────────┬──────┘
       │                       │                       │
       ▼                       ▼                       ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  PoW Solver  │       │ File Upload  │       │ Chat Stream  │
│  /api/v0/    │       │  /api/v0/    │       │  /api/v0/    │
│  chat/create │       │  file/upload │       │  chat/       │
│  _pow_       │       │  _file &     │       │  completion  │
│  challenge   │       │  fetch_files │       │              │
└──────┬───────┘       └───────┬──────┘       └───────┬──────┘
       │                       │                      │
       └───────────────────────┼──────────────────────┘
                               ▼
            ┌────────────────────────────────────┐
            │       Серверы DeepSeek Web         │
            │       (chat.deepseek.com)          │
            │  DeepSeek-V3 / DeepSeek-R1 Vision  │
            └────────────────────────────────────┘
```

---

## 2. Реверс-инжиниринг протокола DeepSeek Web

### 2.1 Авторизация и заголовки
Каждый запрос к https://chat.deepseek.com требует наличия следующих заголовков:
```http
Authorization: Bearer <user_web_token>
Cookie: aws-waf-token=...; smidV2=...; ds_session_id=...
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...
x-client-platform: web
x-client-version: 2.0.0
x-app-version: 2.0.0
Origin: https://chat.deepseek.com
Referer: https://chat.deepseek.com/
```

### 2.2 Proof-of-Work (PoW) алгоритм
Для предотвращения бот-атак DeepSeek требует решения криптографической задачи (PoW) перед каждым вызовом генерации или загрузки файлов:

1. Запрос челленджа:
   ```http
   POST https://chat.deepseek.com/api/v0/chat/create_pow_challenge
   Content-Type: application/json

   { "target_path": "/api/v0/chat/completion" } 
   -- или для загрузки файлов:
   { "target_path": "/api/v0/file/upload_file" }
   ```
2. Ответ сервера содержит algorithm, challenge, salt, expire_at, difficulty, signature.
3. Решение вычисляется с помощью WebAssembly-модуля DeepSeek (sha3_wasm_bg.wasm):
   ```javascript
   const prefix = challenge.salt + '_' + challenge.expire_at + '_';
   // Передача параметров в память WASM и вызов wasm_solve(...)
   ```
4. Полученный ответ упаковывается в Base64 и передаётся в заголовке X-DS-PoW-Response:
   ```json
   {
     "algorithm": "DeepSeekHashV1",
     "challenge": "...",
     "salt": "...",
     "answer": 42189,
     "signature": "...",
     "target_path": "/api/v0/chat/completion"
   }
   ```

---

## 3. Протокол загрузки файлов и Vision

### 3.1 Загрузка файла (/api/v0/file/upload_file)
```http
POST https://chat.deepseek.com/api/v0/file/upload_file
X-DS-PoW-Response: <base64_pow_for_upload_file>
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

------WebKitFormBoundary...
Content-Disposition: form-data; name="file"; filename="task.png"
Content-Type: image/png

<binary bytes>
------WebKitFormBoundary...--
```

Ответ:
```json
{
  "code": 0,
  "msg": "",
  "data": {
    "biz_data": {
      "id": "file-55174295-bfe0-40f8-8de8-4ae63510bc04",
      "status": "PENDING",
      "file_name": "task.png",
      "file_size": 15420,
      "model_kind": "VISION",
      "is_image": true
    }
  }
}
```

### 3.2 Опрос статуса файла (/api/v0/file/fetch_files)
Прокси опрашивает статус файла с интервалом 1 сек:
```http
GET https://chat.deepseek.com/api/v0/file/fetch_files?file_ids=file-55174295-bfe0-40f8-8de8-4ae63510bc04
```
Когда status === "SUCCESS" — файл готов к использованию в диалоге.

### 3.3 Прикрепление файла к генерации (ref_file_ids)
```http
POST https://chat.deepseek.com/api/v0/chat/completion
X-DS-PoW-Response: <base64_pow_for_completion>
Content-Type: application/json

{
  "chat_session_id": "8bbb6252-1fa8-4436-b5c0-ee91fd2dfb41",
  "parent_message_id": null,
  "model_type": "default",
  "prompt": "Реши задачу на прикрепленном чертеже.",
  "ref_file_ids": ["file-55174295-bfe0-40f8-8de8-4ae63510bc04"],
  "thinking_enabled": true,
  "search_enabled": false
}
```

---

## 4. Справочник API эндпоинтов прокси

### 4.1 POST /v1/chat/completions (OpenAI Compatible)

#### Заголовки
| Заголовок | Обязательный | Описание |
| :--- | :---: | :--- |
| Content-Type | Да | application/json |
| Authorization | Нет | Bearer <любой_токен> |
| X-Agent-Session | Нет | Идентификатор сессии/пользователя (для изоляции контекста) |

#### Тело запроса (Текст)
```json
{
  "model": "deepseek-reasoner",
  "messages": [
    { "role": "system", "content": "Ты помощник по математике." },
    { "role": "user", "content": "Реши уравнение 3x² - 12 = 0" }
  ],
  "stream": false
}
```

#### Тело запроса (Multimodal Image / Vision)
```json
{
  "model": "deepseek-reasoner",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Опиши подробно изображение и реши задачу:" },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." } }
      ]
    }
  ]
}
```

#### Формат ответа
```json
{
  "id": "ds-1789665005591",
  "object": "chat.completion",
  "created": 1789665005,
  "model": "deepseek-reasoner",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Уравнение: 3x² - 12 = 0\n1. 3x² = 12\n2. x² = 4\n3. x = ±2\n\nОтвет: x = 2 или x = -2.",
        "reasoning_content": "1. Переносим -12 в правую часть со сменой знака...\n2. Делим обе части на 3...\n3. Извлекаем квадратный корень..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 120,
    "total_tokens": 140,
    "completion_tokens_details": {
      "reasoning_tokens": 85
    }
  }
}
```

---

### 4.2 POST /v1/messages (Anthropic Compatible)
Полная совместимость со спецификацией Anthropic Messages API (для Claude Code):
```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "user", "content": "Hello, Claude Code style!" }
  ],
  "max_tokens": 4096
}
```

---

### 4.3 GET /v1/models
Возвращает список поддерживаемых моделей:
```json
{
  "object": "list",
  "data": [
    { "id": "deepseek-chat", "object": "model", "real_model": "DeepSeek-V3" },
    { "id": "deepseek-reasoner", "object": "model", "real_model": "DeepSeek-R1 (Thinking)" },
    { "id": "deepseek-chat-search", "object": "model", "real_model": "DeepSeek-V3 + Web Search" },
    { "id": "deepseek-reasoner-search", "object": "model", "real_model": "DeepSeek-R1 + Web Search" },
    { "id": "deepseek-vision", "object": "model", "real_model": "DeepSeek Native Vision" }
  ]
}
```

---

### 4.4 POST /reset-session?agent=<id>
Сбрасывает историю переписки для указанного агента/пользователя:
```bash
curl -X POST "http://localhost:9655/reset-session?agent=tg_821315597"
# Или сброс всех сессий:
curl -X POST "http://localhost:9655/reset-session?agent=all"
```

---

## 5. Примеры интеграции на разных языках

### Python (aiohttp / Async)
```python
import aiohttp
import asyncio
import base64

async def ask_deepseek_vision(image_path: str, question: str):
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    payload = {
        "model": "deepseek-reasoner",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": question},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
                ]
            }
        ]
    }

    async with aiohttp.ClientSession() as session:
        async with session.post("http://localhost:9655/v1/chat/completions", json=payload) as resp:
            data = await resp.json()
            choice = data["choices"][0]["message"]
            print("Рассуждения:", choice.get("reasoning_content"))
            print("Ответ:", choice.get("content"))

asyncio.run(ask_deepseek_vision("math_task.jpg", "Реши задачу на фото."))
```

### Node.js (Fetch)
```javascript
import fs from 'fs';

async function main() {
  const imgBase64 = fs.readFileSync('chart.png').toString('base64');
  
  const res = await fetch('http://localhost:9655/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-reasoner',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Проанализируй график на картинке:' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imgBase64}` } }
          ]
        }
      ]
    })
  });
  
  const data = await res.json();
  console.log(data.choices[0].message.content);
}

main();
```

---

## 6. Безопасность и хранение данных

1. Файл deepseek-auth.json содержит сессионный токен и WAF-куки. Храните его в секрете и добавьте в .gitignore.
2. Все запросы выполняются локально на вашем сервере без отправки данных сторонним провайдерам (напрямую в DeepSeek).
3. Токены и сессии изолированы: запросы от разных пользователей (user / X-Agent-Session) не видят контекст друг друга.
