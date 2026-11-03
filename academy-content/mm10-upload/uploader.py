
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
import os,time,hmac,struct,subprocess,sys

TOKEN=os.environ['MM10_TOKEN']
ROUTE=os.environ['MM10_ROUTE']
DEADLINE=int(os.environ['MM10_DEADLINE'])
ROOT=Path('/srv/tenx-public/miniapp')
MAX=5*1024*1024

PAGE="""<!doctype html>
<html lang="fa" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MMTrade10X Logo Upload</title>
<style>
body{background:#07120d;color:#f5f5f5;
font-family:Tahoma,sans-serif;padding:25px}
main{max-width:450px;margin:50px auto;
padding:25px;border:1px solid #236d45;
border-radius:20px;background:#101d16}
h2{color:#58ee9c}
input,button{display:block;margin:20px 0;width:100%}
button{background:#28d881;border:0;padding:15px;
border-radius:12px;font-weight:bold;font-size:16px}
small{color:#b6c9bb}
</style>
<main>
<h2>آپلود لوگوی MMTrade10X</h2>
<p>تصویر اصلی را انتخاب کن.</p>
<input id="file" type="file" accept="image/png,image/jpeg">
<button id="send">آپلود لوگو</button>
<p id="status"></p>
<small>PNG یا JPG، حداکثر ۵ مگابایت.
لینک موقت و یک‌بارمصرف است.</small>
</main>
<script>
document.getElementById('send').onclick=async()=>{
 const f=document.getElementById('file').files[0];
 const status=document.getElementById('status');
 if(!f){status.textContent='ابتدا عکس را انتخاب کن';return}
 if(f.size>5242880){status.textContent='حجم بیش از حد است';return}
 status.textContent='در حال آپلود...';
 try{
  const r=await fetch(location.pathname,{
   method:'POST',
   headers:{'Content-Type':f.type},
   body:f
  });
  status.textContent=await r.text();
 }catch(e){status.textContent='خطا در اتصال'}
};
</script></html>"""

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): pass

 def send(self,code,body,typ='text/plain; charset=utf-8'):
  data=body.encode()
  self.send_response(code)
  self.send_header('Content-Type',typ)
  self.send_header('Content-Length',str(len(data)))
  self.send_header('Cache-Control','no-store')
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('Content-Security-Policy',
    "default-src 'none'; script-src 'unsafe-inline'; "
    "style-src 'unsafe-inline'; connect-src 'self'")
  self.end_headers()
  self.wfile.write(data)

 def allowed(self):
  return (
   time.time()<DEADLINE and
   hmac.compare_digest(self.path,ROUTE) and
   self.headers.get('Host','').split(':')[0]
     =='mmtrade.parsahojabrian.ir'
  )

 def do_GET(self):
  if not self.allowed():
   return self.send(404,'Not found')
  self.send(200,PAGE,'text/html; charset=utf-8')

 def do_POST(self):
  if not self.allowed():
   return self.send(404,'Not found')
  origin=self.headers.get('Origin','')
  if origin!='https://mmtrade.parsahojabrian.ir':
   return self.send(403,'Origin rejected')
  try: n=int(self.headers.get('Content-Length','0'))
  except ValueError: n=0
  if not 0<n<=MAX:
   return self.send(413,'Invalid file size')
  data=self.rfile.read(n)
  if len(data)!=n:
   return self.send(400,'Incomplete upload')

  ext=None
  if data.startswith(b'\x89PNG\r\n\x1a\n') and len(data)>33:
   w,h=struct.unpack('>II',data[16:24])
   if data[12:16]==b'IHDR' and 0<w<=8000 and 0<h<=8000:
    ext='png'
  elif data[:3]==b'\xff\xd8\xff' and data[-2:]==b'\xff\xd9':
   ext='jpg'

  if not ext:
   return self.send(415,'Only valid PNG/JPG accepted')

  try:
   from PIL import Image
   from io import BytesIO
   im=Image.open(BytesIO(data))
   im.verify()
   if im.format not in ('PNG','JPEG'):
    raise ValueError('format')
  except ImportError:
   pass
  except Exception:
   return self.send(415,'Image verification failed')

  target=ROOT/('mmtrade10x-logo.'+ext)
  tmp=ROOT/('.mm10-upload-'+str(os.getpid()))
  with open(tmp,'wb') as f:
   f.write(data)
   f.flush()
   os.fsync(f.fileno())
  os.chmod(tmp,0o644)
  os.replace(tmp,target)
  other=ROOT/('mmtrade10x-logo.'+
              ('jpg' if ext=='png' else 'png'))
  if other.exists(): other.unlink()
  self.send(200,'آپلود موفق بود. لوگو ذخیره شد.')
  self.server.done=True

srv=HTTPServer(('127.0.0.1',18765),Handler)
srv.timeout=2
srv.done=False
while time.time()<DEADLINE and not srv.done:
 srv.handle_request()
srv.server_close()
