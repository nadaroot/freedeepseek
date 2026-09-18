"""
Example of OpenAI SDK Function Calling with FreeDeepseekAPI.
"""

import json
import urllib.request

API_BASE = "http://127.0.0.1:9655/v1"

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_current_weather",
            "description": "Get current weather in a given location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name, e.g. London, Tokyo, Moscow"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["location"]
            }
        }
    }
]

def main():
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "user", "content": "Какая сейчас погода в Москве?"}
        ],
        "tools": tools,
        "temperature": 0.0
    }

    req = urllib.request.Request(
        f"{API_BASE}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choice = data["choices"][0]
            message = choice["message"]
            
            print("[Response Message]:")
            print(json.dumps(message, indent=2, ensure_ascii=False))
            
            if message.get("tool_calls"):
                print("\n[Tool Calls Detected]:")
                for tc in message["tool_calls"]:
                    fn = tc["function"]
                    print(f"Function: {fn['name']}")
                    print(f"Arguments: {fn['arguments']}")
            else:
                print("\nContent:", message.get("content"))
    except Exception as e:
        print("Request failed:", e)

if __name__ == "__main__":
    main()
