import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const request = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });
const initialize = (protocolVersion) => request(1, 'initialize', {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: 'test', version: '1.0.0' },
});

test('stdio client can discover and read kit files from outside the installation', () => {
  const { stdout, stderr, status } = spawnSync(process.execPath, [fileURLToPath(new URL('server.mjs', import.meta.url))], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 5000,
    input: [
      initialize('2025-06-18'),
      request(undefined, 'notifications/initialized'),
      request(2, 'tools/list'),
      request(3, 'tools/call', { name: 'list_kit_files' }),
      request(4, 'tools/call', { name: 'read_kit_file', arguments: { path: 'lib/gait.ts' } }),
      request(5, 'tools/call', { name: 'read_kit_file', arguments: { path: '../.git/config' } }),
      request(6, 'tools/call', { name: 'read_kit_file', arguments: { path: 'skills/line-art-animation/SKILL.md' } }),
    ].map(JSON.stringify).join('\n') + '\n',
  });
  assert.equal(status, 0, stderr);
  const replies = stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies.map(({ id }) => id), [1, 2, 3, 4, 5, 6]);
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(replies[1].result.tools.map(({ name }) => name), ['list_kit_files', 'read_kit_file']);
  assert.match(replies[2].result.content[0].text, /scripts\/capture\.ts/);
  assert.match(replies[3].result.content[0].text, /export function gait\(/);
  assert.equal(replies[4].result.isError, true);
  assert.match(replies[5].result.content[0].text, /## Workflow/);
});

test('plugin manifests launch the same server from a client working directory', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const { name, version } = load('../package.json');
  const portable = load('../plugin.json');
  const codex = load('../.codex-plugin/plugin.json');
  const claude = load('../.claude-plugin/plugin.json');
  const cursor = load('../.cursor-plugin/plugin.json');
  const gemini = load('../gemini-extension.json');

  for (const manifest of [portable, codex, claude, cursor, gemini]) {
    assert.equal(manifest.name, name);
    assert.equal(manifest.version, version);
  }

  for (const [config, rootVariable] of [
    [load(`../${codex.mcpServers}`), '${PLUGIN_ROOT}'],
    [load('../.mcp.json'), '${CLAUDE_PLUGIN_ROOT}'],
    [cursor, '${CURSOR_PLUGIN_ROOT}'],
    [gemini, '${extensionPath}'],
  ]) {
    const { command, args } = config.mcpServers[name];
    const run = spawnSync(command, args.map((arg) => arg.replace(rootVariable + '/', root)), {
      cwd: tmpdir(),
      encoding: 'utf8',
      timeout: 5000,
      input: JSON.stringify(initialize('2025-11-25')) + '\n',
    });
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    assert.deepEqual(JSON.parse(run.stdout).result.serverInfo, { name, version });
  }
});
