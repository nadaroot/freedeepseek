# FreeDeepseekAPI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](./Dockerfile)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Локальный OpenAI / Anthropic-compatible API proxy для DeepSeek Web Chat с поддержкой изображений, Function Calling, веб-поиска и изоляции сессий.

---

## О проекте

FreeDeepseekAPI — это высокопроизводительный локальный API-прокси сервер для веб-версии DeepSeek Chat (`chat.deepseek.com`), предоставляющий доступ к моделям DeepSeek-V3, DeepSeek-R1 (Reasoning), Web Search, Function Calling и распознаванию изображений через стандартные интерфейсы:
- OpenAI Chat Completions API (`/v1/chat/completions`)
- Anthropic Messages API shim (`/v1/messages` для Claude Code / Roo-Code / Cline)
- OpenAI Responses API shim (`/v1/responses`)

Сервер работает напрямую через веб-протокол DeepSeek с автоматическим решением криптографических задач Proof-of-Work (PoW) через WebAssembly.

---

## Авторство и благодарности

* Изначальный автор проекта: ForgetMeAI (базовая версия FreeDeepseekAPI с реверс-инжинирингом PoW и эмуляцией OpenAI/Anthropic эндпоинтов).
* Форк и адаптация под Claude Code: crubly/FreeDeepseekAPI.
* Доработки, загрузка файлов, Vision, Docker и Tools: nadaroot.

---

## Возможности

* OpenAI Chat Completions API: `POST /v1/chat/completions` (streaming SSE и non-streaming JSON).
* Anthropic Messages API shim: `POST /v1/messages` (для Claude Code, Cline, Roo-Code).
* Function Calling & Tools: эмуляция вызова функций и инструментов для интеграции с LangChain, CrewAI, AutoGen и OpenAI SDK.
* Поддержка DeepSeek-R1: вывод пошагового хода мыслей в поле `reasoning_content`.
* Web Search: прямое управление интернет-поиском через параметры запроса (`"search_enabled": true`) или суффикс модели `-search`.
* Решение PoW: генерация решений Proof-of-Work через встроенный модуль WebAssembly (`sha3_wasm_bg.wasm`).
* Загрузка изображений и документов: двухэтапная загрузка файлов через `/api/v0/file/upload_file` и `/api/v0/file/fetch_files` с привязкой `ref_file_ids` к сессии.
* Поддержка OpenAI Multimodal формата: передача картинок через base64 data URLs или локальные пути на диске.
* Прокси: поддержка HTTP/HTTPS/SOCKS5 прокси как глобально, так и индивидуально для каждого аккаунта.
* Изоляция сессий: заголовок `X-Agent-Session` или поле `user` разделяет контекст между разными пользователями.
* Docker & Compose: быстрый запуск в изолированном контейнере.
* Zero external runtime dependencies: чистый Node.js 18+ без внешних тяжелых npm-пакетов.

---

## Быстрый старт

### Вариант 1: Запуск через Docker Compose (Рекомендуется)

1. Клонируйте репозиторий:
```bash
git clone https://github.com/nadaroot/freedeepseek.git deepseek-api
cd deepseek-api
```

2. Подготовьте `deepseek-auth.json` (скопируйте из `auth.example.json` и укажите ваш токен):
```bash
cp auth.example.json deepseek-auth.json
```

3. Запустите контейнер:
```bash
docker compose up -d
```

Сервер доступен по адресу `http://localhost:9655`.

---

### Вариант 2: Локальный запуск (Node.js)

#### Требования
* Node.js 18+
* Google Chrome или Chromium (для автоматического получения токена)

1. Авторизация аккаунта:
```bash
npm run auth
```
- Выберите пункт 1 (Авторизоваться через Chrome).
- Войдите в свой аккаунт на `chat.deepseek.com`.
- Отправьте любое тестовое сообщение (например, "привет").
- Токен и куки автоматически сохранятся в `deepseek-auth.json`.

2. Запуск сервера:
```bash
npm start
```

---

## Готовые интеграции

В папке [`integrations/`](./integrations/) доступны готовые файлы конфигурации и инструкции для подключения:

* **[LibreChat](./integrations/librechat/librechat.example.yaml)**
* **[Open-WebUI](./integrations/open-webui/README.md)**
* **[Cursor IDE](./integrations/cursor/README.md)**
* **[Continue.dev](./integrations/continue/config.example.json)**
* **[NextChat](./integrations/nextchat/README.md)**
* **[Cline & Roo-Code](./integrations/cline/README.md)**

---

## Примеры использования

### 1. Python (библиотека openai)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:9655/v1",
    api_key="sk-freedeepseek"
)

response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {"role": "user", "content": "Реши уравнение 2x^2 - 8 = 0 с пояснениями."}
    ]
)

choice = response.choices[0].message
if hasattr(choice, "reasoning_content") and choice.reasoning_content:
    print(f"--- Ход мыслей (R1): ---\n{choice.reasoning_content}\n")

print(f"--- Ответ: ---\n{choice.content}")
```

### 2. Распознавание изображений (Vision)

```python
import base64
from openai import OpenAI

client = OpenAI(base_url="http://localhost:9655/v1", api_key="sk-freedeepseek")

with open("task.jpg", "rb") as f:
    b64_img = base64.b64encode(f.read()).decode("utf-8")

response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Что изображено на этом фото?"},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
            ]
        }
    ]
)

print(response.choices[0].message.content)
```

### 3. Function Calling / Tools

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:9655/v1", api_key="sk-freedeepseek")

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Получить погоду в городе",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "Название города"}
                },
                "required": ["city"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "Какая погода в Санкт-Петербурге?"}],
    tools=tools
)

print(response.choices[0].message.tool_calls)
```

---

## Доступные модели

| Идентификатор модели | Базовая модель Web | Описание | Поддержка Vision |
| :--- | :--- | :--- | :---: |
| `deepseek-chat` / `deepseek-v3` | DeepSeek-V3 (Быстрый) | Быстрый чат, ответы на вопросы, генерация кода | Да |
| `deepseek-reasoner` / `deepseek-r1` | DeepSeek-R1 (Рассуждения) | Пошаговое мышление (`reasoning_content`), математика | Да |
| `deepseek-chat-search` | DeepSeek-V3 + Поиск | Свежие данные из интернета | Да |
| `deepseek-reasoner-search` | DeepSeek-R1 + Поиск | Анализ с источниками из интернета | Да |
| `deepseek-coder` | DeepSeek Coder | Оптимизировано под написание кода | Да |
| `deepseek-vl` | DeepSeek Native Vision | Распознавание фото, схем, таблиц и документов | Да |

---

## API Endpoints

* `POST /v1/chat/completions` — Основной OpenAI Chat Completions endpoint.
* `POST /v1/messages` — Эмуляция Anthropic Messages API (для Claude Code / Anthropic SDK).
* `POST /v1/responses` — Эмуляция OpenAI Responses API.
* `GET /v1/models` — Список активных моделей.
* `GET /v1/model-capabilities` — Подробная информация о возможностях моделей.
* `POST /reset-session?agent=<id>` — Сброс памяти конкретной сессии.
* `POST /reset-session?agent=all` — Сброс всех активных сессий.
* `GET /health` — Проверка статуса сервера и аккаунтов.

---

## Лицензия

Проект распространяется под лицензией MIT. Подробнее см. в файле [LICENSE](./LICENSE).
