import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export function inspect(rows) {
 const failures=[],observations=[];let previous=null,lastAudio=null,stoppedAudio=null,phase='unknown',stopAt=0;
 for(const row of rows){
  if(row.event==='frontend'){
   const s=row.data;
   if(previous&&s.phase!=='running'&&previous.data.phase===s.phase){
    for(const field of ['draws','compiles','audioTicks'])if(s[field]!==previous.data[field])failures.push({at:row.unixMs,problem:`${field} advanced while ${s.phase}`});
   }
   previous=row;
  }
  if(['session-control','native-stop'].includes(row.event)){
   if(row.data.phase==='running')previous=null;
   phase=row.data.phase;stopAt=row.unixMs;stoppedAudio=null;
   observations.push({at:row.unixMs,...row.data});
  }
  if(row.event==='capture-stream-start'&&phase!=='running')failures.push({at:row.unixMs,problem:'Native capture stream started without a running lease'});
  if(row.event==='audio-counters'){
   lastAudio=row.data;
   if(phase!=='running'&&phase!=='unknown'&&row.unixMs-stopAt>1000){
    if(stoppedAudio&&(lastAudio.packets!==stoppedAudio.packets||lastAudio.analyses!==stoppedAudio.analyses))failures.push({at:row.unixMs,problem:'Native packets/analysis continued after stopped/suspended grace period'});
    stoppedAudio=lastAudio;
   }
  }
 }
 return {failures,observations,frontendSamples:rows.filter(r=>r.event==='frontend').length,nativeSamples:rows.filter(r=>r.event==='audio-counters').length,limitation:'Checks observed counters only. Missing/throttled frontend samples, user-observed black frames, actual sleep/lock and external GPU telemetry require the acceptance record. Zero violations alone is not a completed test.'};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'))){
 const file=process.argv[2];if(!file)throw Error('Pass native.jsonl');
 const rows=(await readFile(file,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
 const result=inspect(rows);await writeFile(file+'.assessment.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));if(result.failures.length)process.exitCode=1;
}
