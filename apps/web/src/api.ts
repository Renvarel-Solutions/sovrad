import type {Project, Workflow, Proposal} from '@renvarel/architect-core';

async function request<T>(path:string, options?:RequestInit):Promise<T> {
  const response=await fetch('/api'+path,options);
  const data:unknown=await response.json();
  if(!response.ok) {
    const message=typeof data==='object'&&data!==null&&'error' in data?String(data.error):`Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}
const postOptions=(body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json','X-Sovrad-Action':'1'},body:JSON.stringify(body)});
export const api={
  health:()=>request<{ok:boolean;mode:string;aiConfigured:boolean}>('/health'),
  projects:()=>request<{projects:Project[]}>('/projects'),
  workflows:(id:string)=>request<{workflows:Workflow[]}>(`/projects/${encodeURIComponent(id)}/workflows`),
  workflow:(id:string)=>request<{workflow:Workflow;proposals:Proposal[]}>(`/workflows/${encodeURIComponent(id)}`),
  manualProposal:(body:{workflowId:string;stepId:string;baseRevision:number;text:string;proposedRules:string[];explanation:string})=>request<{proposal:Proposal}>('/proposals',postOptions(body)),
  aiProposal:(body:{workflowId:string;stepId:string;baseRevision:number;text:string;sendToAI:true})=>request<{proposal:Proposal}>('/ai/proposal',postOptions(body)),
  decide:(id:string,action:'approve'|'reject')=>request<{proposal:Proposal;workflow:Workflow}>(`/proposals/${encodeURIComponent(id)}/decision`,postOptions({action}))
};
