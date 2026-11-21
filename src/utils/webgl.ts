let cachedSoftwareGl: boolean | null = null;
let cachedWebGlSupported: boolean | null = null;

export function isWebGLSupported(): boolean {
  if (cachedWebGlSupported !== null) return cachedWebGlSupported;
  if (typeof document === 'undefined') {
    cachedWebGlSupported = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedWebGlSupported = false;
      return false;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedWebGlSupported = true;
    return true;
  } catch {
    cachedWebGlSupported = false;
    return false;
  }
}

export function detectSoftwareWebGL(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  if (typeof document === 'undefined') {
    cachedSoftwareGl = true;
    return true;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedSoftwareGl;
  } catch {
    cachedSoftwareGl = true;
    return true;
  }
}

export function scheduleAfterDraw(
  gl: WebGL2RenderingContext | WebGLRenderingContext | null,
  cb: () => void,
  onTimerId: (id: number) => void,
): void {
  if (gl && 'fenceSync' in gl && typeof gl.fenceSync === 'function') {
    const gl2 = gl as WebGL2RenderingContext;
    const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl2.flush();
    const poll = () => {
      const state = sync ? gl2.getSyncParameter(sync, gl2.SYNC_STATUS) : gl2.SIGNALED;
      if (state === gl2.UNSIGNALED) {
        onTimerId(window.setTimeout(poll, 5));
      } else {
        if (sync) gl2.deleteSync(sync);
        onTimerId(window.setTimeout(cb, 80));
      }
    };
    onTimerId(window.setTimeout(poll, 5));
    return;
  }
  onTimerId(window.setTimeout(cb, 80));
}
