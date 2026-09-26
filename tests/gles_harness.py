"""Offscreen OpenGL ES 3 shader harness. No browser or Windows capture is simulated.
Requires Mesa EGL/GL, NumPy and Pillow. Executes the app's unmodified GLSL ES 300
strings. This supplements, but does not replace, WebGL/WebView2 runtime testing.
"""
import ctypes as C
import numpy as np

class GLES:
 def __init__(self, width=256, height=192):
  self.width,self.height=width,height
  self.e=C.CDLL('libEGL.so.1');self.g=C.CDLL('libGL.so.1');self.programs={};self.active=None
  def e(name,ret,args):
   f=getattr(self.e,name);f.restype=ret;f.argtypes=args;return f
  e('eglGetProcAddress',C.c_void_p,[C.c_char_p])
  displayfn=C.CFUNCTYPE(C.c_void_p,C.c_uint,C.c_void_p,C.POINTER(C.c_int))(self.e.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
  self.display=displayfn(0x31DD,None,None)
  e('eglInitialize',C.c_uint,[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_int)])
  a,b=C.c_int(),C.c_int()
  if not self.e.eglInitialize(self.display,C.byref(a),C.byref(b)):raise RuntimeError('Cannot initialize EGL')
  e('eglBindAPI',C.c_uint,[C.c_uint])(0x30A0)
  attrs=(C.c_int*15)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,0,0x3038)
  e('eglChooseConfig',C.c_uint,[C.c_void_p,C.POINTER(C.c_int),C.POINTER(C.c_void_p),C.c_int,C.POINTER(C.c_int)])
  config,n=C.c_void_p(),C.c_int()
  self.e.eglChooseConfig(self.display,attrs,C.byref(config),1,C.byref(n))
  if not n.value:raise RuntimeError('No GLES3 pbuffer configuration')
  e('eglCreateContext',C.c_void_p,[C.c_void_p,C.c_void_p,C.c_void_p,C.POINTER(C.c_int)])
  self.context=self.e.eglCreateContext(self.display,config,None,(C.c_int*3)(0x3098,3,0x3038))
  e('eglCreatePbufferSurface',C.c_void_p,[C.c_void_p,C.c_void_p,C.POINTER(C.c_int)])
  self.surface=self.e.eglCreatePbufferSurface(self.display,config,(C.c_int*5)(0x3057,width,0x3056,height,0x3038))
  e('eglMakeCurrent',C.c_uint,[C.c_void_p,C.c_void_p,C.c_void_p,C.c_void_p])
  if not self.e.eglMakeCurrent(self.display,self.surface,self.surface,self.context):raise RuntimeError('Cannot make GLES3 current')
  types={
   'glGetString':(C.c_char_p,[C.c_uint]),'glGetError':(C.c_uint,[]),
   'glCreateShader':(C.c_uint,[C.c_uint]),'glShaderSource':(None,[C.c_uint,C.c_int,C.POINTER(C.c_char_p),C.POINTER(C.c_int)]),
   'glCompileShader':(None,[C.c_uint]),'glGetShaderiv':(None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)]),'glGetShaderInfoLog':(None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_void_p]),
   'glCreateProgram':(C.c_uint,[]),'glAttachShader':(None,[C.c_uint,C.c_uint]),'glLinkProgram':(None,[C.c_uint]),'glGetProgramiv':(None,[C.c_uint,C.c_uint,C.POINTER(C.c_int)]),'glGetProgramInfoLog':(None,[C.c_uint,C.c_int,C.POINTER(C.c_int),C.c_void_p]),
   'glDeleteShader':(None,[C.c_uint]),'glUseProgram':(None,[C.c_uint]),'glGetUniformLocation':(C.c_int,[C.c_uint,C.c_char_p]),
   'glUniform1f':(None,[C.c_int,C.c_float]),'glUniform1i':(None,[C.c_int,C.c_int]),'glUniform2f':(None,[C.c_int,C.c_float,C.c_float]),'glUniform3f':(None,[C.c_int,C.c_float,C.c_float,C.c_float]),'glUniform4fv':(None,[C.c_int,C.c_int,C.POINTER(C.c_float)]),
   'glGenTextures':(None,[C.c_int,C.POINTER(C.c_uint)]),'glActiveTexture':(None,[C.c_uint]),'glBindTexture':(None,[C.c_uint,C.c_uint]),'glTexParameteri':(None,[C.c_uint,C.c_uint,C.c_int]),'glTexImage2D':(None,[C.c_uint,C.c_int,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p]),'glTexSubImage2D':(None,[C.c_uint,C.c_int,C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p]),
   'glGenFramebuffers':(None,[C.c_int,C.POINTER(C.c_uint)]),'glBindFramebuffer':(None,[C.c_uint,C.c_uint]),'glFramebufferTexture2D':(None,[C.c_uint,C.c_uint,C.c_uint,C.c_uint,C.c_int]),'glCheckFramebufferStatus':(C.c_uint,[C.c_uint]),
   'glViewport':(None,[C.c_int,C.c_int,C.c_int,C.c_int]),'glClearColor':(None,[C.c_float,C.c_float,C.c_float,C.c_float]),'glClear':(None,[C.c_uint]),'glDrawArrays':(None,[C.c_uint,C.c_int,C.c_int]),'glReadPixels':(None,[C.c_int,C.c_int,C.c_int,C.c_int,C.c_uint,C.c_uint,C.c_void_p]),'glFinish':(None,[])
  }
  for name,(ret,args) in types.items():
   f=getattr(self.g,name);f.restype=ret;f.argtypes=args
  self.renderer=self.g.glGetString(0x1F01).decode();self.version=self.g.glGetString(0x1F02).decode()
  self.textures=[self.texture(128,1),self.texture(256,1),self.texture(128,64),self.texture(width,height),self.texture(width,height)]
  self.fbos=[]
  for texture in self.textures[3:]:
   f=C.c_uint();self.g.glGenFramebuffers(1,C.byref(f));self.g.glBindFramebuffer(0x8D40,f.value);self.g.glFramebufferTexture2D(0x8D40,0x8CE0,0x0DE1,texture,0)
   if self.g.glCheckFramebufferStatus(0x8D40)!=0x8CD5:raise RuntimeError('Incomplete framebuffer')
   self.fbos.append(f.value)
  self.g.glViewport(0,0,width,height);self.g.glBindFramebuffer(0x8D40,0);self.feedback_index=0
 def texture(self,w,h):
  t=C.c_uint();self.g.glGenTextures(1,C.byref(t));self.g.glBindTexture(0x0DE1,t.value)
  for name,val in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:self.g.glTexParameteri(0x0DE1,name,val)
  data=np.zeros((h,w,4),dtype=np.uint8)
  self.g.glTexImage2D(0x0DE1,0,0x1908,w,h,0,0x1908,0x1401,data.ctypes.data_as(C.c_void_p));return t.value
 def shader(self,text,typ):
  shader=self.g.glCreateShader(typ);src=C.c_char_p(text.encode());self.g.glShaderSource(shader,1,C.byref(src),None);self.g.glCompileShader(shader)
  ok=C.c_int();self.g.glGetShaderiv(shader,0x8B81,C.byref(ok))
  if not ok.value:
   buf=C.create_string_buffer(16384);self.g.glGetShaderInfoLog(shader,16384,None,buf);raise RuntimeError(buf.value.decode())
  return shader
 def program(self,name,vertex,fragment):
  a=self.shader(vertex,0x8B31);b=self.shader(fragment,0x8B30);prog=self.g.glCreateProgram();self.g.glAttachShader(prog,a);self.g.glAttachShader(prog,b);self.g.glLinkProgram(prog)
  ok=C.c_int();self.g.glGetProgramiv(prog,0x8B82,C.byref(ok))
  if not ok.value:
   buf=C.create_string_buffer(16384);self.g.glGetProgramInfoLog(prog,16384,None,buf);raise RuntimeError(buf.value.decode())
  self.g.glDeleteShader(a);self.g.glDeleteShader(b);self.programs[name]=prog
 def uniform(self,name,value):
  loc=self.g.glGetUniformLocation(self.active,name.encode())
  if loc<0:return
  if isinstance(value,(int,float)):
   if name in ['uSpectrum','uWaveform','uHistory','uFeedback']:self.g.glUniform1i(loc,int(value))
   else:self.g.glUniform1f(loc,float(value))
  elif len(value)==2:self.g.glUniform2f(loc,*value)
  elif len(value)==3:self.g.glUniform3f(loc,*value)
  elif len(value)%4==0:self.g.glUniform4fv(loc,len(value)//4,(C.c_float*len(value))(*value))
  else:raise ValueError(name)
 def texdata(self,unit,values):
  values=np.asarray(values);h=values.shape[0] if values.ndim==2 else 1;w=values.shape[-1]
  data=np.empty((h,w,4),dtype=np.uint8);v=np.clip(np.round(values*255),0,255).astype(np.uint8).reshape(h,w)
  data[:,:,:3]=v[:,:,None];data[:,:,3]=255
  self.g.glActiveTexture(0x84C0+unit);self.g.glBindTexture(0x0DE1,self.textures[unit]);self.g.glTexSubImage2D(0x0DE1,0,0,0,w,h,0x1908,0x1401,data.ctypes.data_as(C.c_void_p))
 def reset(self):
  self.feedback_index=0
  for f in self.fbos:
   self.g.glBindFramebuffer(0x8D40,f);self.g.glClearColor(0,0,0,0);self.g.glClear(0x4000)
  self.g.glBindFramebuffer(0x8D40,0)
 def draw(self,name,uniforms,spectrum,waveform,history=None,feedback=False):
  self.active=self.programs[name];self.g.glUseProgram(self.active)
  self.g.glBindFramebuffer(0x8D40,self.fbos[self.feedback_index] if feedback else 0)
  self.texdata(0,spectrum);self.texdata(1,(np.asarray(waveform)*0.5+0.5));self.texdata(2,np.tile(spectrum,(64,1)) if history is None else history)
  self.g.glActiveTexture(0x84C0+3);self.g.glBindTexture(0x0DE1,self.textures[3+(1-self.feedback_index)])
  for name_,value in {'uResolution':[self.width,self.height],'uSpectrum':0,'uWaveform':1,'uHistory':2,'uFeedback':3,**uniforms}.items():self.uniform(name_,value)
  self.g.glDrawArrays(4,0,3);self.g.glFinish()
  image=np.zeros((self.height,self.width,4),dtype=np.uint8);self.g.glReadPixels(0,0,self.width,self.height,0x1908,0x1401,image.ctypes.data_as(C.c_void_p))
  err=self.g.glGetError()
  if err:raise RuntimeError(f'GL error {hex(err)}')
  if feedback:self.feedback_index=1-self.feedback_index
  return image[::-1].copy()
