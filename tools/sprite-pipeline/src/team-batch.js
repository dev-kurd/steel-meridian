/* Team-colour batching for PixiJS v8 (WebGL).
 *
 * One sprite per unit layer: the sheet holds the picture in its top half and a mask in its bottom half
 * (R = team paint, G = team lights). A custom batcher gives every vertex the unit's team colour and light
 * colour, and its shader tints the masked pixels while drawing. Units of every team still draw together in
 * one batch (a filter per sprite would break batching and cost one draw call per unit).
 *
 * Use:  const s = new TeamColor.TeamSprite(texture);   s.setTeam(0x2f9a45, 0x97cca2);   // or s.setTeam(null) = no tint
 *       TeamColor.teamColours('#2f6fd1') → { paint, light } following the art style guide (equal brightness …)
 * Register before app.init(), and init with preference: 'webgl'.
 */
(function (PIXI) {
  'use strict';
  const { Batcher, Geometry, Buffer, BufferUsage, Shader, compileHighShaderGlProgram, colorBitGl, generateTextureBatchBitGl,
    roundPixelsBitGl, getBatchSamplersUniformGroup, extensions, ExtensionType, Sprite, SpritePipe } = PIXI;

  const VERTEX = 8;            // x, y, u, v, colour, textureId+round, team colour, light colour (32-bit each)
  const PAINT_GAIN = '1.1087'; // team paint is baked at #e6e6e6 (230); 255 / 230 restores full brightness

  class TeamBatchGeometry extends Geometry {
    constructor() {
      const attributeBuffer = new Buffer({ data: new Float32Array(1), label: 'team-batch-attributes', usage: BufferUsage.VERTEX | BufferUsage.COPY_DST, shrinkToFit: false });
      const indexBuffer = new Buffer({ data: new Uint32Array(1), label: 'team-batch-index', usage: BufferUsage.INDEX | BufferUsage.COPY_DST, shrinkToFit: false });
      const stride = VERTEX * 4;
      super({
        attributes: {
          aPosition: { buffer: attributeBuffer, format: 'float32x2', stride, offset: 0 },
          aUV: { buffer: attributeBuffer, format: 'float32x2', stride, offset: 8 },
          aColor: { buffer: attributeBuffer, format: 'unorm8x4', stride, offset: 16 },
          aTextureIdAndRound: { buffer: attributeBuffer, format: 'uint16x2', stride, offset: 20 },
          aTeam: { buffer: attributeBuffer, format: 'unorm8x4', stride, offset: 24 },
          aLight: { buffer: attributeBuffer, format: 'unorm8x4', stride, offset: 28 },
        },
        indexBuffer,
      });
    }
  }

  // shader piece added after PixiJS's own texture sampling: read the mask half a texture lower and tint
  function teamBit(maxTextures) {
    let sample = '';
    for (let i = 0; i < maxTextures; i++) {
      if (i > 0) sample += 'else ';
      if (i < maxTextures - 1) sample += `if (vTextureId < ${i}.5) `;
      sample += `{ m = texture(uTextures[${i}], muv); }\n`;
    }
    return {
      name: 'team-colour-bit',
      vertex: { header: 'in vec4 aTeam; in vec4 aLight; out vec4 vTeam; out vec4 vLight;', main: 'vTeam = aTeam; vLight = aLight;' },
      fragment: {
        header: 'in vec4 vTeam; in vec4 vLight;',
        main: `
          if (vTeam.a > 0.5) {                              // alpha 0 = no team colour (overlays, effects, other sheets)
            vec2 muv = vec2(vUV.x, vUV.y + 0.5);            // the mask of this pixel: same place, bottom half
            vec4 m = vec4(0.0);
            ${sample}
            outColor.rgb *= mix(vec3(1.0), min(vTeam.rgb * ${PAINT_GAIN}, vec3(1.0)), m.r);   // team paint
            outColor.rgb *= mix(vec3(1.0), vLight.rgb, m.g);                                  // team lights
          }`,
      },
    };
  }

  const shaders = {};
  function getShader(maxTextures) {
    if (!shaders[maxTextures]) {
      const glProgram = compileHighShaderGlProgram({ name: 'team-batch', bits: [colorBitGl, generateTextureBatchBitGl(maxTextures), roundPixelsBitGl, teamBit(maxTextures)] });
      shaders[maxTextures] = new Shader({ glProgram, resources: { batchSamplers: getBatchSamplersUniformGroup(maxTextures) } });
      shaders[maxTextures].maxTextures = maxTextures;
    }
    return shaders[maxTextures];
  }

  class TeamBatcher extends Batcher {
    constructor(options) {
      super(options);
      this.geometry = new TeamBatchGeometry();
      this.name = 'team';
      this.vertexSize = VERTEX;
      this.shader = getShader(this.maxTextures);
    }
    // meshes (rare here): same as PixiJS's default, plus the two team colours
    packAttributes(el, f32, u32, index, textureId) {
      const idRound = (textureId << 16) | (el.roundPixels & 65535), wt = el.transform, { positions, uvs } = el;
      const team = el.renderable?._teamPacked || 0, light = el.renderable?._lightPacked || 0, argb = el.color;
      for (let i = el.attributeOffset, end = el.attributeOffset + el.attributeSize; i < end; i++) {
        const x = positions[i * 2], y = positions[i * 2 + 1];
        f32[index++] = wt.a * x + wt.c * y + wt.tx; f32[index++] = wt.d * y + wt.b * x + wt.ty;
        f32[index++] = uvs[i * 2]; f32[index++] = uvs[i * 2 + 1];
        u32[index++] = argb; u32[index++] = idRound; u32[index++] = team; u32[index++] = light;
      }
    }
    // sprites: four corners, each with the unit's team + light colour
    packQuadAttributes(el, f32, u32, index, textureId) {
      const wt = el.transform, a = wt.a, b = wt.b, c = wt.c, d = wt.d, tx = wt.tx, ty = wt.ty;
      const bd = el.bounds, w0 = bd.maxX, w1 = bd.minX, h0 = bd.maxY, h1 = bd.minY, uv = el.texture.uvs;
      const argb = el.color, idRound = (textureId << 16) | (el.roundPixels & 65535);
      const team = el.renderable._teamPacked || 0, light = el.renderable._lightPacked || 0;
      const corner = (o, x, y, u, v) => { f32[o] = a * x + c * y + tx; f32[o + 1] = d * y + b * x + ty; f32[o + 2] = u; f32[o + 3] = v; u32[o + 4] = argb; u32[o + 5] = idRound; u32[o + 6] = team; u32[o + 7] = light; };
      corner(index, w1, h1, uv.x0, uv.y0); corner(index + 8, w0, h1, uv.x1, uv.y1); corner(index + 16, w0, h0, uv.x2, uv.y2); corner(index + 24, w1, h0, uv.x3, uv.y3);
    }
    _updateMaxTextures(maxTextures) { if (this.shader.maxTextures !== maxTextures) this.shader = getShader(maxTextures); }
    destroy() { this.shader = null; super.destroy(); } // shaders are shared between batchers
  }
  TeamBatcher.extension = { type: [ExtensionType.Batcher], name: 'team' };

  // sprites drawn through the team batcher (anything in a team layer should use it, so batches never break)
  class TeamSpritePipe extends SpritePipe {
    _initGPUSprite(sprite) { const g = super._initGPUSprite(sprite); g.batcherName = 'team'; return g; }
  }
  TeamSpritePipe.extension = { type: [ExtensionType.WebGLPipes], name: 'teamSprite' };

  // 0xRRGGBB → the byte order the vertex attribute expects (R, G, B, A in memory), alpha 255 = tint on
  const pack = (rgb) => ((255 << 24) | ((rgb & 255) << 16) | (((rgb >> 8) & 255) << 8) | ((rgb >> 16) & 255)) >>> 0;
  class TeamSprite extends Sprite {
    constructor(options) { super(options); this.renderPipeId = 'teamSprite'; this._teamPacked = 0; this._lightPacked = 0; }
    setTeam(paint, light) {
      const p = paint == null ? 0 : pack(paint), l = paint == null ? 0 : pack(light ?? 0xffffff);
      if (p !== this._teamPacked || l !== this._lightPacked) { this._teamPacked = p; this._lightPacked = l; this.onViewUpdate(); }
    }
  }

  // ---- team colours following the art style guide ----
  // paint: chosen hue, saturation 0.60–0.82, lightness solved so every team is equally bright (cap 0.56);
  // purple/violet (255–320°) softer and 25% brighter (cap 0.64); red (335–15°) softer and 10% darker (cap 0.50);
  // light = paint mixed 50% with white.
  const hsl = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const TARGET = lum(hsl(128, 0.62, 0.40));
  const toInt = ([r, g, b]) => (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
  function teamColours(hex) {
    const n = parseInt(hex.replace('#', ''), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l0 = (mx + mn) / 2;
    const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
    let h = d === 0 ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); if (h < 0) h += 360;
    let sat = Math.min(0.82, Math.max(0.6, s0)), target = TARGET, cap = 0.56;
    if (h >= 255 && h <= 320) { sat = Math.min(0.5, Math.max(0.42, s0)); target *= 1.25; cap = 0.64; }
    if (h >= 335 || h <= 15) { sat = Math.min(0.52, Math.max(0.46, s0)); target *= 0.9; cap = 0.5; }
    if (s0 < 0.12) sat = s0;                                 // greys and white stay neutral
    let lo = 0.05, hi = cap; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (lum(hsl(h, sat, m)) < target) lo = m; else hi = m; }
    const paint = hsl(h, sat, (lo + hi) / 2), light = paint.map((c) => c + (1 - c) * 0.5);
    return { paint: toInt(paint), light: toInt(light), paintHex: '#' + toInt(paint).toString(16).padStart(6, '0'), lightHex: '#' + toInt(light).toString(16).padStart(6, '0') };
  }

  extensions.add(TeamBatcher, TeamSpritePipe);
  window.TeamColor = { TeamSprite, TeamBatcher, teamColours };
})(PIXI);
