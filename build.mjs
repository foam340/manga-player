// 构建脚本：把 src/player.template.html 和 src/vendor/ 的 RAR 解压支持组装成单文件 漫画播放器.html
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p));
const b64 = buf => Buffer.from(buf).toString('base64');

// ---- 组装 RAR worker 源码（CJS 小模块加载器 + node-unrar-js 发行文件 + 消息协议） ----
const vendor = {};
for (const name of ['./unrar', './Extractor', './ExtractorData.helper', './ExtractorData']) {
  const file = { './unrar': 'unrar.js', './Extractor': 'Extractor.js', './ExtractorData.helper': 'ExtractorData.helper.js', './ExtractorData': 'ExtractorData.js' }[name];
  vendor[name] = read('src/vendor/' + file).toString('utf8');
}

const workerSrc = `// RAR 解压 worker —— 基于 node-unrar-js (MIT, https://github.com/YuJianrong/node-unrar-js)
// 内含官方 unRAR 6.1.7 (C++ Unrar library, Copyright (c) 1993-2021 Alexander Roshal) 的 emscripten 编译产物
const __mods = {};
function __def(name, fn) { const m = { exports: {} }; fn(m.exports, m, __req); __mods[name] = m.exports; }
function __req(name) { return __mods[name]; }
${Object.entries(vendor).map(([name, src]) =>
  `__def(${JSON.stringify(name)}, function(exports, module, require) {\n'use strict';\n${src}\n});`
).join('\n')}
const IMG_RE = /\\.(webp|jpe?g|jfif|png|gif|bmp|avif)$/i;
let unrarMod = null;
async function createExtractorFromData(opts) {
  if (!unrarMod) {
    const factory = __req('./unrar');
    unrarMod = await factory(opts.wasmBinary ? { wasmBinary: opts.wasmBinary } : undefined);
  }
  const ExtractorData = __req('./ExtractorData').ExtractorData;
  const extractor = new ExtractorData(unrarMod, opts.data, opts.password || '');
  unrarMod.extractor = extractor;
  return extractor;
}
let current = null;
onmessage = async (e) => {
  const { id, cmd } = e.data || {};
  try {
    if (cmd === 'open') {
      current = await createExtractorFromData({ wasmBinary: e.data.wasmBinary, data: e.data.data, password: e.data.password || '' });
      const list = current.getFileList();
      const names = [];
      for (const fh of list.fileHeaders) {
        if (!fh.flags.directory && !fh.flags.encrypted && IMG_RE.test(fh.name)) names.push(fh.name);
      }
      postMessage({ id, ok: true, names });
    } else if (cmd === 'extractAll') {
      const extracted = current.extract({});
      for (const f of extracted.files) {
        if (f.extraction && IMG_RE.test(f.fileHeader.name)) {
          const copy = new Uint8Array(f.extraction);
          postMessage({ id, ok: true, name: f.fileHeader.name, bytes: copy }, [copy.buffer]);
        }
      }
      postMessage({ id, ok: true, done: true });
    }
  } catch (err) {
    postMessage({ id, ok: false, error: String((err && err.message) || err), reason: err && err.reason });
  }
};
`;

// ---- 组装最终 HTML ----
let html = read('src/player.template.html').toString('utf8');
const wasmB64 = b64(read('src/vendor/unrar.wasm'));

// worker 源码以 JSON 字符串字面量嵌入（保证引号/换行安全）
html = html.replace('/*__UNRAR_WORKER__*/""', JSON.stringify(workerSrc));
html = html.replace('/*__UNRAR_WASM_B64__*/""', JSON.stringify(wasmB64));
if (html.includes('__UNRAR_WORKER') || html.includes('__UNRAR_WASM_B64')) {
  throw new Error('模板占位符替换失败');
}

writeFileSync(join(root, '漫画播放器.html'), html);
console.log('构建完成: 漫画播放器.html =', (html.length / 1024).toFixed(0) + 'KB',
  '(其中内嵌 unrar wasm ≈', (wasmB64.length / 1024).toFixed(0) + 'KB)');
