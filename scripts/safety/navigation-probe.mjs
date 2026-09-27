// Actual Windows WebView2 test, isolated diagnostic binary only. No capture calls.
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const binary=resolve(process.argv[2]??'artifacts/safety/windows/vsualize.exe');
const out=resolve('artifacts/safety/navigation-'+Date.now());await mkdir(out,{recursive:true});
let finish;const result=new Promise(r=>finish=r);
const html=`<!doctype html><meta charset="utf-8"><style>html{background:black;color:#999}</style><p>Vsualize native origin test — no visuals or audio.</p><script>
(async()=>{const results=[];for(const [cmd,args]of [['session_status',{}],['session_control',{action:'start',minutes:30,revision:99999,epoch:0}],['window_action',{action:'not-a-real-action'}]]){
try{if(!window.__TAURI__?.core?.invoke)throw Error('Bridge unavailable');await window.__TAURI__.core.invoke(cmd,args);results.push({cmd,allowed:true});}
catch(error){results.push({cmd,allowed:false,error:String(error)});}}
await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({results,bridge:!!window.__TAURI__?.core?.invoke,userAgent:navigator.userAgent})});})();
</script>`;
const server=createServer(async(req,res)=>{
 if(req.url==='/probe'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(req.url==='/result'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>16000){res.writeHead(413).end();return;}}try{finish(JSON.parse(body));res.end('received');}catch{res.writeHead(400).end();}return;}
 res.writeHead(404).end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const child=spawn(binary,[],{windowsHide:true,stdio:'ignore',env:{...process.env,VSUALIZE_NAVIGATION_TEST_URL:`http://127.0.0.1:${server.address().port}/probe`,VSUALIZE_SAFETY_LOG:resolve(out,'native.jsonl')}});
let timer;
try{
 const response=await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native navigation probe timed out')),45000);child.once('error',reject);child.once('exit',()=>reject(Error('Test app exited before returning evidence')));})]);
 // Framework-level rejection is stronger evidence than missing bridge or an app-level validation error.
 response.passed=response.bridge&&response.results.length===3&&response.results.every(r=>!r.allowed&&/not allowed by ACL/i.test(r.error));
 response.scope='Live loopback HTTP origin in main WebView2; production has no remote capabilities. Other remote schemes and navigation variants are not exhaustively covered.';
 await writeFile(resolve(out,'result.json'),JSON.stringify(response,null,2));console.log(JSON.stringify(response,null,2));
 if(!response.passed)process.exitCode=1;
}finally{clearTimeout(timer);child.kill();await new Promise(r=>server.close(r));}
