// A tiny regl-like WebGL2 layer. The whole renderer is built on three primitives:
// `buffer` (GPU vertex data), `texture` (sampled images / data), and `command`
// (a compiled draw: shaders + a fixed attribute layout, invoked per-frame with
// dynamic uniforms + instance/vertex counts). Declare a command once, call it
// every frame with fresh uniforms — no per-call program/VAO churn. This is the
// substrate the sprite/terrain/fog/particle passes share, and what keeps the hot
// loop to a handful of `drawArraysInstanced` calls regardless of unit count.

export type UniformValue = number | Float32Array | number[] | Texture;

type AttribSpec = {
  buffer: Buffer;
  size: number; // components per vertex (1..4)
  divisor?: number; // 0 = per-vertex (default), 1 = per-instance
  stride?: number; // bytes; 0 = tightly packed
  offset?: number; // bytes
  type?: number; // gl.FLOAT (default)
};

export type CommandSpec = {
  vert: string;
  frag: string;
  attributes: Record<string, AttribSpec>;
  uniforms?: string[]; // declared uniform names (samplers auto-assigned a unit)
  primitive?: number; // default gl.TRIANGLES
  blend?: boolean | 'add'; // true = src-alpha over (default), 'add' = additive, false = off
  depth?: boolean; // default false
};

export type DrawProps = {
  uniforms?: Record<string, UniformValue>;
  count?: number; // vertices to draw
  instances?: number; // > 0 → instanced draw
};

export type Command = (props: DrawProps) => void;

export class Buffer {
  readonly buf: WebGLBuffer;
  private gl: WebGL2RenderingContext;
  private target: number;
  constructor(gl: WebGL2RenderingContext, target?: number) {
    this.gl = gl;
    this.target = target ?? gl.ARRAY_BUFFER;
    this.buf = gl.createBuffer()!;
  }
  /** (Re)allocate + upload. Use for data that changes size. */
  data(src: ArrayBufferView, usage: number = this.gl.DYNAMIC_DRAW): this {
    this.gl.bindBuffer(this.target, this.buf);
    this.gl.bufferData(this.target, src, usage);
    return this;
  }
  /** Upload into an already-sized buffer (no realloc — cheaper for per-frame data). */
  sub(src: ArrayBufferView, byteOffset = 0): this {
    this.gl.bindBuffer(this.target, this.buf);
    this.gl.bufferSubData(this.target, byteOffset, src);
    return this;
  }
}

export type TextureOpts = {
  source?: TexImageSource; // canvas / image / bitmap
  data?: ArrayBufferView | null; // raw pixels (with width/height/format)
  width?: number;
  height?: number;
  format?: number; // default RGBA
  internalFormat?: number; // default matches format
  type?: number; // default UNSIGNED_BYTE
  filter?: number; // default LINEAR
  wrap?: number; // default CLAMP_TO_EDGE
  flipY?: boolean;
};

export class Texture {
  readonly tex: WebGLTexture;
  private gl: WebGL2RenderingContext;
  private w = 0;
  private h = 0;
  private fmt: number;
  private ifmt: number;
  private type: number;
  constructor(gl: WebGL2RenderingContext, opts: TextureOpts) {
    this.gl = gl;
    this.tex = gl.createTexture()!;
    this.fmt = opts.format ?? gl.RGBA;
    this.ifmt = opts.internalFormat ?? this.fmt;
    this.type = opts.type ?? gl.UNSIGNED_BYTE;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.filter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, opts.filter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap ?? gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, opts.wrap ?? gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, opts.flipY ? 1 : 0);
    if (opts.source) this.set(opts.source);
    else this.resize(opts.width ?? 1, opts.height ?? 1, opts.data ?? null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  }
  /** Replace contents from a DOM image source (canvas/image). */
  set(source: TexImageSource): this {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.ifmt, this.fmt, this.type, source);
    return this;
  }
  /** (Re)allocate raw storage, optionally with pixel data. */
  resize(w: number, h: number, data: ArrayBufferView | null = null): this {
    const gl = this.gl;
    this.w = w; this.h = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.ifmt, w, h, 0, this.fmt, this.type, data);
    return this;
  }
  /** Upload raw pixel data into existing storage (resizes if dimensions changed). */
  put(w: number, h: number, data: ArrayBufferView): this {
    if (w !== this.w || h !== this.h) return this.resize(w, h, data);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, this.fmt, this.type, data);
    return this;
  }
}

