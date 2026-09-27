// Generate a standalone GPU check; open artifacts/organism-webgl.html after build.
import { mkdir, writeFile } from 'node:fs/promises';
import { organism } from '../dist/visuals/organism.js';
import { VERTEX } from '../dist/visuals/common.js';
import { previewFragment } from '../dist/preview-tuning.js';

await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/organism-webgl.html', `<!doctype html><meta charset="utf-8">
<style>body{background:#10131c;color:white;font:16px system-ui}canvas{width:384px;height:288px;margin:8px}</style>
<pre id="result">Running GPU checks</pre><script>
const vertex=${JSON.stringify(VERTEX)}, sources=${JSON.stringify([organism.fragment, previewFragment('organism', organism.fragment)])};
try {
  const results=[];
  for (const [variant,source] of sources.entries()) {
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=144;
    document.body.append(canvas);
    const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});
    if(!gl) throw Error('WebGL2 unavailable');
    const program=gl.createProgram();
    for(const [type,code] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,source]]) {
      const shader=gl.createShader(type);gl.shaderSource(shader,code);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program,shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);gl.viewport(0,0,192,144);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([80,80,80,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    const loc=name=>gl.getUniformLocation(program,name);
    const set=(name,value)=>gl.uniform1f(loc(name),value);
    gl.uniform2f(loc('uResolution'),192,144);
    for(const [name,value] of Object.entries({uIntensity:.9,uGlow:.8,uLineWidth:1,uOpacity:1,uVariety:1})) set(name,value);
    gl.uniform3f(loc('uColorA'),.1,1,.4);gl.uniform3f(loc('uColorB'),.4,.1,1);gl.uniform3f(loc('uColorC'),.1,.6,1);
    function render(values={}) {
      for(const name of ['uBass','uMid','uTreble','uImpact']) set(name,0);
      set('uFlow',3);
      for(const [name,value] of Object.entries(values)) set(name,value);
      gl.drawArrays(gl.TRIANGLES,0,3);
      const pixels=new Uint8Array(192*144*4);gl.readPixels(0,0,192,144,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      if(gl.getError()!==gl.NO_ERROR) throw Error('GL error');
      return pixels;
    }
    const baseline=render();
    for(const [name,values] of Object.entries({bass:{uBass:.8},mids:{uMid:.8},highs:{uTreble:.8},attack:{uImpact:.8},morph:{uFlow:3.6}})) {
      const pixels=render(values);
      const change=pixels.reduce((sum,v,i)=>sum+(i%4===3?0:Math.abs(v-baseline[i])),0)/(192*144*3);
      if(change<2) throw Error(name+' has insufficient visible response: '+change);
      results.push({variant:variant?'preview':'native',input:name,meanPixelChange:+change.toFixed(2)});
    }
    const again=render();
    if(again.some((v,i)=>v!==baseline[i])) throw Error('Frozen inputs must hold the scene');
  }
  document.querySelector('#result').textContent='PASS '+JSON.stringify(results,null,2);
} catch(error) {document.querySelector('#result').textContent='FAIL '+error.stack;}
</script>`);
