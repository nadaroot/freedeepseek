#!/usr/bin/env node
/*
  Opens/reuses a separate Chrome for Testing / Chrome / Edge / Chromium profile
  for DeepSeek Web login and extracts the auth metadata into deepseek-auth.json.

  Usage:
    node scripts/deepseek_chrome_auth.js
    # or npm run auth
    # optional override: CHROME_PATH="/path/to/browser" node scripts/deepseek_chrome_auth.js
    # optional reuse: DEEPSEEK_REUSE_CHROME=1 DEEPSEEK_KEEP_CHROME_PROFILE=1 node scripts/deepseek_chrome_auth.js
*/
const { spawn, execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const repoRoot = path.resolve(__dirname, '..');
const qwenRepoRoot = path.resolve(repoRoot, '..', 'FreeQwenApi');
const profileDir =
    process.env.DEEPSEEK_CHROME_PROFILE ||
    path.join(repoRoot, '.chrome-for-testing-profile-deepseek');
const port = Number(process.env.DEEPSEEK_CHROME_PORT || 9334);
const outPath =
    process.env.DEEPSEEK_AUTH_PATH || path.join(repoRoot, 'deepseek-auth.json');
const url = 'https://chat.deepseek.com/';
const reuseChrome = /^(1|true|yes|on)$/i.test(
    process.env.DEEPSEEK_REUSE_CHROME || '',
);
const keepProfile = /^(1|true|yes|on)$/i.test(
    process.env.DEEPSEEK_KEEP_CHROME_PROFILE || '',
);

function shellPatternSafe(s) {
    return String(s).replace(/[\\"']/g, '.');
}

function sleepSync(ms) {
    try {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch {}
}

function killExistingTestingChrome() {
    if (process.platform === 'darwin' || process.platform === 'linux') {
        const patterns = [`--remote-debugging-port=${port}`, profileDir].map(
            shellPatternSafe,
        );
        for (const pattern of patterns) {
            try {
                execFileSync('/usr/bin/pkill', ['-f', pattern], {
                    stdio: 'ignore',
                });
            } catch {}
        }
    } else if (process.platform === 'win32') {
        try {
            execSync(`wmic process where "commandline like '%--remote-debugging-port=${port}%'" call terminate`, { stdio: 'ignore' });
        } catch {}
    }
    sleepSync(500);
}

function removeStaleLocks(dir) {
    if (!fs.existsSync(dir)) return;
    const lockFiles = [
        'SingletonLock',
        'SingletonSocket',
        'SingletonCookie',
        'lockfile',
        'LOCK',
    ];
    for (const f of lockFiles) {
        try {
            const p = path.join(dir, f);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {}
    }
}

function removeProfileSafely(dir) {
    if (!fs.existsSync(dir)) return;
    removeStaleLocks(dir);
    for (let i = 0; i < 3; i++) {
        try {
            fs.rmSync(dir, {
                recursive: true,
                force: true,
                maxRetries: 3,
                retryDelay: 200,
            });
            if (!fs.existsSync(dir)) return;
        } catch (e) {
            if (i === 2) {
                const staleDir = `${dir}.stale-${Date.now()}`;
                try {
                    fs.renameSync(dir, staleDir);
                } catch {}
                return;
            }
        }
        sleepSync(200);
    }
}

function findExecInPath(cmd) {
    try {
        const checkCmd = process.platform === 'win32' ? `where.exe ${cmd}` : `which ${cmd}`;
        const out = execSync(checkCmd, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString('utf8')
            .split(/\r?\n/)[0]
            .trim();
        if (out && fs.existsSync(out)) return out;
    } catch {}
    return null;
}

function resolveChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
        return process.env.CHROME_PATH;
    }

    const candidates = [];
    const home = process.env.HOME || process.env.USERPROFILE || '';

    // 1. Check Root Detect / playerok portable downloaded browsers if present
    const portableDirs = [
        path.resolve(repoRoot, '..', 'root-detect', 'profiles_data', 'browsers'),
        path.resolve(repoRoot, '..', 'profiles_data', 'browsers'),
        path.join(home, '.rootdetect', 'browsers')
    ];
    for (const pDir of portableDirs) {
        if (fs.existsSync(pDir)) {
            try {
                const scan = (d) => {
                    const entries = fs.readdirSync(d, { withFileTypes: true });
                    for (const e of entries) {
                        const full = path.join(d, e.name);
                        if (e.isDirectory()) {
                            if (full.endsWith('.app')) {
                                const macBin = path.join(full, 'Contents', 'MacOS', e.name.replace('.app', ''));
                                if (fs.existsSync(macBin)) candidates.push(macBin);
                                const macGeneric = path.join(full, 'Contents', 'MacOS', 'Google Chrome for Testing');
                                if (fs.existsSync(macGeneric)) candidates.push(macGeneric);
                            } else {
                                scan(full);
                            }
                        } else if (e.isFile()) {
                            const low = e.name.toLowerCase();
                            if (low === 'chrome.exe' || low === 'brave.exe' || low === 'chromium.exe' || low === 'chrome') {
                                candidates.push(full);
                            }
                        }
                    }
                };
                scan(pDir);
            } catch {}
        }
    }

    // 2. Puppeteer cache locations
    if (home) {
        const cacheRoot = path.join(home, '.cache', 'puppeteer', 'chrome');
        if (fs.existsSync(cacheRoot)) {
            try {
                const dirs = fs.readdirSync(cacheRoot);
                for (const d of dirs) {
                    const baseDir = path.join(cacheRoot, d);
                    candidates.push(
                        path.join(baseDir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
                        path.join(baseDir, 'chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
                        path.join(baseDir, 'chrome-win64', 'chrome.exe'),
                        path.join(baseDir, 'chrome-win32', 'chrome.exe'),
                        path.join(baseDir, 'chrome-linux64', 'chrome')
                    );
                }
            } catch {}
        }
    }

    // 3. Platform specific standard installed locations
    if (process.platform === 'win32') {
        const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
        const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
        const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');

        candidates.push(
            // Google Chrome (Standard, 64-bit, 32-bit, User-level)
            path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(localAppData, 'Google', 'Chrome SxS', 'Application', 'chrome.exe'),
            // Microsoft Edge
            path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            // Brave Browser
            path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
            path.join(progFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
            path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
            // Ungoogled Chromium / Thorium / Yandex
            path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
            path.join(progFiles, 'Thorium', 'Application', 'thorium.exe'),
            path.join(localAppData, 'Thorium', 'Application', 'thorium.exe'),
            path.join(localAppData, 'Yandex', 'YandexBrowser', 'Application', 'browser.exe')
        );

        // Check PATH on Windows
        for (const cmd of ['chrome.exe', 'msedge.exe', 'brave.exe', 'chromium.exe']) {
            const found = findExecInPath(cmd);
            if (found) candidates.push(found);
        }
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Arc.app/Contents/MacOS/Arc',
            path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
            path.join(home, 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser')
        );

        for (const cmd of ['google-chrome', 'chromium', 'brave-browser', 'msedge']) {
            const found = findExecInPath(cmd);
            if (found) candidates.push(found);
        }
    } else {
        // Linux
        candidates.push(
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/bin/brave-browser',
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable'
        );

        for (const cmd of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge']) {
            const found = findExecInPath(cmd);
            if (found) candidates.push(found);
        }
    }

    for (const c of candidates) {
        if (c && fs.existsSync(c)) {
            return c;
        }
    }

    return '';
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function ask(q) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) =>
        rl.question(q, (ans) => {
            rl.close();
            resolve(ans);
        }),
    );
}

async function fetchJson(u, opts) {
    try {
        const r = await fetch(u, opts);
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;
    }
}

async function devtoolsReady() {
    return await fetchJson(`http://127.0.0.1:${port}/json/version`);
}

async function waitDevtools() {
    for (let i = 0; i < 100; i++) {
        const v = await devtoolsReady();
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`Chrome DevTools endpoint did not start on http://127.0.0.1:${port}. Browser: ${resolveChromePath()}`);
}

async function getPageTarget() {
    for (let i = 0; i < 50; i++) {
        const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
        if (Array.isArray(targets)) {
            const page =
                targets.find(
                    (t) => t.type === 'page' && /chat\.deepseek\.com/.test(t.url),
                ) || targets.find((t) => t.type === 'page');
            if (page?.webSocketDebuggerUrl) return page;
        }
        await sleep(250);
    }
    throw new Error('No Chrome page target found');
}

class CDP {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 0;
        this.pending = new Map();
        this.events = [];
        this.ws.onmessage = (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                msg.error
                    ? reject(new Error(JSON.stringify(msg.error)))
                    : resolve(msg.result);
            } else if (msg.method) {
                this.events.push(msg);
                if (this.events.length > 1000) this.events.shift();
            }
        };
    }
    ready() {
        return new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
    }
    send(method, params = {}) {
        const id = ++this.id;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) =>
            this.pending.set(id, { resolve, reject }),
        );
    }
    close() {
        try {
            this.ws.close();
        } catch {}
    }
}

function parseMaybeJson(s) {
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function normalizeToken(raw) {
    if (!raw) return '';
    const parsed = parseMaybeJson(raw);
    if (parsed && typeof parsed === 'object') {
        return (
            parsed.value ||
            parsed.token ||
            parsed.access_token ||
            parsed.accessToken ||
            ''
        );
    }
    return String(raw).trim();
}

async function readPageAuth(cdp) {
    const evalRes = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
      const out = {href: location.href, localStorage:{}, sessionStorage:{}, resources: []};
      for (let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); out.localStorage[k]=localStorage.getItem(k); }
      for (let i=0;i<sessionStorage.length;i++){ const k=sessionStorage.key(i); out.sessionStorage[k]=sessionStorage.getItem(k); }
      out.resources = performance.getEntriesByType('resource').map(r => r.name).filter(n => /wasm|chat\\/completion|pow|chat_session/.test(n)).slice(-100);
      return out;
    })()`,
        returnByValue: true,
    });
    const pageState = evalRes.result?.value || {};
    const stores = [
        pageState.localStorage || {},
        pageState.sessionStorage || {},
    ];
    let token = '';
    for (const store of stores) {
        for (const key of [
            'userToken',
            'token',
            'auth_token',
            'access_token',
            'accessToken',
        ]) {
            token = normalizeToken(store[key]);
            if (token) break;
        }
        if (token) break;
    }
    if (!token) {
        for (const store of stores) {
            for (const [k, v] of Object.entries(store)) {
                if (/token/i.test(k)) {
                    token = normalizeToken(v);
                    if (token) break;
                }
            }
            if (token) break;
        }
    }

    const cookieRes = await cdp.send('Network.getAllCookies');
    const cookies = (cookieRes.cookies || []).filter((c) =>
        /deepseek\.com$/.test(c.domain),
    );
    const cookie = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    let hif_dliq = '',
        hif_leim = '';
    for (const ev of cdp.events) {
        const headers = ev.params?.headers || ev.params?.request?.headers;
        if (!headers) continue;
        for (const [k, v] of Object.entries(headers)) {
            const lk = k.toLowerCase();
            if (lk === 'x-hif-dliq') hif_dliq = String(v);
            if (lk === 'x-hif-leim') hif_leim = String(v);
            if (
                lk === 'authorization' &&
                !token &&
                /^Bearer\s+/i.test(String(v))
            )
                token = String(v).replace(/^Bearer\s+/i, '');
        }
    }

    const wasmUrl =
        (pageState.resources || []).find((u) => /sha3.*\.wasm/.test(u)) ||
        'https://fe-static.deepseek.com/chat/static/sha3_wasm_bg.7b9ca65ddd.wasm';
    return {
        token,
        cookie,
        hif_dliq,
        hif_leim,
        wasmUrl,
        baseUrl: 'https://chat.deepseek.com',
        href: pageState.href,
        cookiesCount: cookies.length,
    };
}

function chromeInstallHelp(missingPath) {
    return `Браузер (Chrome / Edge / Brave / Chromium) не найден в системе.