// GL uniform type → setter. Filled lazily from the live context (constants are
// only valid once we have a GL instance).
const uniformSetter = (
  gl: WebGL2RenderingContext,
  type: number,
  loc: WebGLUniformLocation,
  unit: number,
): ((v: UniformValue) => void) => {
  switch (type) {
    case gl.FLOAT: return (v) => gl.uniform1f(loc, v as number);
    case gl.FLOAT_VEC2: return (v) => gl.uniform2fv(loc, v as Float32Array);
    case gl.FLOAT_VEC3: return (v) => gl.uniform3fv(loc, v as Float32Array);
    case gl.FLOAT_VEC4: return (v) => gl.uniform4fv(loc, v as Float32Array);
    case gl.FLOAT_MAT3: return (v) => gl.uniformMatrix3fv(loc, false, v as Float32Array);
    case gl.FLOAT_MAT4: return (v) => gl.uniformMatrix4fv(loc, false, v as Float32Array);
    case gl.SAMPLER_2D: // bind the texture to this command's reserved unit
      return (v) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, (v as Texture).tex);
        gl.uniform1i(loc, unit);
      };
    default: return (v) => gl.uniform1i(loc, v as number); // int / bool
  }
};

const compile = (gl: WebGL2RenderingContext, type: number, src: string): WebGLShader => {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
};

export class Gl {
  readonly gl: WebGL2RenderingContext;
  constructor(gl: WebGL2RenderingContext) { this.gl = gl; }

  buffer(target?: number): Buffer { return new Buffer(this.gl, target); }
  texture(opts: TextureOpts): Texture { return new Texture(this.gl, opts); }

  viewport(w: number, h: number): void { this.gl.viewport(0, 0, w, h); }
  clear(r: number, g: number, b: number, a = 1): void {
    this.gl.clearColor(r, g, b, a);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  /** Compile a draw command. The attribute layout (and its VAO) is fixed here;
   *  only uniforms + counts vary per call, so invoking is near-zero overhead. */
  command(spec: CommandSpec): Command {
    const gl = this.gl;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, spec.vert));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, spec.frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(prog)}`);
    }

    // Bake the attribute layout into a VAO once.
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    for (const [name, a] of Object.entries(spec.attributes)) {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) continue; // attribute optimized out
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buffer.buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, a.size, a.type ?? gl.FLOAT, false, a.stride ?? 0, a.offset ?? 0);
      if (a.divisor) gl.vertexAttribDivisor(loc, a.divisor);
    }
    gl.bindVertexArray(null);

    // Resolve uniform setters (and reserve a texture unit per sampler).
    const setters: Record<string, (v: UniformValue) => void> = {};
    let unit = 0;
    for (const name of spec.uniforms ?? []) {
      const loc = gl.getUniformLocation(prog, name);
      if (!loc) continue;
      const info = gl.getActiveUniform(prog, indexOfUniform(gl, prog, name));
      const isSampler = info?.type === gl.SAMPLER_2D;
      setters[name] = uniformSetter(gl, info?.type ?? gl.FLOAT, loc, isSampler ? unit++ : 0);
    }

    const primitive = spec.primitive ?? gl.TRIANGLES;
    const blend = spec.blend ?? true;
    const depth = spec.depth ?? false;

    return (props: DrawProps): void => {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      if (blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); }
      else if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      else gl.disable(gl.BLEND);
      if (depth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
      if (props.uniforms) {
        for (const name in props.uniforms) setters[name]?.(props.uniforms[name]!);
      }
      const count = props.count ?? 0;
      if (props.instances && props.instances > 0) {
        gl.drawArraysInstanced(primitive, 0, count, props.instances);
      } else {
        gl.drawArrays(primitive, 0, count);
      }
      gl.bindVertexArray(null);
    };
  }
}

// getActiveUniform wants an index, not a name; resolve it once at command build.
const indexOfUniform = (gl: WebGL2RenderingContext, prog: WebGLProgram, name: string): number => {
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (info && (info.name === name || info.name === `${name}[0]`)) return i;
  }
  return 0;
};
