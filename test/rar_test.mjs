// RAR 支持测试：
// 1) 手工构造 RAR4（存储型）图片压缩包 → 用内嵌的 node-unrar-js 提取 → 字节还原
// 2) 官方测试样本 FolderTest.rar / WithComment.rar 能正常列出与提取
// 3) 加密 RAR 报出正确的错误原因码
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const V = join(here, '..', 'src', 'vendor') + '\\';

// ---- 与播放器 worker 相同的接线 ----
const unrarFactory = require(V + 'unrar.js');
const { ExtractorData } = require(V + 'ExtractorData.js');
async function createExtractorFromData({ wasmBinary, data, password = '' }) {
  const unrar = await unrarFactory({ wasmBinary });
  const extractor = new ExtractorData(unrar, data, password);
  unrar.extractor = extractor;
  return extractor;
}
const wasmBinary = readFileSync(V + 'unrar.wasm');

// ---- 工具：CRC32 / u16 / u32 / PNG ----
const T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v & 0xFFFF); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
import { deflateSync } from 'zlib';
function png(w, h, r, g, b) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; for (let x = 0; x < w; x++) { raw[y * stride + 1 + x * 3] = r; raw[y * stride + 2 + x * 3] = g; raw[y * stride + 3 + x * 3] = b; } }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type); const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cb]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- 手工构造 RAR 4.x（仅存储，方法 0x30）----
// 格式: 签名 + 主头部(0x73) + [文件头部(0x74) + 数据]* + 结束头部(0x7B)
// HEAD_CRC = CRC32(HEAD_TYPE 起至头部末尾)
function makeRar4(entries) {
  const out = [Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00])];
  const mhBody = Buffer.concat([Buffer.from([0x73]), u16(0x0000), u16(13), u16(0), u32(0)]);
  out.push(Buffer.concat([u16(crc32(mhBody)), mhBody]));
  const dosTime = ((44 << 9) | (1 << 5) | 1) << 16 | (12 << 11); // 2024-01-01 12:00:00
  for (const e of entries) {
    const nameB = Buffer.from(e.name, 'utf8');
    const fhBody = Buffer.concat([
      Buffer.from([0x74]), u16(0x8000), u16(32 + nameB.length),
      u32(e.data.length), u32(e.data.length),
      Buffer.from([3]), u32(crc32(e.data)), u32(dosTime),
      Buffer.from([20, 0x30]), u16(nameB.length), u32(0x20), nameB,
    ]);
    out.push(Buffer.concat([u16(crc32(fhBody)), fhBody, e.data]));
  }
  const ehBody = Buffer.concat([Buffer.from([0x7B]), u16(0x4000), u16(7)]);
  out.push(Buffer.concat([u16(crc32(ehBody)), ehBody]));
  return Buffer.concat(out);
}

// ---- 断言 ----
let failed = 0;
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error('FAIL:', msg, '\n  期望:', JSON.stringify(b), '\n  实际:', JSON.stringify(a)); }
  else console.log('ok  :', msg);
}

const IMG_RE = /\.(webp|jpe?g|jfif|png|gif|bmp|avif)$/i;

// ---- 用例 1：手工 RAR 图片包 ----
const img1 = png(400, 600, 10, 20, 30);
const imgWide = png(1200, 600, 200, 100, 50);   // 宽页（测拆分）
const img2 = png(400, 600, 90, 160, 200);
const myRar = makeRar4([
  { name: '001.png', data: img1 },
  { name: '002.png', data: imgWide },
  { name: 'sub/003.png', data: img2 },
  { name: 'info.txt', data: Buffer.from('非图片文件') },
]);
writeFileSync(new URL('./fixtures/test-images.rar', import.meta.url), myRar);

{
  const ex = await createExtractorFromData({ wasmBinary, data: myRar.buffer.slice(myRar.byteOffset, myRar.byteOffset + myRar.byteLength) });
  const list = ex.getFileList();
  const headers = [...list.fileHeaders];
  eq(headers.filter(h => !h.flags.directory).map(h => h.name).sort(), ['001.png', '002.png', 'info.txt', 'sub/003.png'], 'RAR 文件列表完整');
  const extracted = ex.extract({});
  const got = {};
  for (const f of extracted.files) if (f.extraction) got[f.fileHeader.name] = Buffer.from(f.extraction);
  eq(Object.keys(got).sort(), ['001.png', '002.png', 'info.txt', 'sub/003.png'], 'RAR 提取文件集合');
  eq(got['001.png'].equals(img1), true, 'RAR 存储字节还原 001.png');
  eq(got['002.png'].equals(imgWide), true, 'RAR 存储字节还原 002.png（宽页）');
  eq(got['sub/003.png'].equals(img2), true, 'RAR 存储字节还原 嵌套目录 003.png');
}

// ---- 用例 2：官方样本（FileEncByName 是加密包，单独在用例 3 验证） ----
for (const file of ['FolderTest.rar', 'WithComment.rar']) {
  try {
    const buf = readFileSync(join(here, 'fixtures', file));
    const ex = await createExtractorFromData({ wasmBinary, data: buf });
    const list = ex.getFileList();
    const names = [...list.fileHeaders].filter(h => !h.flags.directory).map(h => h.name);
    const extracted = ex.extract({});
    let cnt = 0;
    for (const f of extracted.files) if (f.extraction) cnt++;
    eq(cnt > 0 && names.length > 0, true, `官方样本 ${file} 列出 ${names.length} 个文件、提取 ${cnt} 个`);
  } catch (e) {
    eq(true, false, `官方样本 ${file} 应可解压：${e.message}`);
  }
}

// ---- 用例 3：加密 RAR 报正确原因码 ----
{
  const buf = readFileSync(new URL('./fixtures/HeaderEnc1234.rar', import.meta.url));
  const ex = await createExtractorFromData({ wasmBinary, data: buf });
  let reason = '';
  try { [...ex.getFileList().fileHeaders]; } catch (e) { reason = e.reason || ''; }
  eq(reason, 'ERAR_MISSING_PASSWORD', '加密头 RAR 报 ERAR_MISSING_PASSWORD');
  // 用正确密码应能列出
  const ex2 = await createExtractorFromData({ wasmBinary, data: buf, password: '1234' });
  const names = [...ex2.getFileList().fileHeaders].map(h => h.name);
  eq(names.length > 0, true, '正确密码可列出加密 RAR: ' + names.join(','));
}
{
  // 按文件加密的包：无密码提取应报 ERAR_MISSING_PASSWORD
  const buf = readFileSync(new URL('./fixtures/FileEncByName.rar', import.meta.url));
  const ex = await createExtractorFromData({ wasmBinary, data: buf });
  let reason = '';
  try {
    const extracted = ex.extract({});
    for (const f of extracted.files) if (f.extraction) void f;
  } catch (e) { reason = e.reason || ''; }
  eq(reason, 'ERAR_MISSING_PASSWORD', '按文件加密 RAR 无密码提取报 ERAR_MISSING_PASSWORD');
}

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log('\nRAR 测试全部通过 ✓');
