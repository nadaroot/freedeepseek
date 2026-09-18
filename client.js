#!/usr/bin/env node
/**
 * DeepSeek Web API CLI Client
 * 
 * Usage:
 *   node client.js "your prompt here"
 *   node client.js --thinking "solve this math puzzle"
 *   node client.js --search "latest news today"
 *   node client.js -r -s "research topic with search and reasoning"
 * 
 * Flags:
 *   -r, --thinking, --reasoning  Enable R1 thinking/reasoning mode
 *   -s, --search, --web-search   Enable native web search
 *   -m, --model <name>           Specify model (default: deepseek-chat)
 *   -h, --help                   Show help
 */

const fs = require('fs');
const path = require('path');

// Load from env or config file
const CONFIG = {
    token: process.env.DEEPSEEK_TOKEN || '',
    hif_dliq: process.env.DEEPSEEK_HIF_DLIQ || '',
    hif_leim: process.env.DEEPSEEK_HIF_LEIM || '',
    cookie: process.env.DEEPSEEK_COOKIE || '',
    wasmUrl: process.env.DEEPSEEK_WASM_URL || 'https://fe-static.deepseek.com/chat/static/sha3_wasm_bg.7b9ca65ddd.wasm',
};

// Try loading from local auth files
try {
    for (const fileName of ['deepseek-auth.json', 'auth.json']) {
        const authPath = path.join(__dirname, fileName);
        if (fs.existsSync(authPath) && !CONFIG.token) {
            const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
            if (Array.isArray(auth.accounts) && auth.accounts.length > 0) {
                const acct = auth.accounts[0];
                CONFIG.token = acct.token || '';
                CONFIG.hif_dliq = acct.hif_dliq || '';
                CONFIG.hif_leim = acct.hif_leim || '';
                CONFIG.cookie = acct.cookie || '';
                CONFIG.wasmUrl = acct.wasmUrl || CONFIG.wasmUrl;
            } else {
                CONFIG.token = CONFIG.token || auth.token;
                CONFIG.hif_dliq = CONFIG.hif_dliq || auth.hif_dliq;
                CONFIG.hif_leim = CONFIG.hif_leim || auth.hif_leim;
                CONFIG.cookie = CONFIG.cookie || auth.cookie;
                CONFIG.wasmUrl = CONFIG.wasmUrl || auth.wasmUrl;
            }
        }
    }
} catch (e) {}

if (!CONFIG.token) {
    console.error('Error: DeepSeek auth is not set. Run `npm run auth`, or provide DEEPSEEK_TOKEN/DEEPSEEK_COOKIE via env.');
    console.error('Usage: node client.js "prompt"');
    process.exit(1);
}

const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'x-client-platform': 'web', 'x-client-version': '2.0.0',
    'x-client-locale': 'ru', 'x-client-timezone-offset': '14400', 'x-app-version': '2.0.0',
    'Authorization': `Bearer ${CONFIG.token}`,
    'x-hif-dliq': CONFIG.hif_dliq, 'x-hif-leim': CONFIG.hif_leim,
    'Origin': 'https://chat.deepseek.com', 'Referer': 'https://chat.deepseek.com/',
    'Cookie': CONFIG.cookie, 'Content-Type': 'application/json',
};

async function solvePOW(challenge) {
    const resp = await fetch(CONFIG.wasmUrl);
    const wasmBytes = await resp.arrayBuffer();
    const mod = await WebAssembly.instantiate(wasmBytes, { wbg: {} });
    const e = mod.instance.exports;
    const encoder = new TextEncoder();
    const prefix = challenge.salt + '_' + challenge.expire_at + '_';
    const cBytes = encoder.encode(challenge.challenge);
    const pBytes = encoder.encode(prefix);
    const cP = e.__wbindgen_export_0(cBytes.length, 1) >>> 0;
    const pP = e.__wbindgen_export_0(pBytes.length, 1) >>> 0;
    new Uint8Array(e.memory.buffer, cP, cBytes.length).set(cBytes);
    new Uint8Array(e.memory.buffer, pP, pBytes.length).set(pBytes);
    const sp = e.__wbindgen_add_to_stack_pointer(-16);
    e.wasm_solve(sp, cP, cBytes.length, pP, pBytes.length, challenge.difficulty);
    const dv = new DataView(e.memory.buffer);
    const code = dv.getInt32(sp, true);
    const ans = dv.getFloat64(sp + 8, true);
    e.__wbindgen_add_to_stack_pointer(16);
    if (code === 0 || !Number.isFinite(ans) || ans <= 0) throw new Error('POW solve failed');
    return Math.floor(ans);
}

