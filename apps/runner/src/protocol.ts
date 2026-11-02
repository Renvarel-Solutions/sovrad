import type {Readable,Writable} from 'node:stream';
type Transport = {input: Writable; output: Readable; close: () => void};
type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout};

class Protocol {
  private nextId=1;
  private buffer='';
  private closed=false;
  private readonly pending=new Map<number,Pending>();
  constructor(private readonly transport: Transport) {
    transport.output.setEncoding('utf8').on('data',chunk=>this.read(chunk));
    transport.output.on('end',()=>this.close());
    transport.output.on('error',()=>this.close());
    transport.input.on('error',()=>this.close());
  }
  private send(message: unknown): void {
    if (!this.closed) this.transport.input.write(JSON.stringify(message)+'\n');
  }
  private read(chunk: string): void {
    this.buffer+=chunk;
    if (Buffer.byteLength(this.buffer)>1024*1024) {this.close();return;}
    while (this.buffer.includes('\n')&&!this.closed) {
      const end=this.buffer.indexOf('\n');
      const line=this.buffer.slice(0,end); this.buffer=this.buffer.slice(end+1);
      try {
        const message=JSON.parse(line);
        if (!message || typeof message!=='object' || Array.isArray(message)) throw new Error('Invalid frame');
        if (typeof message.method==='string') {
          if (typeof message.id==='string'||typeof message.id==='number') this.deny(message.id,message.method);
        } else if (typeof message.id==='number') {
          const pending=this.pending.get(message.id);
          if (!pending) throw new Error('Unexpected response');
          clearTimeout(pending.timer); this.pending.delete(message.id);
          if (message.error) pending.reject(new Error('Codex protocol request failed'));
          else pending.resolve(message.result);
        } else throw new Error('Invalid response');
      } catch {this.close();}
    }
  }
  private deny(id: string|number, method: string): void {
    if (['item/commandExecution/requestApproval','item/fileChange/requestApproval'].includes(method)) {
      this.send({id,result:{decision:'decline'}});
    } else if (method==='item/permissions/requestApproval') {
      this.send({id,result:{permissions:{},scope:'turn'}});
    } else this.send({id,error:{code:-32601,message:'Unsupported request; no permission granted'}});
  }
  async call(method: string, params: unknown): Promise<unknown> {
    if (!['initialize','permissionProfile/list'].includes(method)) throw new Error('Coding methods are disabled');
    if (this.closed) throw new Error('Codex protocol closed');
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.close(),5000);
      this.pending.set(id,{resolve,reject,timer});
      this.send({id,method,params});
    });
  }
  initialized(): void {this.send({method:'initialized',params:{}});}
  close(): void {
    if (this.closed) return;
    this.closed=true;
    for (const pending of this.pending.values()) {clearTimeout(pending.timer);pending.reject(new Error('Codex protocol closed'));}
    this.pending.clear(); this.transport.close();
  }
}
export function createProtocol(transport: Transport): Protocol {return new Protocol(transport);}
