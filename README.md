# FreeDeepseekAPI

Локальный OpenAI / Anthropic-compatible API proxy для DeepSeek Web Chat с поддержкой изображений и файлов.

---

## О проекте

FreeDeepseekAPI — это локальный API-прокси сервер для веб-версии DeepSeek Chat (chat.deepseek.com), предоставляющий доступ к моделям DeepSeek-V3, DeepSeek-R1 (Reasoning), Web Search и распознаванию изображений через стандартные интерфейсы OpenAI API, Anthropic Messages API и OpenAI Responses API.

Сервер работает напрямую через веб-протокол DeepSeek с автоматическим решением криптографических задач Proof-of-Work (PoW) через WebAssembly. Это позволяет использовать DeepSeek в сторонних клиентах (Open WebUI, Telegram-боты, Claude Code, LiteLLM, Cursor, Python/Node.js скрипты).

---

## Авторство и благодарности

* Изначальный автор проекта: ForgetMeAI (базовая версия FreeDeepseekAPI с реверс-инжинирингом PoW и эмуляцией OpenAI/Anthropic эндпоинтов).
* Форк и адаптация под Claude Code: crubly/FreeDeepseekAPI.
* Доработки, загрузка файлов и Vision: nadaroot.

---

## Возможности

* OpenAI Chat Completions API: POST /v1/chat/completions (streaming SSE и non-streaming JSON).
* Anthropic Messages API shim: POST /v1/messages (для Claude Code / Anthropic SDK).
* OpenAI Responses API shim: POST /v1/responses.
* Поддержка DeepSeek-R1: вывод пошагового хода мыслей в поле reasoning_content.
* Решение PoW: генерация решений Proof-of-Work через встроенный модуль WebAssembly (sha3_wasm_bg.wasm).
* Поиск в интернете: поддержка веб-поиска DeepSeek через суффикс -search.
* Загрузка изображений и документов: двухэтапная загрузка файлов через /api/v0/file/upload_file и /api/v0/file/fetch_files с привязкой ref_file_ids к сессии.
* Поддержка OpenAI Multimodal формата: передача картинок через base64 data URLs или локальные пути на диске.
* Vision + DeepSeek-R1: анализ изображений с пошаговыми рассуждениями.
* Изоляция сессий: заголовок X-Agent-Session или поле user разделяет контекст между разными пользователями.
* Zero dependencies: чистый Node.js 18+ без внешних npm-пакетов.

---

## Быстрый старт

### Требования
* Node.js 18+
* Google Chrome или Chromium (для первичной авторизации)

### 1. Установка
```bash
git clone https://github.com/nadaroot/freedeepseek.git deepseek-api
cd deepseek-api
```

### 2. Авторизация аккаунта
Запустите меню авторизации:
```bash
npm run auth
```
1. Выберите пункт 1 (Авторизоваться через Chrome).
2. В открывшемся окне браузера войдите в свой аккаунт на chat.deepseek.com.
3. Отправьте любое тестовое сообщение (например, "привет").
4. Токен и куки автоматически сохранятся в файл deepseek-auth.json.

Либо заполните deepseek-auth.json вручную по примеру auth.example.json.

### 3. Запуск сервера
```bash
npm start
```
Сервер запустится на http://localhost:9655.

---

## Работа с изображениями (Vision)

### Способ 1: OpenAI Multimodal Format (Base64)
```json
{
  "model": "deepseek-reasoner",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Опиши подробно, что изображено на картинке, и реши задачу:" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/2f89eCAAAAAElFTkSuQmCC"
          }
        }
      ]
    }
  ]
}
```

### Способ 2: Локальный путь к файлу на сервере
```json
{
  "model": "deepseek-reasoner",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Реши геометрическую задачу на чертеже:" },
        { "type": "image_url", "image_url": { "url": "/tmp/geometry_task.jpg" } }
      ]
    }
  ]
}
```