async function askDeepSeek(prompt, options = {}, onChunk, onThinkingChunk) {
    const chalResp = await fetch('https://chat.deepseek.com/api/v0/chat/create_pow_challenge', {
        method: 'POST', headers: BASE_HEADERS,
        body: JSON.stringify({ target_path: '/api/v0/chat/completion' })
    });
    const chalData = await chalResp.json();
    const challenge = chalData?.data?.biz_data?.challenge;
    if (!challenge) throw new Error('Could not get PoW challenge. Check auth token.');
    const answer = await solvePOW(challenge);

    const sessResp = await fetch('https://chat.deepseek.com/api/v0/chat_session/create', {
        method: 'POST', headers: BASE_HEADERS, body: '{}'
    });
    const sessData = await sessResp.json();
    const sessionId = sessData?.data?.biz_data?.chat_session?.id || sessData?.data?.biz_data?.id;
    if (!sessionId) throw new Error('Could not create chat session.');

    const powResp = {
        algorithm: challenge.algorithm, challenge: challenge.challenge,
        salt: challenge.salt, answer, signature: challenge.signature,
        target_path: '/api/v0/chat/completion'
    };
    const powB64 = Buffer.from(JSON.stringify(powResp)).toString('base64');

    const compResp = await fetch('https://chat.deepseek.com/api/v0/chat/completion', {
        method: 'POST',
        headers: { ...BASE_HEADERS, 'X-DS-PoW-Response': powB64 },
        body: JSON.stringify({
            chat_session_id: sessionId,
            parent_message_id: null,
            model_type: options.modelType || 'default',
            prompt,
            ref_file_ids: options.refFileIds || [],
            thinking_enabled: options.thinkingEnabled === true,
            search_enabled: options.searchEnabled === true,
            action: null,
            preempt: false,
        })
    });

    if (!compResp.ok) {
        const err = await compResp.text();
        throw new Error(`Completion failed with HTTP ${compResp.status}: ${err}`);
    }

    const reader = compResp.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let fullThinking = '';
    let buffer = '';
    let lastPath = null;
    let isThinking = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                if (!jsonStr) continue;
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.p !== undefined) lastPath = data.p;
                    if (lastPath === 'response/thinking_content' && data.v) {
                        if (!isThinking) {
                            isThinking = true;
                            if (onThinkingChunk) onThinkingChunk('\n[Thinking]\n');
                        }
                        if (onThinkingChunk) onThinkingChunk(data.v);
                        fullThinking += data.v;
                    } else if (lastPath === 'response/content' && data.v) {
                        if (isThinking) {
                            isThinking = false;
                            if (onChunk) onChunk('\n\n[Answer]\n');
                        }
                        if (onChunk) onChunk(data.v);
                        fullResponse += data.v;
                    }
                } catch (e) {}
            }
        }
    }
    return { content: fullResponse, thinking: fullThinking };
}

async function main() {
    const rawArgs = process.argv.slice(2);
    let promptParts = [];
    let thinkingEnabled = false;
    let searchEnabled = false;
    let modelType = 'default';

    for (let i = 0; i < rawArgs.length; i++) {
        const arg = rawArgs[i];
        if (arg === '--thinking' || arg === '-r' || arg === '--reasoning') {
            thinkingEnabled = true;
        } else if (arg === '--search' || arg === '-s' || arg === '--web-search') {
            searchEnabled = true;
        } else if (arg === '--model' || arg === '-m') {
            modelType = rawArgs[++i] || 'default';
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
FreeDeepseek CLI Client

Usage:
  node client.js [options] "prompt"

Options:
  -r, --thinking, --reasoning   Enable R1 reasoning mode
  -s, --search, --web-search    Enable native web search
  -m, --model <name>            Model type (default, expert)
  -h, --help                    Show this help message
`);
            process.exit(0);
        } else {
            promptParts.push(arg);
        }
    }

    let prompt = promptParts.join(' ');
    if (!prompt && !process.stdin.isTTY) {
        prompt = fs.readFileSync(0, 'utf8').trim();
    }

    if (!prompt) {
        console.error('Usage: node client.js [options] "your prompt here"');
        console.error('Try: node client.js --help');
        process.exit(1);
    }

    await askDeepSeek(
        prompt,
        { thinkingEnabled, searchEnabled, modelType },
        (chunk) => process.stdout.write(chunk),
        (thinkChunk) => process.stdout.write(thinkChunk)
    );
    process.stdout.write('\n');
}

main().catch(e => {
    console.error(`\n[!] Error: ${e.message}`);
    process.exit(1);
});
