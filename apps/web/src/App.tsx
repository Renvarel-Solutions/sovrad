import {useCallback,useEffect,useMemo,useState} from 'react';
import {ReactFlow,Background,Controls,MiniMap,Handle,Position,type NodeProps,type Node,MarkerType} from '@xyflow/react';
import {Activity,ArrowRight,BrainCircuit,Check,ChevronDown,Clock3,Code2,FolderGit2,GitBranch,GitPullRequest,Info,LockKeyhole,MessageSquarePlus,PanelLeftClose,RotateCcw,ShieldCheck,X} from 'lucide-react';
import type {Project,Proposal,Step,Workflow} from '@renvarel/architect-core';
import {api} from './api';
import {AIStatus} from './AIStatus';

type FlowData=Record<string,unknown>&{title:string;purpose:string;kind:Step['kind'];selected:boolean};
function WorkflowNode({data}:NodeProps<Node<FlowData>>) {
  const d=data;
  return <div className={`step-node ${d.selected?'step-node-active':''}`}>
    <Handle type="target" position={Position.Left} isConnectable={false}/>
    <div className="node-kicker">{d.kind==='decision'?'DECISION':d.kind.toUpperCase()}</div>
    <div className="node-title">{d.title}</div>
    <div className="node-description">{d.purpose}</div>
    <Handle type="source" position={Position.Right} isConnectable={false}/>
  </div>;
}
const nodeTypes={workflow:WorkflowNode};
function time(iso:string){return new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
export default function App(){
  const [projects,setProjects]=useState<Project[]>([]);
  const [projectId,setProjectId]=useState('sample-calculator');
  const [workflowId,setWorkflowId]=useState('sample-calculator-arithmetic');
  const [workflow,setWorkflow]=useState<Workflow|null>(null);
  const [proposals,setProposals]=useState<Proposal[]>([]);
  const [selectedStep,setSelectedStep]=useState('number-a');
  const [message,setMessage]=useState('');
  const [rules,setRules]=useState('');
  const [explanation,setExplanation]=useState('');
  const [consent,setConsent]=useState(false);
  const [aiAvailable,setAiAvailable]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [tab,setTab]=useState<'rules'|'changes'>('rules');
  const [sidebar,setSidebar]=useState(true);
  const refresh=useCallback(async(id:string)=>{const result=await api.workflow(id);setWorkflow(result.workflow);setProposals(result.proposals);},[]);
  useEffect(()=>{void Promise.all([api.projects(),api.health()]).then(([p,h])=>{setProjects(p.projects);setAiAvailable(h.aiConfigured);}).catch(e=>setError(String(e)));},[]);
  useEffect(()=>{void refresh(workflowId).catch(e=>setError(String(e)));},[workflowId,refresh]);
  useEffect(()=>{if(!workflow)return;const step=workflow.steps.find(s=>s.id===selectedStep)||workflow.steps[0];if(step){setSelectedStep(step.id);setRules(step.rules.join('\n'));}},[workflow,selectedStep]);
  useEffect(()=>{setConsent(false);setMessage('');setExplanation('');},[workflowId,selectedStep,workflow?.revision]);
  const chosen=workflow?.steps.find(s=>s.id===selectedStep)||null;
  const nodes=useMemo<Node<FlowData>[]>(()=>workflow?.steps.map(s=>({id:s.id,type:'workflow',position:s.position,data:{title:s.title,purpose:s.purpose,kind:s.kind,selected:s.id===selectedStep}}))||[],[workflow,selectedStep]);
  const edges=useMemo(()=>workflow?.connections.map(e=>({...e,animated:false,style:{stroke:'#64748b',strokeWidth:1.8},markerEnd:{type:MarkerType.ArrowClosed,color:'#64748b'},label:e.label}))||[],[workflow]);
  const currentProposals=useMemo(()=>proposals.filter(p=>p.stepId===selectedStep),[proposals,selectedStep]);
  const chosenProject=projects.find(p=>p.id===projectId);
  const submit=async(useAI:boolean)=>{
    if(!workflow||!chosen||!message.trim())return;
    setBusy(true);setError('');setNotice('');
    try {
      if(useAI){
        if(!consent) throw new Error('Explicit permission to send this selected step to OpenAI is required.');
        await api.aiProposal({workflowId:workflow.id,stepId:chosen.id,baseRevision:workflow.revision,text:message,sendToAI:true});
      }else{
        const proposedRules=rules.split('\n').map(x=>x.trim()).filter(Boolean);
        await api.manualProposal({workflowId:workflow.id,stepId:chosen.id,baseRevision:workflow.revision,text:message,proposedRules,explanation:explanation.trim()||'Prepared manually for approval'});
      }
      setNotice(useAI?'AI has drafted a proposal; nothing was approved.':'Proposal saved; nothing was approved.');
      setTab('changes');setMessage('');setExplanation('');setConsent(false);
      await refresh(workflow.id);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const decide=async(id:string,action:'approve'|'reject')=>{
    if(!workflow)return;setBusy(true);setError('');setNotice('');
    try{await api.decide(id,action);await refresh(workflow.id);setNotice(action==='approve'?'Approved requirement saved as a new immutable revision. No code changes were made.':'Proposal rejected. Workflow was not changed.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-logo">S<span>V</span></div>
      <button className="icon-button" onClick={()=>setSidebar(!sidebar)} title="Toggle projects sidebar" aria-label="Toggle projects sidebar"><PanelLeftClose size={17}/></button>
      <div className="brand-copy"><b>Sovrad</b><span>by Renvarel</span></div>
      <div className="topbar-spacer"/>
      <span className="small-status"><span className="status-dot"/> Local workspace</span>
      <span className="topbar-separator"/>
      <span className="privacy-pill"><LockKeyhole size={13}/> Private project data</span>
    </header>
    <div className="workspace">
      {sidebar&&<aside className="sidebar">
        <div className="sidebar-heading"><span>WORKSPACES</span><span className="tiny-count">{projects.length}</span></div>
        <div className="project-list">
          {projects.map(p=><button key={p.id} onClick={async()=>{
            setProjectId(p.id);setError('');setNotice('');
            const result=await api.workflows(p.id);if(result.workflows[0]){setWorkflowId(result.workflows[0].id);setSelectedStep(result.workflows[0].steps[0]?.id||'');}
          }} className={`project-button ${projectId===p.id?'active':''}`}><FolderGit2 size={17}/><span>{p.name}</span></button>)}
        </div>
        <div className="sidebar-heading sidebar-secondary">WORKFLOWS</div>
        {workflow&&<button className="workflow-button"><GitBranch size={16}/><span>{workflow.name}</span><ChevronDown size={14}/></button>}
        <div className="sidebar-spacer"/>
        <div className="sidebar-foot"><ShieldCheck size={16}/><div><b>Private by default</b><span>Real project connections disabled during this pilot.</span></div></div>
      </aside>}
      <main className="main">
        <div className="canvas-head">
          <div className="crumb"><span>Projects</span><ArrowRight size={12}/><span>{chosenProject?.name||'Loading...'}</span><ArrowRight size={12}/><strong>{workflow?.name||'Workflow'}</strong></div>
          <div className="title-row"><div><h1>{workflow?.name||'Loading workflow...'}</h1><p>{workflow?.description||'Connecting to local workspace...'}</p></div><div className="rev-pill"><Clock3 size={15}/> Revision {workflow?.revision||'—'}</div></div>
          <div className="canvas-toolbar"><span><Activity size={14}/> WORKFLOW CANVAS</span><div><span className="subtle-info">Click any step to review its rules</span></div></div>
        </div>
        <div className="flow-frame">
          {workflow&&<ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_e,n)=>{setSelectedStep(n.id);setTab('rules');setMessage('');setNotice('');setError('');}}
            nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} fitView fitViewOptions={{padding:0.25}}
            proOptions={{hideAttribution:false}} minZoom={0.25} maxZoom={2} colorMode="dark">
            <Background color="#2e3749" size={2} gap={22}/><Controls showInteractive={false}/><MiniMap nodeColor="#1c2636" maskColor="rgba(7,11,17,.76)" zoomable pannable/>
          </ReactFlow>}
          {!workflow&&<div className="loading-view">Loading your workspace…</div>}
          <div className="canvas-footer"><Info size={13}/> Demo workflow uses fictional data. External repositories are not connected.</div>
        </div>
      </main>
      <aside className="inspector">
        <div className="inspector-head"><div><span className="inspector-overline">INSPECTOR</span><h2>{chosen?.title||'Select a step'}</h2><p>{chosen?.purpose||'Choose a node in the workflow'}</p></div><div className="inspector-icon"><MessageSquarePlus size={19}/></div></div>
        <div className="inspector-tabs"><button className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}>Rules & conditions</button><button className={tab==='changes'?'active':''} onClick={()=>setTab('changes')}>Proposals <span>{currentProposals.length}</span></button></div>
        <div className="inspector-body">
          {notice&&<div className="notice" role="status"><Check size={16}/>{notice}<button title="Dismiss" onClick={()=>setNotice('')}><X size={13}/></button></div>}
          {error&&<div className="error" role="alert">{error}<button title="Dismiss" onClick={()=>setError('')}><X size={13}/></button></div>}
          {tab==='rules'?<>
            <div className="section-kicker">CURRENT WORKFLOW RULES</div><div className="rules-list">
            {chosen?.rules.map((rule,index)=><div key={index} className="rule-item"><div className="rule-number">{String(index+1).padStart(2,'0')}</div><span>{rule}</span></div>)}
            </div><div className="exception"><span>EXCEPTION / ERROR HANDLING</span><p>{chosen?.errorBehavior}</p></div>
            <div className="divider"/>
            <div className="section-heading"><MessageSquarePlus size={16}/> Suggest a correction</div><p className="helper">Your suggestion applies only to <b>{chosen?.title||'this step'}</b>. It never changes code automatically.</p>
            <label htmlFor="change-request">What should change?</label><textarea id="change-request" rows={3} maxLength={2000} placeholder="Describe the correction or new idea in plain English..." value={message} onChange={e=>setMessage(e.target.value)}/>
            <label htmlFor="rules-edit">Proposed rules (one per line)</label><textarea id="rules-edit" rows={5} placeholder="One rule per line..." value={rules} onChange={e=>setRules(e.target.value)}/>
            <label htmlFor="explanation">Reason (optional)</label><input id="explanation" placeholder="Why is this change needed?" value={explanation} onChange={e=>setExplanation(e.target.value)}/>
            <button className="primary-button" disabled={busy||!message.trim()} onClick={()=>void submit(false)}><GitPullRequest size={16}/> Save proposal for review</button>
            <div className="ai-panel"><div className="ai-panel-heading"><BrainCircuit size={17}/> Optional OpenAI proposal</div>
              <AIStatus refreshToken={busy} onAvailable={setAiAvailable}/>
              <p>Send this step's title, purpose, current rules and your suggestion to the configured OpenAI API. No repository code is included.</p>
              <label className="consent-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>I approve sending these selected details to OpenAI.</span></label>
              <button className="secondary-button" disabled={busy||!message.trim()||!consent||!aiAvailable} onClick={()=>void submit(true)}><BrainCircuit size={15}/> Ask AI to draft rules</button>
              {!aiAvailable&&<p className="muted-tiny">AI is off until configured in the local backend.</p>}
            </div>
          </>:<>
            <div className="section-kicker">CHANGE HISTORY FOR THIS STEP</div>
            {currentProposals.length===0?<div className="empty-state"><GitPullRequest size={28}/><b>No proposals yet</b><p>Describe a correction in the Rules tab. Proposed changes will appear here for approval.</p><button className="secondary-button" onClick={()=>setTab('rules')}>Write a proposal</button></div>:currentProposals.map(p=><div className="proposal-card" key={p.id}>
              <div className="proposal-head"><span className={`status-tag ${p.status}`}>{p.status.toUpperCase()}</span><span>{time(p.createdAt)}</span></div>
              <p className="proposal-request">{p.text}</p><div className="proposal-meta">Based on revision {p.baseRevision} · {p.provenance==='manual'?'Manual suggestion':'AI-generated proposal'}</div>
              <p className="proposal-explanation">{p.explanation}</p><div className="proposed-rules-title">PROPOSED RULES</div>
              <ul>{p.proposedRules.map((r,i)=><li key={i}>{r}</li>)}</ul>
              {p.status==='draft'&&<div className="proposal-actions"><button className="secondary-button" disabled={busy} onClick={()=>void decide(p.id,'reject')}><X size={14}/> Reject</button><button className="primary-button" disabled={busy} onClick={()=>void decide(p.id,'approve')}><Check size={15}/> Approve</button></div>}
            </div>)}
            <div className="safety-note"><Code2 size={16}/> Codex execution is deliberately not enabled in this starter. Approvals only update the local specification.</div>
          </>}
        </div>
      </aside>
    </div>
  </div>;
}