Как исправить:
  Windows:
    Установите Google Chrome или Microsoft Edge, либо укажите путь:
    $env:CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"; npm run auth

  macOS:
    Установите Google Chrome, либо укажите путь:
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run auth

  Linux:
    Установите chromium или google-chrome:
    sudo apt update && sudo apt install -y chromium-browser`;
}

async function main() {
    const chromePath = resolveChromePath();
    if (!chromePath || !fs.existsSync(chromePath)) {
        throw new Error(chromeInstallHelp(chromePath));
    }

    if (!reuseChrome) {
        killExistingTestingChrome();
        if (!keepProfile && fs.existsSync(profileDir)) {
            removeProfileSafely(profileDir);
        }
    }
    fs.mkdirSync(profileDir, { recursive: true });
    removeStaleLocks(profileDir);

    if (reuseChrome && (await devtoolsReady())) {
        console.log(`[auth] Подключение к открытому DevTools на порту ${port}`);
    } else {
        console.log(`[auth] Запуск браузера: ${chromePath}`);
        console.log(`[auth] Изолированный профиль: ${profileDir}`);

        const chromeArgs = [
            `--user-data-dir=${profileDir}`,
            `--remote-debugging-port=${port}`,
            '--remote-allow-origins=*',
            '--use-mock-keychain',
            '--password-store=basic',
            '--disable-sync',
            '--disable-extensions',
            '--disable-component-extensions-with-background-pages',
            '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,InterestFeedContentSuggestions,Translate,ChromeForTestingAlert,OSCryptAsync',
            '--disable-session-crashed-bubble',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-infobars',
            url,
        ];

        const chrome = spawn(chromePath, chromeArgs, {
            stdio: 'ignore',
            detached: process.platform !== 'win32',
        });

        chrome.on('error', (err) => {
            console.error(`[auth] Ошибка запуска процесса браузера: ${err.message}`);
        });

        if (typeof chrome.unref === 'function') {
            chrome.unref();
        }
    }

    console.log('[auth] Ожидание готовности интерфейса DevTools...');
    await waitDevtools();
    const target = await getPageTarget();
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    console.log('\n===============================================================');
    console.log('  Браузер успешно открыт! Войдите в DeepSeek в ОТКРЫТОМ ОКНЕ.');
    console.log('  После авторизации отправьте ОДНО короткое сообщение (например: ok).');
    console.log('===============================================================\n');
    await ask('[auth] Когда залогинились и отправили сообщение — нажмите ENTER здесь: ');

    let auth = null;
    for (let i = 0; i < 20; i++) {
        auth = await readPageAuth(cdp);
        if (auth.token && auth.cookie) break;
        await sleep(500);
    }
    const { href, cookiesCount, ...persisted } = auth;
    fs.writeFileSync(outPath, JSON.stringify(persisted, null, 2));
    console.log(`\n[auth] Авторизационные данные сохранены: ${outPath}`);
    console.log(`[auth] Страница: ${href || 'unknown'}`);
    console.log(
        `[auth] Token: ${persisted.token ? 'OK (' + persisted.token.length + ' символов)' : 'ОТСУТСТВУЕТ'}`,
    );
    console.log(
        `[auth] Cookie: ${persisted.cookie ? 'OK (' + cookiesCount + ' куки)' : 'ОТСУТСТВУЕТ'}`,
    );
    cdp.close();
    if (!persisted.token || !persisted.cookie) process.exitCode = 2;
}

main().catch((e) => {
    console.error('\n[auth] ОШИБКА:', e.message);
    process.exit(1);
});
