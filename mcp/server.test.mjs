import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('stdio client can discover and read kit files from outside the installation', () => {
  const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
  const { stdout, stderr, status } = spawnSync(process.execPath, [fileURLToPath(new URL('server.mjs', import.meta.url))], {
    cwd: process.env.TMPDIR || '/tmp',
    encoding: 'utf8',
    timeout: 5000,
    input: [
      request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } }),
      request(undefined, 'notifications/initialized'),
      request(2, 'tools/list'),
      request(3, 'tools/call', { name: 'list_kit_files' }),
      request(4, 'tools/call', { name: 'read_kit_file', arguments: { path: 'lib/gait.ts' } }),
      request(5, 'tools/call', { name: 'read_kit_file', arguments: { path: '../.git/config' } }),
    ].map(JSON.stringify).join('\n') + '\n',
  });
  assert.equal(status, 0, stderr);
  const replies = stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies.map(({ id }) => id), [1, 2, 3, 4, 5]);
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(replies[1].result.tools.map(({ name }) => name), ['list_kit_files', 'read_kit_file']);
  assert.match(replies[2].result.content[0].text, /scripts\/capture\.ts/);
  assert.match(replies[3].result.content[0].text, /export function gait\(/);
  assert.equal(replies[4].result.isError, true);
});
