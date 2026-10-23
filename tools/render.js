// Rasterizador de teste: gera PNG da cena sem navegador (usa só fillStyle/fillRect)
const zlib = require('zlib'), fs = require('fs'), Scene = require('../public/scene.js');
function crc(buf) { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++)c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
function png(w, h, rgba) {
    const ch = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4); d.copy(b, 8); b.writeUInt32BE(crc(Buffer.concat([Buffer.from(t), d])), 8 + d.length); return b };
    const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))])
}
function raster(W, H) {
    const px = Buffer.alloc(W * H * 4, 255); return {
        px, ctx: {
            fillStyle: '#000', fillRect(x, y, w, h) {
                let c = this.fillStyle, a = 1, r, g, b;
                if (c[0] === '#') { r = parseInt(c.slice(1, 3), 16); g = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16) } else { const m = c.match(/[\d.]+/g); r = +m[0]; g = +m[1]; b = +m[2]; a = +m[3] }
                for (let j = Math.max(0, y); j < Math.min(H, y + h); j++)for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) { const o = (j * W + i) * 4; px[o] = px[o] * (1 - a) + r * a; px[o + 1] = px[o + 1] * (1 - a) + g * a; px[o + 2] = px[o + 2] * (1 - a) + b * a }
            }
        }
    }
}
function up(px, W, H, s) { const o = Buffer.alloc(W * s * H * s * 4); for (let y = 0; y < H * s; y++)for (let x = 0; x < W * s; x++) { px.copy(o, (y * W * s + x) * 4, (Math.floor(y / s) * W + Math.floor(x / s)) * 4, (Math.floor(y / s) * W + Math.floor(x / s)) * 4 + 4) } return o }
module.exports = { raster, png, up };
if (require.main === module) {
    const W = 236, H = 64, S = 4, worlds = ['floresta', 'dunas', 'montanha', 'costa'], skins = ['aventureiro', 'ninja', 'robo', 'dourado'];
    const cols = [], tw = W * S, th = H * S; const all = Buffer.alloc(tw * th * 4 * 4);
    worlds.forEach((w, i) => { const r = raster(W, H); Scene.render(r.ctx, W, H, { world: w, skin: skins[i], t: 1.37 + i * .21, scroll: 420 + i * 130, pose: i === 3 ? 'idle' : 'walk' }); up(r.px, W, H, S).copy(all, i * tw * th * 4) });
    fs.writeFileSync(process.argv[2] || '/tmp/scene.png', png(tw, th * 4, all));
}
