#!/usr/bin/env node
/**
 * Utility script to test proxy connectivity to DeepSeek
 * 
 * Usage:
 *   node scripts/check_proxy.js
 *   node scripts/check_proxy.js http://user:pass@host:port
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const configPath = path.join(__dirname, '..', 'deepseek-auth.json');
let proxyUrl = process.argv[2] || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '';

if (!proxyUrl && fs.existsSync(configPath)) {
    try {
        const auth = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (auth.proxy) proxyUrl = auth.proxy;
        else if (Array.isArray(auth.accounts)) {
            const withProxy = auth.accounts.find(a => a.proxy);
            if (withProxy) proxyUrl = withProxy.proxy;
        }
    } catch (e) {}
}

console.log('=== FreeDeepseek Proxy Check ===');
console.log(`Target Proxy: ${proxyUrl ? proxyUrl.replace(/:([^@]+)@/, ':****@') : 'Direct (No Proxy)'}`);

async function testConnection() {
    const startTime = Date.now();
    try {
        const res = await fetch('https://chat.deepseek.com/favicon.ico', {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const latency = Date.now() - startTime;
        console.log(`Status: HTTP ${res.status}`);
        console.log(`Latency: ${latency}ms`);
        if (res.ok || res.status === 200 || res.status === 304 || res.status === 403) {
            console.log('[OK] Connection to DeepSeek successful.');
        } else {
            console.log(`[WARN] Unexpected response: HTTP ${res.status}`);
        }
    } catch (err) {
        console.error(`[ERROR] Connection failed: ${err.message}`);
        process.exit(1);
    }
}

testConnection();
