import {spawn} from 'node:child_process';
import {mkdirSync,readdirSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CODEX_VERSION} from './index.js';
import {createProtocol} from './protocol.js';

export async function probeAppServer(binary: string, home: string): Promise<{version:string;handshake:true;codingEnabled:false}> {
  if (!path.isAbsolute(binary)||!path.isAbsolute(home)) throw new Error('Explicit absolute probe paths required');
  mkdirSync(home,{recursive:true,mode:0o700});
  if (readdirSync(home).length) throw new Error('Probe requires an empty isolated configuration directory');
  home=realpathSync.native(home);
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR)$/i.test(key)));
  const child=spawn(binary,['app-server','--listen','stdio://','-c','analytics.enabled=false','-c','feedback.enabled=false'],{
    cwd:home,env:{...env,CODEX_HOME:home,HOME:home,USERPROFILE:home},stdio:['pipe','pipe','pipe'],windowsHide:true,
  });
  // Drain diagnostics without storing private paths, account data or raw provider output.
  child.stderr.resume();
  const client=createProtocol({input:child.stdin,output:child.stdout,close:()=>{child.kill();}});
  child.once('error',()=>client.close());
  try {
    const response=await client.call('initialize',{clientInfo:{name:'sovrad_preview',title:'Sovrad protocol probe',version:'0.1.0'},
      capabilities:{experimentalApi:true}});
    if (!response || typeof response!=='object' || !('userAgent' in response) || typeof response.userAgent!=='string' ||
      !response.userAgent.includes('/'+CODEX_VERSION) || !('codexHome' in response) || response.codexHome!==home) {
      throw new Error('Untested Codex version or configuration identity');
    }
    client.initialized();
    return {version:CODEX_VERSION,handshake:true,codingEnabled:false};
  } finally {client.close();}
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  void probeAppServer(process.argv[2],process.argv[3]).then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error('Isolated protocol probe failed; coding remains disabled.');process.exitCode=1;});
}
