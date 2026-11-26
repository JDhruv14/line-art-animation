import { readdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const { name, version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const files = [
  'README.md', 'LICENSE', 'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html',
  ...['references', 'lib', 'examples/walker', 'examples/village', 'scripts'].flatMap((directory) =>
    readdirSync(new URL(directory, root), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(md|ts|html|json|sh)$/.test(entry.name))
      .map((entry) => `${directory}/${entry.name}`)),
].sort();

const tools = [
  {
    name: 'list_kit_files',
    description: 'List the bundled line-art guides, SVG/TypeScript library, examples, and capture and clip-analysis scripts.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'read_kit_file',
    description: 'Read a bundled line-art kit file by its path from list_kit_files. Returns its text and local source path.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', enum: files } },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const content = (text, isError = false) => ({ content: [{ type: 'text', text }], isError });
const send = (id, payload) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...payload }) + '\n');

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send(null, { error: { code: -32700, message: 'Parse error' } });
    continue;
  }

  if (message?.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    send(null, { error: { code: -32600, message: 'Invalid request' } });
    continue;
  }
  const { id, method, params } = message;
  if (id === undefined) continue;
  if (typeof id !== 'string' && typeof id !== 'number') {
    send(null, { error: { code: -32600, message: 'Invalid request ID' } });
    continue;
  }

  let result;
  switch (method) {
    case 'initialize':
      result = {
        protocolVersion: protocolVersions.includes(params?.protocolVersion)
          ? params.protocolVersion : protocolVersions[0],
        capabilities: { tools: {} },
        serverInfo: { name, version },
      };
      break;
    case 'ping':
      result = {};
      break;
    case 'tools/list':
      result = { tools };
      break;
    case 'tools/call': {
      if (params?.name === 'list_kit_files') {
        result = content(files.join('\n'));
      } else if (params?.name === 'read_kit_file') {
        const path = params.arguments?.path;
        if (!files.includes(path)) {
          result = content('Choose a path returned by list_kit_files.', true);
        } else {
          const file = new URL(path, root);
          try {
            result = content(`Source: ${fileURLToPath(file)}\n\n${readFileSync(file, 'utf8')}`);
          } catch {
            result = content(`Could not read bundled file: ${path}`, true);
          }
        }
      } else {
        send(id, { error: { code: -32602, message: 'Unknown tool' } });
        continue;
      }
      break;
    }
    default:
      send(id, { error: { code: -32601, message: 'Method not found' } });
      continue;
  }
  send(id, { result });
}