### Способ 3: Массив images в корне запроса
```json
{
  "model": "deepseek-chat",
  "messages": [{ "role": "user", "content": "Что на этом рисунке?" }],
  "images": ["data:image/jpeg;base64,..."]
}
```

---

## Примеры запросов

### Python (библиотека openai)
```python
from openai import OpenAI
import base64

client = OpenAI(
    base_url="http://localhost:9655/v1",
    api_key="none"
)

with open("task.jpg", "rb") as f:
    b64_img = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Реши уравнение на фото:"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
            ]
        }
    ],
    extra_headers={"X-Agent-Session": "user_12345"}
)

choice = response.choices[0].message
if hasattr(choice, "reasoning_content") and choice.reasoning_content:
    print(f"--- Ход мыслей (R1): ---\n{choice.reasoning_content}\n")

print(f"--- Ответ: ---\n{choice.content}")
```

### cURL (Текстовый запрос с поиском в интернете)
```bash
curl http://localhost:9655/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat-search",
    "messages": [
      {"role": "user", "content": "Какой сегодня официальный курс доллара и евро?"}
    ]
  }'
```

### Node.js (Streaming SSE)
```javascript
const response = await fetch("http://localhost:9655/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "deepseek-reasoner",
    stream: true,
    messages: [{ role: "user", content: "Докажи теорему Пифагора простыми словами." }]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  for (const line of chunk.split("\n")) {
    if (line.startsWith("data: ") && !line.includes("[DONE]")) {
      const data = JSON.parse(line.slice(6));
      const text = data.choices[0]?.delta?.content || "";
      process.stdout.write(text);
    }
  }
}
```

---

## Доступные модели

| Идентификатор модели | Базовая модель Web | Описание | Поддержка Vision |
| :--- | :--- | :--- | :---: |
| deepseek-chat | DeepSeek-V3 (Быстрый) | Быстрый чат, ответы на вопросы, генерация кода | Да |
| deepseek-reasoner / deepseek-r1 | DeepSeek-R1 (Рассуждения) | Пошаговое мышление (reasoning_content), математика | Да |
| deepseek-chat-search | DeepSeek-V3 + Поиск | Свежие данные из интернета | Да |
| deepseek-reasoner-search | DeepSeek-R1 + Поиск | Анализ с источниками из интернета | Да |
| deepseek-expert | DeepSeek Expert | Экспертный режим модели | Да |
| deepseek-expert-search | DeepSeek Expert + Поиск | Экспертный режим с поиском в сети | Да |
| deepseek-vision | DeepSeek Native Vision | Распознавание фото, схем, таблиц и документов | Да |

---

## API Endpoints

* POST /v1/chat/completions — Основной OpenAI Chat Completions endpoint.
* POST /v1/messages — Эмуляция Anthropic Messages API (для Claude Code / Anthropic SDK).
* POST /v1/responses — Эмуляция OpenAI Responses API.
* GET /v1/models — Список активных моделей.
* GET /v1/model-capabilities — Подробная информация о возможностях моделей.
* POST /reset-session?agent=<id> — Сброс памяти конкретной сессии.
* POST /reset-session?agent=all — Сброс всех активных сессий.
* GET /health — Проверка статуса сервера и аккаунтов.

---

## Развертывание через systemd (Linux / VPS)

Для круглосуточной работы создайте файл службы /etc/systemd/system/deepseek-api.service:

```ini
[Unit]
Description=FreeDeepseekAPI Proxy Service
After=network.target

[Service]
Type=simple
User=kek
WorkingDirectory=/home/kek/deepseek/FreeDeepseekAPI
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=SKIP_ACCOUNT_MENU=1

[Install]
WantedBy=multi-user.target
```

Управление службой:
```bash
sudo systemctl daemon-reload
sudo systemctl enable deepseek-api
sudo systemctl start deepseek-api
sudo systemctl status deepseek-api
```

---

## Лицензия

MIT License. Подробнее см. в файле LICENSE.
