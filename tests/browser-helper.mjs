import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function startBrowser() {
  const profile = await mkdtemp(path.join(tmpdir(), 'statistics-tests-'));
  const server = createServer(async (request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root)) throw new Error('Outside repository');
      const body = await readFile(file);
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript'
        : file.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  let chrome, socket;
  const pending = new Map();
  let sequence = 0;
  const exceptions = [];
  const close = async () => {
    socket?.close();
    if (chrome && chrome.exitCode === null) {
      const exited = new Promise(resolve => chrome.once('exit', resolve));
      chrome.kill();
      await exited;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  };
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const executable = process.env.CHROME_PATH
      || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const address = await new Promise((resolve, reject) => {
      chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0',
        '--disable-extensions', '--disable-sync', '--no-first-run',
        '--no-default-browser-check', '--user-data-dir=' + profile, 'about:blank'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
      const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 20000);
      let log = '';
      chrome.stderr.on('data', chunk => {
        log += chunk;
        const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      chrome.once('error', error => { clearTimeout(timer); reject(error); });
      chrome.once('exit', code => {
        clearTimeout(timer);
        reject(new Error('Chrome exited before startup: ' + code));
      });
    });
    const target = await (await fetch(`http://127.0.0.1:${new URL(address).port}/json/new?about:blank`,
      { method: 'PUT' })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = message => {
      const value = JSON.parse(message.data);
      if (value.method === 'Runtime.exceptionThrown') exceptions.push(value.params);
      const task = pending.get(value.id);
      if (!task) return;
      pending.delete(value.id);
      clearTimeout(task.timer);
      value.error ? task.reject(new Error(value.error.message)) : task.resolve(value.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('CDP timeout: ' + method));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = expression => evaluate(`new Promise((resolve,reject)=>{
      const end=Date.now()+15000;
      const poll=()=>{if(${expression})return resolve(true);
        if(Date.now()>end)return reject(Error('UI timeout'));
        setTimeout(poll,20);};poll();})`);
    await send('Page.enable');
    await send('Runtime.enable');
    return {
      evaluate, send, waitFor, close, exceptions,
      async navigate(homework) {
        const pathname = homework ? `/homework-0${homework}/` : '/';
        await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${pathname}` });
        await waitFor(`location.pathname===${JSON.stringify(pathname)} && document.readyState==='complete'`);
      },
      async click(id) {
        await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
        if (!id.startsWith('welford')) {
          await waitFor(`!document.getElementById(${JSON.stringify(id)}).disabled`);
        }
      },
      async set(id, value) {
        await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});
          e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));
          e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      },
      async viewport(width) {
        await send('Emulation.setDeviceMetricsOverride', {
          width, height: 900, deviceScaleFactor: 1, mobile: width < 600
        });
        await evaluate('new Promise(resolve=>setTimeout(resolve,700))');
      }
    };
  } catch (error) {
    await close();
    throw error;
  }
}
