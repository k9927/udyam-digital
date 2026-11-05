import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Starts the real API against a throwaway database and returns a tiny client with a cookie jar per actor.
export async function startServer(port, database) {
  const child = spawn(process.execPath, [path.join(backendRoot, 'server.js')], {
    cwd: backendRoot,
    env: { ...process.env, PORT: String(port), MONGO_URI: `mongodb://127.0.0.1:27017/${database}`, ADVISOR_AI: 'off', SCHEDULER_SECONDS: '0', DEMO_MODE: 'true', OTP_DEV_MODE: 'true', R2_ACCESS_KEY_ID: '', CLIENT_URL: 'http://localhost' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start:\n${output}`)), 60_000);
    const onData = chunk => { output += chunk; if (output.includes(`localhost:${port}`)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`API exited (${code}):\n${output}`)); });
  });
  const base = `http://127.0.0.1:${port}/api`;
  const actor = () => {
    let cookie = '';
    const call = async (method, url, body, headers = {}) => {
      const isForm = body instanceof FormData;
      const response = await fetch(base + url, { method, headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
      const set = response.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* not JSON */ }
      return { status: response.status, body: json, text, headers: response.headers };
    };
    return { get: (url, headers) => call('GET', url, undefined, headers), post: (url, body, headers) => call('POST', url, body, headers), patch: (url, body) => call('PATCH', url, body), del: url => call('DELETE', url), raw: (url, init) => fetch(base + url, { ...init, headers: { ...(init?.headers || {}), cookie } }) };
  };
  return { base, actor, stop: () => child.kill() };
}

export async function dropDatabase(database) {
  const mongoose = (await import('mongoose')).default;
  const connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${database}`).asPromise();
  await connection.dropDatabase();
  await connection.close();
}

export async function loginCustomer(client, phone, name = 'Test Owner') {
  const otp = await client.post('/auth/otp/request', { phone });
  const verify = await client.post('/auth/otp/verify', { phone, code: otp.body.devCode, name });
  if (verify.status !== 200) throw new Error(`login failed: ${verify.text}`);
  return verify.body.user;
}

export async function loginDemo(client, email) {
  const accounts = (await client.get('/auth/demo-accounts')).body.accounts;
  const account = accounts.find(item => item.email === email);
  const result = await client.post('/auth/demo-login', { userId: account.id });
  if (result.status !== 200) throw new Error(`demo login failed for ${email}`);
  return result.body.user;
}
