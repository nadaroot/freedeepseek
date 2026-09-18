#!/usr/bin/env python3
"""
Тестовый скрипт для проверки возможностей FreeDeepseekAPI:
1. Текстовый чат (DeepSeek-V3)
2. Рассуждения (DeepSeek-R1 / Reasoner)
3. Поиск в интернете (Web Search)
4. Распознавание изображений (Vision Multimodal)
"""

import urllib.request
import json
import base64
import sys

API_BASE = "http://localhost:9655/v1"

def call_api(payload, desc=""):
    print(f"\n==========================================")
    print(f"[TEST] {desc}")
    print(f"==========================================")
    req = urllib.request.Request(
        f"{API_BASE}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "X-Agent-Session": "test_suite"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            msg = data.get("choices", [{}])[0].get("message", {})
            reasoning = msg.get("reasoning_content")
            content = msg.get("content")
            
            if reasoning:
                print(f"[Рассуждения R1]:\n{reasoning[:300]}...\n")
            print(f"[Ответ]:\n{content}\n")
            print("[OK] Успешно завершено.")
            return True
    except Exception as e:
        print(f"[ERROR] Ошибка: {e}")
        return False

def main():
    try:
        with urllib.request.urlopen("http://localhost:9655/health", timeout=5) as resp:
            health = json.loads(resp.read().decode("utf-8"))
            print(f"[INFO] Сервер FreeDeepseekAPI активен. Аккаунтов: {len(health.get('accounts', []))}")
    except Exception as e:
        print(f"[ERROR] Сервер FreeDeepseekAPI недоступен на порту 9655: {e}")
        print("Запустите сервер командой: npm start")
        sys.exit(1)

    call_api({
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": "Скажи привет и представься в одном предложении."}]
    }, "DeepSeek-V3 (Текстовый чат)")

    call_api({
        "model": "deepseek-reasoner",
        "messages": [{"role": "user", "content": "Реши уравнение 2x² - 8 = 0. Дай краткий ответ со степенями."}]
    }, "DeepSeek-R1 (Рассуждения и математика)")

    sample_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/2f89eCAAAAAElFTkSuQmCC"
    call_api({
        "model": "deepseek-reasoner",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Опиши цвет и форму этой фигуры:"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{sample_b64}"}}
                ]
            }
        ]
    }, "DeepSeek Native Vision (Распознавание изображений)")

if __name__ == "__main__":
    main()
