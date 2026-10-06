// 单元测试：从 HTML 中提取 ZIP 解析器，在 Node 里验证
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { deflateRawSync } from 'zlib';

const html = readFileSync(new URL('../漫画播放器.html', import.meta.url), 'utf8');
const src = html.split('/*__ZIP_PARSER_START__*/')[1].split('/*__ZIP_PARSER_END__*/')[0];
const mod = await import('data:text/javascript;base64,' +
  Buffer.from(src + '\n;export{parseZipBuffer,decodeName,isImageName};').toString('base64'));

// ---- CRC32 ----
const T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  return t;
})();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

// ---- 生成 PNG（纯色小图，用于 GUI 测试样本） ----
export function png(w, h, r, g, b) {
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; for (let x = 0; x < w; x++) { raw[y * stride + 1 + x * 3] = r; raw[y * stride + 2 + x * 3] = g; raw[y * stride + 3 + x * 3] = b; } }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type); const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cb]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSyncAny(raw)), chunk('IEND', Buffer.alloc(0))]);
}
import { deflateSync } from 'zlib';
function deflateSyncAny(b) { return deflateSync(b); }

// ---- 构造 ZIP ----
const u16 = v => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
function makeZip(entries, opts = {}) {
  const chunks = [], central = []; let off = 0;
  for (const e of entries) {
    const nameB = e.nameBytes ?? Buffer.from(e.name, 'utf8');
    const flags = e.flags ?? (e.utf8 ? 0x800 : 0);
    const method = e.method ?? 8;
    const crc = crc32(e.data);
    const comp = method === 8 ? deflateRawSync(e.data) : e.data;
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(flags), u16(method), u16(0), u16(0x5182), u32(crc), u32(comp.length), u32(e.data.length), u16(nameB.length), u16(0), nameB, comp]);
    chunks.push(local);
    // 签名 + 制作版本 + 所需版本 + 标志 + 方法 + 时间 + 日期 + CRC + 压缩/原始大小 + 名长/扩展/注释 + 磁盘号/内部属性(2+2) + 外部属性(4) + 本地偏移
    central.push(Buffer.concat([u32(0x02014b50), u16(0x031E), u16(20), u16(flags), u16(method), u16(0), u16(0x5182), u32(crc), u32(comp.length), u32(e.data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nameB]));
    off += local.length;
  }
  const cd = Buffer.concat(central);
  const comment = opts.comment ? Buffer.from(opts.comment) : Buffer.alloc(0);
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(off), u16(comment.length), comment]);
  return Buffer.concat([...chunks, cd, eocd]);
}

// ---- 断言 ----
let failed = 0;
function eq(a, b, msg) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { failed++; console.error('FAIL:', msg, '\n  期望:', JSON.stringify(b), '\n  实际:', JSON.stringify(a)); }
  else console.log('ok  :', msg);
}

// ---- 用例 ----
const bytesA = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
const bytesB = Buffer.from('stored-image-bytes'.repeat(4));
const bytesC = Buffer.from([255, 254, 0, 1, 2, 3]);
const zipBuf = makeZip([
  { name: '001.png', data: bytesA },                    // deflate
  { name: '002.jpg', data: bytesB, method: 0 },         // 存储
  { name: 'sub/010.webp', data: bytesC },               // 嵌套目录
  { name: '页面_003.png', data: bytesA, utf8: true },    // UTF-8 文件名标志
  { name: 'p10.png', data: bytesA },
  { name: 'p2.png', data: bytesA },
  { name: 'readme.txt', data: Buffer.from('hello') },   // 非图片 → 排除
  { name: 'dir/', data: Buffer.alloc(0), nameBytes: Buffer.from('dir/'), flags: 0 }, // 目录 → 排除
  { name: 'secret.png', data: bytesA, flags: 0x9 },     // 加密 → 排除
], { comment: 'trailing comment test' });

const zip = await mod.parseZipBuffer(new Uint8Array(zipBuf));
const names = zip.pages.map(p => p.name);
eq(names.length, 6, '共 6 张图片（目录/非图片/加密已排除）');
eq(names.includes('p2.png') && names.includes('p10.png') && names.indexOf('p2.png') < names.indexOf('p10.png'), true, '自然排序：p2 < p10');
eq(zip.encrypted, 1, '加密文件计数');
eq(zip.allCount, 9, '目录条目总数');
eq(Buffer.from(await zip.read(zip.pages[names.indexOf('001.png')])).equals(bytesA), true, 'deflate 条目内容还原');
eq(Buffer.from(await zip.read(zip.pages[names.indexOf('002.jpg')])).equals(bytesB), true, '存储条目内容还原');
eq(Buffer.from(await zip.read(zip.pages[names.indexOf('sub/010.webp')])).equals(bytesC), true, '嵌套目录条目内容还原');

// 非法文件
try { await mod.parseZipBuffer(new Uint8Array(Buffer.from('not a zip'))); eq(true, false, '非法文件应抛错'); }
catch (e) { eq(e.message.includes('不是有效的'), true, '非法文件抛出友好错误'); }

// 空压缩包（只有目录）
const empty = makeZip([{ name: 'd/', data: Buffer.alloc(0), nameBytes: Buffer.from('d/'), flags: 0 }]);
const ez = await mod.parseZipBuffer(new Uint8Array(empty));
eq(ez.pages.length, 0, '空压缩包 pages=0');

// ---- 生成 GUI 测试样本：12 页彩色 PNG 的 zip ----
mkdirSync(new URL('../test/', import.meta.url), { recursive: true });
const entries = [];
for (let i = 1; i <= 12; i++) {
  const wide = i === 2;                                   // 第 2 页为超宽跨页，用于测试「拆分宽页」
  const w = wide ? 1000 : 400, h = wide ? 400 : 600;
  const r = (i * 67) % 256, g = (i * 41) % 256, b = (i * 29) % 256;
  entries.push({ name: String(i).padStart(2, '0') + '.png', data: png(w, h, r, g, b) });
}
entries.push({ name: 'extra/readme.txt', data: Buffer.from('should be filtered') });
writeFileSync(new URL('../test/sample.zip', import.meta.url), makeZip(entries));
console.log('\n已生成 test/sample.zip（12 页 400x600 彩色 PNG）');

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log('\n全部断言通过 ✓');
