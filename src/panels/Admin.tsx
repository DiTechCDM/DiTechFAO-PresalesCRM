import React, { useState } from 'react';
import { useAppContext } from '../store';
import { uid } from '../lib/utils';
import { User, FinancialYear } from '../types';

type Section = 'users'|'roles'|'fy'|'kpi'|'fields'|'dropdowns'|'reps'|'audit';

const PERM_KEYS = ['export','delete','addFirm','editFirm','viewAll','logCall','bulkOps','viewReports'] as const;
const PERM_LABELS: Record<string,{l:string;d:string}> = {
  export:{l:'Export data',d:'Download Excel/CSV'},delete:{l:'Delete records',d:'Delete firms permanently'},
  addFirm:{l:'Add firms',d:'Add new firms to database'},editFirm:{l:'Edit firms',d:'Edit existing firm records'},
  viewAll:{l:'View all firms',d:"See all reps' data not just own"},logCall:{l:'Log calls',d:'Log call outcomes'},
  bulkOps:{l:'Bulk operations',d:'Bulk assign/stage/delete'},viewReports:{l:'View reports',d:'Access KPI dashboards'},
};

export default function Admin() {
  const { admin, setAdmin, currentUser, showToast } = useAppContext();
  const [section, setSection] = useState<Section>('users');
  const [userModal, setUserModal] = useState<{mode:'add'|'edit';user?:User}|null>(null);
  const [userForm, setUserForm] = useState<Partial<User&{password:string}>>({});
  const [kpiEditFY, setKpiEditFY] = useState(admin.active_fy);
  const [confirmCb, setConfirmCb] = useState<{title:string;body:string;ok:string;cls?:string;cb:()=>void}|null>(null);

  const openAddUser = () => { setUserForm({role:'rep',status:'active',perms:admin.rolePerms?.rep||{}}); setUserModal({mode:'add'}); };
  const openEditUser = (u:User) => { setUserForm({...u}); setUserModal({mode:'edit',user:u}); };
  const saveUser = () => {
    if (!userForm.name?.trim()||!userForm.email?.trim()) { showToast('Name and email required','err'); return; }
    const newAdmin = {...admin};
    if (userModal?.mode==='edit' && userModal.user) {
      newAdmin.users = newAdmin.users.map(u=>u.id===userModal.user!.id?{...u,...userForm as User}:u);
      showToast('User saved','ok');
    } else {
      newAdmin.users = [...newAdmin.users,{id:uid(),name:userForm.name!,email:userForm.email!,password:userForm.password||'changeme',role:userForm.role||'rep',status:'active',linkedRep:userForm.linkedRep||'',perms:userForm.perms||admin.rolePerms?.rep||{}} as User];
      showToast('User added','ok');
    }
    setAdmin(newAdmin); setUserModal(null);
  };

  const navItems: {id:Section;ico:string;label:string}[] = [
    {id:'users',ico:'👤',label:'Users'},{id:'roles',ico:'🔑',label:'Roles & permissions'},
    {id:'fy',ico:'📅',label:'Financial years'},{id:'kpi',ico:'📊',label:'KPI targets'},
    {id:'fields',ico:'🗂',label:'Field manager'},{id:'dropdowns',ico:'▾',label:'Dropdown options'},
    {id:'reps',ico:'👥',label:'Rep config'},{id:'audit',ico:'📋',label:'Audit log'},
  ];

  const renderKpiRow = (label:string,desc:string,key:string,unit:string,fyId:string) => {
    const fy = admin.financial_years?.find(f=>f.id===fyId) as FinancialYear|undefined;
    const isLocked = fy?.locked;
    const val = (fy?.kpi as any)?.[key] ?? (admin.kpi as any)[key] ?? 0;
    return (
      <div key={key} className="kpi-row">
        <div><div className="kpi-label">{label}</div><div className="kpi-desc">{desc}</div></div>
        <input className="kpi-input" id={`kpi-${key}`} type="number" defaultValue={val} disabled={isLocked} style={isLocked?{opacity:.5,cursor:'not-allowed'}:{}} />
        <div className="kpi-unit">{unit}</div>
      </div>
    );
  };

  const saveKPI = (fyId:string) => {
    const fy = admin.financial_years?.find(f=>f.id===fyId) as FinancialYear|undefined;
    if (fy?.locked) { showToast('This FY is locked','err'); return; }
    const keys = ['calls_day','li_day','mine_day','meetings_month','leads_month','qual_rate','engage_rate','close_rate','q1_leads','q2_leads','q3_leads','q4_leads','rev_fte','rev_payg'];
    const updated:any = {};
    keys.forEach(k => { const el=document.getElementById(`kpi-${k}`) as HTMLInputElement; if(el) updated[k]=parseInt(el.value)||(admin.kpi as any)[k]; });
    const newAdmin = {...admin};
    if (fy) (fy as any).kpi = {...(fy as any).kpi,...updated};
    if (fyId === admin.active_fy) newAdmin.kpi = {...newAdmin.kpi,...updated};
    setAdmin(newAdmin); showToast('KPI targets saved','ok');
  };

  const createFY = () => {
    const last = admin.financial_years?.slice(-1)[0] as FinancialYear|undefined;
    const yr = (last?.start_year||2026)+1;
    const id = `fy${yr}-${String(yr+1).slice(2)}`;
    const label = `FY ${yr}-${String(yr+1).slice(2)}`;
    if (admin.financial_years?.find(f=>f.id===id)) { showToast(`${label} already exists`,'err'); return; }
    const newKpi = last?.kpi ? {...last.kpi} : {...admin.kpi};
    const newFY: FinancialYear = {id, label, start_year:yr, status:'draft', locked:false, kpi:newKpi};
    const newAdmin = {...admin, financial_years:[...(admin.financial_years||[]), newFY]};
    setAdmin(newAdmin); showToast(`${label} created`,'ok');
  };

  const setActiveFY = (fyId:string) => {
    const fy = admin.financial_years?.find(f=>f.id===fyId) as FinancialYear|undefined; if(!fy) return;
    const newAdmin = {...admin, active_fy:fyId, kpi:{...admin.kpi,...fy.kpi}};
    newAdmin.financial_years = (newAdmin.financial_years||[]).map(f=>({...f, status:f.id===fyId?'active':'closed'}));
    setAdmin(newAdmin); showToast(`Active FY → ${fy.label}`,'ok');
  };

  const saveRolePerms = (role:string) => {
    const perms:any = {};
    PERM_KEYS.forEach(k=>{ const el=document.getElementById(`rp-${role}-${k}`) as HTMLInputElement; if(el) perms[k]=el.checked; });
    const newAdmin = {...admin, rolePerms:{...admin.rolePerms,[role]:perms}};
    setAdmin(newAdmin); showToast(`${role} permissions saved`,'ok');
  };

  const addDD = (key:string) => {
    const el=document.getElementById(`dd-new-${key}`) as HTMLInputElement; if(!el?.value.trim()) return;
    const newAdmin = {...admin, dropdowns:{...admin.dropdowns,[key]:[...(admin.dropdowns?.[key]||[]),el.value.trim()]}};
    setAdmin(newAdmin); el.value=''; showToast('Option added','ok');
  };

  const removeDD = (key:string, i:number) => {
    const opts=[...(admin.dropdowns?.[key]||[])]; opts.splice(i,1);
    setAdmin({...admin,dropdowns:{...admin.dropdowns,[key]:opts}});
  };

  return (
    <div>
      <div className="page-hd"><div><div className="page-title">Admin</div><div className="page-sub">Users, permissions, KPI targets, financial years</div></div></div>
      <div className="two">
        {/* Left nav */}
        <div style={{minWidth:0}}>
          <div style={{display:'flex',flexDirection:'column',gap:4,background:'#fff',border:'.5px solid var(--border)',borderRadius:'var(--rl2)',overflow:'hidden',marginBottom:12}}>
            {navItems.map(n=>(
              <button key={n.id} className={`slink ${section===n.id?'on':''}`} onClick={()=>setSection(n.id)} style={{borderLeftWidth:3}}>
                <span className="ico">{n.ico}</span>{n.label}
                {n.id==='users'&&<span className="badge" style={{marginLeft:'auto'}}>{admin.users.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div style={{minWidth:0}}>

          {/* USERS */}
          {section==='users' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><div className="card-title">User management</div><button className="btn primary sm" onClick={openAddUser}>+ Add user</button></div>
              <div className="tw"><div className="tscroll" style={{maxHeight:500}}><table>
                <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Export</th><th>Delete</th><th>View all</th><th>Actions</th></tr></thead>
                <tbody>{admin.users.map((u,i)=>{
                  const col=['#1D9E75','#378ADD','#7F77DD','#D85A30','#EF9F27'][i%5];
                  const isYou=u.id===currentUser?.id;
                  return <tr key={u.id}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:28,height:28,borderRadius:'50%',background:`${col}22`,color:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{u.name.substring(0,2).toUpperCase()}</div><div><div style={{fontWeight:500}}>{u.name}{isYou?' (you)':''}</div><div style={{fontSize:11,color:'var(--t2)'}}>{u.linkedRep||''}</div></div></div></td>
                    <td style={{fontSize:12,color:'var(--blue)'}}>{u.email}</td>
                    <td><span className={`badge b-${u.role}`}>{u.role}</span></td>
                    <td><span className={`badge ${u.status==='active'?'b-active':'b-inactive'}`}>{u.status}</span></td>
                    <td><span style={{fontSize:11,padding:'2px 7px',borderRadius:5,background:u.perms.export?'var(--gl)':'var(--rl)',color:u.perms.export?'#0F6E56':'var(--red)',fontWeight:500}}>{u.perms.export?'Yes':'No'}</span></td>
                    <td><span style={{fontSize:11,padding:'2px 7px',borderRadius:5,background:u.perms.delete?'var(--gl)':'var(--rl)',color:u.perms.delete?'#0F6E56':'var(--red)',fontWeight:500}}>{u.perms.delete?'Yes':'No'}</span></td>
                    <td><span style={{fontSize:11,padding:'2px 7px',borderRadius:5,background:u.perms.viewAll?'var(--gl)':'var(--rl)',color:u.perms.viewAll?'#0F6E56':'var(--red)',fontWeight:500}}>{u.perms.viewAll?'All':'Own only'}</span></td>
                    <td>{!isYou?<div style={{display:'flex',gap:4}}>
                      <button className="btn xs ghost" onClick={()=>openEditUser(u)}>Edit</button>
                      <button className="btn xs" style={{borderColor:'#EF9F27',color:'#854F0B'}} onClick={()=>{const na={...admin,users:admin.users.map(x=>x.id===u.id?{...x,status:x.status==='active'?'inactive':'active' as any}:x)};setAdmin(na);showToast(`${u.name} ${na.users.find(x=>x.id===u.id)?.status}`,'ok');}}>
                        {u.status==='active'?'Suspend':'Activate'}
                      </button>
                      <button className="btn xs danger" onClick={()=>setConfirmCb({title:'Remove user',body:`Remove <strong>${u.name}</strong>?`,ok:'Remove',cls:'danger',cb:()=>{setAdmin({...admin,users:admin.users.filter(x=>x.id!==u.id)});showToast('User removed','err');}})}>Remove</button>
                    </div>:<span style={{fontSize:11,color:'var(--t3)'}}>Protected</span>}</td>
                  </tr>;
                })}</tbody>
              </table></div></div>
              <div className="alert info" style={{marginTop:10,fontSize:12}}>Reps see only their assigned firms and calls. Managers and admins see all.</div>
            </div>
          )}

          {/* ROLES */}
          {section==='roles' && (
            <div>{['rep','manager','admin'].map(role=>{
              const descs:any={rep:'Reps see only their assigned firms, can add firms and log calls.',manager:'Managers see all firms, can bulk-operate and export.',admin:'Full unrestricted access to all features.'};
              return <div key={role} style={{marginBottom:14,background:'#fff',border:'.5px solid var(--border)',borderRadius:'var(--rl2)',overflow:'hidden'}}>
                <div style={{background:'var(--brand-light)',padding:'10px 14px',fontSize:13,fontWeight:600,color:'var(--brand)'}}>{role.charAt(0).toUpperCase()+role.slice(1)} <span style={{fontSize:11,fontWeight:400,color:'var(--t2)'}}>— {descs[role]}</span></div>
                {PERM_KEYS.map(k=><div key={k} className="perm-row"><div><div style={{fontSize:13,fontWeight:500}}>{PERM_LABELS[k].l}</div><div style={{fontSize:11,color:'var(--t2)'}}>{PERM_LABELS[k].d}</div></div><label className="toggle"><input type="checkbox" id={`rp-${role}-${k}`} defaultChecked={!!(admin.rolePerms?.[role] as any)?.[k]} disabled={role==='admin'} /><span className="tslider"></span></label></div>)}
                <div style={{padding:'10px 14px',textAlign:'right',borderTop:'.5px solid var(--border)'}}><button className="btn primary sm" onClick={()=>saveRolePerms(role)}>Save {role} permissions</button></div>
              </div>;
            })}</div>
          )}

          {/* FINANCIAL YEARS */}
          {section==='fy' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}><div className="card-title">Financial years</div><button className="btn primary sm" onClick={createFY}>+ New financial year</button></div>
              {(admin.financial_years||[]).map((fy:any)=>(
                <div key={fy.id} className={`fy-card ${fy.id===admin.active_fy?'active-fy':''}`}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
                    <div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--brand)'}}>{fy.label} {fy.id===admin.active_fy&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:8,background:'var(--gl)',color:'var(--gd)',fontWeight:500}}>Active</span>} {fy.locked&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:8,background:'var(--al)',color:'var(--amber)',fontWeight:500}}>🔒 Locked</span>}</div>
                      <div style={{fontSize:12,color:'var(--t2)',marginTop:2}}>Apr {fy.start_year} – Mar {fy.start_year+1}</div>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      {fy.id!==admin.active_fy&&<button className="btn sm primary" onClick={()=>setActiveFY(fy.id)}>Set active</button>}
                      <button className="btn sm ghost" onClick={()=>{setKpiEditFY(fy.id);setSection('kpi');}}>Edit targets</button>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                    {['Q1','Q2','Q3','Q4'].map((q,i)=><div key={q} style={{background:'var(--brand-light)',borderRadius:'var(--r)',padding:'7px 9px',fontSize:12}}><div style={{fontSize:10,color:'var(--brand)',fontWeight:600,textTransform:'uppercase'}}>{q}</div><div style={{fontWeight:600,color:'var(--brand)'}}>{[fy.kpi?.q1_leads,fy.kpi?.q2_leads,fy.kpi?.q3_leads,fy.kpi?.q4_leads][i]||240}</div><div style={{fontSize:10,color:'var(--t2)'}}>leads</div></div>)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KPI */}
          {section==='kpi' && (
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
                <div className="card-title">KPI targets for:</div>
                <select value={kpiEditFY} onChange={e=>setKpiEditFY(e.target.value)} style={{padding:'5px 9px',border:'.5px solid var(--border2)',borderRadius:'var(--r)',fontSize:12,background:'#fff',outline:'none',fontWeight:500}}>
                  {(admin.financial_years||[]).map((f:any)=><option key={f.id} value={f.id}>{f.label}{f.id===admin.active_fy?' (active)':''}</option>)}
                </select>
              </div>
              {(admin.financial_years?.find(f=>f.id===kpiEditFY) as any)?.locked && <div className="alert warn" style={{marginBottom:10}}>🔒 This FY is locked — targets are read-only.</div>}
              <div className="two" style={{gap:10}}>
                <div>
                  <div className="card"><div className="card-title" style={{marginBottom:10}}>Daily activity targets</div>
                    {renderKpiRow('Calls per day','Cold calls + follow-ups combined','calls_day','calls/rep',kpiEditFY)}
                    {renderKpiRow('LinkedIn messages','Outreach messages sent','li_day','msgs/rep',kpiEditFY)}
                    {renderKpiRow('Records mined','New firms added to database','mine_day','records/rep',kpiEditFY)}
                  </div>
                  <div className="card"><div className="card-title" style={{marginBottom:10}}>Monthly targets</div>
                    {renderKpiRow('Meetings set','Confirmed meetings booked','meetings_month','mtgs/rep',kpiEditFY)}
                    {renderKpiRow('Leads generated','New leads per rep','leads_month','leads/rep',kpiEditFY)}
                  </div>
                </div>
                <div>
                  <div className="card"><div className="card-title" style={{marginBottom:10}}>Funnel conversion targets</div>
                    {renderKpiRow('Qualification rate','Leads → Suspects','qual_rate','%',kpiEditFY)}
                    {renderKpiRow('Engagement rate','Suspects → Proposals','engage_rate','%',kpiEditFY)}
                    {renderKpiRow('Close rate','Proposals → Wins','close_rate','%',kpiEditFY)}
                    <div style={{padding:'8px 0',borderTop:'.5px solid var(--border)',marginTop:4}}>
                      <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--brand)',marginBottom:8}}>Quarterly lead targets</div>
                      {renderKpiRow('Q1 (Apr–Jun)','April, May, June total','q1_leads','leads',kpiEditFY)}
                      {renderKpiRow('Q2 (Jul–Sep)','July, August, September','q2_leads','leads',kpiEditFY)}
                      {renderKpiRow('Q3 (Oct–Dec)','October, November, December','q3_leads','leads',kpiEditFY)}
                      {renderKpiRow('Q4 (Jan–Mar)','January, February, March','q4_leads','leads',kpiEditFY)}
                    </div>
                  </div>
                  <div className="card"><div className="card-title" style={{marginBottom:10}}>Ticket values</div>
                    <div className="alert info" style={{marginBottom:10,fontSize:12}}>💡 These are default suggestions. Each win record has its own editable amount.</div>
                    {renderKpiRow('FTE default value','Monthly FTE suggested ticket','rev_fte','£/win',kpiEditFY)}
                    {renderKpiRow('PAYG default value','PAYG bundle suggested ticket','rev_payg','£/win',kpiEditFY)}
                  </div>
                </div>
              </div>
              {!(admin.financial_years?.find(f=>f.id===kpiEditFY) as any)?.locked && <div style={{textAlign:'right',marginTop:8}}><button className="btn primary" onClick={()=>saveKPI(kpiEditFY)}>Save targets</button></div>}
            </div>
          )}

          {/* DROPDOWNS */}
          {section==='dropdowns' && (
            <div>{Object.entries({stage:'Stage',source:'Lead source',software:'Accounting software',assigned_to:'Assigned rep'}).map(([key,label])=>{
              const opts=(admin.dropdowns as any)?.[key]||[];
              return <div key={key} className="card" style={{marginBottom:10}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><div className="card-title">{label} <span style={{fontSize:11,fontWeight:400,color:'var(--t2)'}}>({opts.length} options)</span></div></div>
                {opts.map((o:string,i:number)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',border:'.5px solid var(--border)',borderRadius:6,marginBottom:4}}><span style={{flex:1,fontSize:13}}>{o}</span><button onClick={()=>removeDD(key,i)} style={{padding:'2px 7px',border:'.5px solid var(--border)',borderRadius:4,background:'none',cursor:'pointer',fontSize:11,color:'var(--t2)'}}>✕</button></div>)}
                <div style={{display:'flex',gap:6,marginTop:6}}><input id={`dd-new-${key}`} placeholder="Add option…" style={{flex:1,padding:'6px 9px',border:'.5px solid var(--border2)',borderRadius:'var(--r)',fontSize:13,outline:'none'}} onKeyDown={e=>{if(e.key==='Enter'){addDD(key);e.preventDefault();}}} /><button className="btn sm primary" onClick={()=>addDD(key)}>Add</button></div>
              </div>;
            })}</div>
          )}

          {/* REPS */}
          {section==='reps' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div>
                  <div className="card-title">Rep configuration</div>
                  <div style={{fontSize:11,color:'var(--t2)',marginTop:2}}>Set individual targets per rep — changes apply immediately to KPI dashboards</div>
                </div>
                <button className="btn primary sm" onClick={()=>{
                  const name = prompt('Rep name:');
                  if (!name?.trim()) return;
                  const colours = ['#1D9E75','#7F77DD','#378ADD','#EF9F27','#A32D2D','#185FA5','#854F0B'];
                  const col = colours[(admin.reps||[]).length % colours.length];
                  const init = name.trim().substring(0,2).toUpperCase();
                  const newRep = { id: 'r'+Date.now(), name: name.trim(), init, col, mtg: 20, calls: 50, mine: 25, li: 10, status: 'Active' };
                  const newAdmin = {...admin, reps: [...(admin.reps||[]), newRep], dropdowns: {...admin.dropdowns, assigned_to: [...(admin.dropdowns?.assigned_to||[]), name.trim()]} };
                  setAdmin(newAdmin);
                  showToast(`${name.trim()} added as rep`, 'ok');
                }}>+ Add rep</button>
              </div>

              {(admin.reps||[]).length === 0 && (
                <div className="alert info">No reps configured. Add one above.</div>
              )}

              {(admin.reps||[]).map((r, idx) => (
                <div key={r.id} style={{background:'#fff',border:'.5px solid var(--border)',borderRadius:'var(--rl2)',padding:'14px 16px',marginBottom:10}}>
                  {/* Rep header */}
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:`${r.col}22`,color:r.col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>
                      {r.init||r.name.substring(0,2).toUpperCase()}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:14}}>{r.name}</div>
                      <div style={{fontSize:11,color:'var(--t2)',marginTop:1}}>Linked to user · ID: {r.id}</div>
                    </div>
                    <span className={`badge ${r.status==='Active'?'b-active':'b-inactive'}`}>{r.status}</span>
                    <button
                      className={`btn xs ${r.status==='Active'?'':'ghost'}`}
                      style={{borderColor:'#EF9F27',color:'#854F0B'}}
                      onClick={()=>{
                        const updated = (admin.reps||[]).map((x,i)=>i===idx?{...x,status:x.status==='Active'?'Inactive':'Active'}:x);
                        setAdmin({...admin,reps:updated});
                        showToast(`${r.name} ${r.status==='Active'?'deactivated':'activated'}`, 'ok');
                      }}
                    >{r.status==='Active'?'Deactivate':'Activate'}</button>
                    <button
                      className="btn xs danger"
                      onClick={()=>{
                        if (!window.confirm(`Remove ${r.name}? This won't delete their call history.`)) return;
                        const updated = (admin.reps||[]).filter((_,i)=>i!==idx);
                        const ddUpdated = (admin.dropdowns?.assigned_to||[]).filter(n=>n!==r.name);
                        setAdmin({...admin, reps:updated, dropdowns:{...admin.dropdowns, assigned_to:ddUpdated}});
                        showToast(`${r.name} removed`, 'err');
                      }}
                    >Remove</button>
                  </div>

                  {/* Editable targets grid */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:10}}>
                    {/* Name */}
                    <div className="fg">
                      <label>Name</label>
                      <input
                        defaultValue={r.name}
                        onBlur={e=>{
                          const v=e.target.value.trim(); if(!v||v===r.name) return;
                          const updated=(admin.reps||[]).map((x,i)=>i===idx?{...x,name:v,init:v.substring(0,2).toUpperCase()}:x);
                          const ddUpdated=(admin.dropdowns?.assigned_to||[]).map(n=>n===r.name?v:n);
                          setAdmin({...admin,reps:updated,dropdowns:{...admin.dropdowns,assigned_to:ddUpdated}});
                          showToast('Name updated','ok');
                        }}
                      />
                    </div>

                    {/* Colour */}
                    <div className="fg">
                      <label>Colour</label>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <input
                          type="color"
                          defaultValue={r.col}
                          style={{width:36,height:34,padding:2,border:'.5px solid var(--border2)',borderRadius:'var(--r)',cursor:'pointer',background:'#fff'}}
                          onChange={e=>{
                            const updated=(admin.reps||[]).map((x,i)=>i===idx?{...x,col:e.target.value}:x);
                            setAdmin({...admin,reps:updated});
                          }}
                        />
                        <span style={{fontSize:12,color:'var(--t2)',fontFamily:'monospace'}}>{r.col}</span>
                      </div>
                    </div>

                    {/* Daily calls target */}
                    <div className="fg">
                      <label>Calls / day</label>
                      <input
                        type="number" min={1} max={200}
                        defaultValue={r.calls}
                        style={{textAlign:'center'}}
                        onBlur={e=>{
                          const v=parseInt(e.target.value)||50;
                          const updated=(admin.reps||[]).map((x,i)=>i===idx?{...x,calls:v}:x);
                          setAdmin({...admin,reps:updated});
                          showToast(`${r.name} calls target → ${v}/day`,'ok');
                        }}
                      />
                    </div>

                    {/* Monthly meetings target */}
                    <div className="fg">
                      <label>Meetings / month</label>
                      <input
                        type="number" min={1} max={100}
                        defaultValue={r.mtg}
                        style={{textAlign:'center'}}
                        onBlur={e=>{
                          const v=parseInt(e.target.value)||20;
                          const updated=(admin.reps||[]).map((x,i)=>i===idx?{...x,mtg:v}:x);
                          setAdmin({...admin,reps:updated});
                          showToast(`${r.name} meetings target → ${v}/month`,'ok');
                        }}
                      />
                    </div>

                    {/* LinkedIn per day */}
                    <div className="fg">
                      <label>LinkedIn / day</label>
                      <input
                        type="number" min={0} max={100}
                        defaultValue={r.li}
                        style={{textAlign:'center'}}
                        onBlur={e=>{
                          const v=parseInt(e.target.value)||10;
                          const updated=(admin.reps||[]).map((x,i)=>i===idx?{...x,li:v}:x);
                          setAdmin({...admin,reps:updated});
                          showToast(`${r.name} LinkedIn target → ${v}/day`,'ok');
                        }}
                      />
                    </div>
                  </div>

                  {/* Progress hint */}
                  <div style={{marginTop:10,padding:'7px 10px',background:'var(--brand-light)',borderRadius:'var(--r)',fontSize:11,color:'var(--brand)'}}>
                    💡 These targets apply to the Team KPIs leaderboard and Call Tracker progress bars for <strong>{r.name}</strong>
                  </div>
                </div>
              ))}

              <div className="alert info" style={{marginTop:4,fontSize:12}}>
                Changes save automatically on blur. Rep names sync with the "Assigned rep" dropdown in Firms DB.
              </div>
            </div>
          )}

          {/* FIELDS */}
          {section==='fields' && (
            <div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}><div className="card-title">Field manager</div></div>
              <div className="alert info" style={{marginBottom:10,fontSize:12}}>System fields are shown below. Custom field builder coming soon.</div>
              {['Firm name','City','Region','Size','Staff count','Companies House','Website','Contact name','Job title','Direct phone','Email','Switchboard','Software','Source','Stage','Assigned rep','Win amount (£)','Last contact','Follow-up','Notes'].map(f=><div key={f} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 12px',background:'#fff',border:'.5px solid var(--border)',borderRadius:'var(--r)',marginBottom:5}}><span style={{color:'var(--t3)',fontSize:12}}>⠿</span><span style={{fontSize:12,fontWeight:500,flex:1}}>{f}</span><span className="tag">system</span></div>)}
            </div>
          )}

          {/* AUDIT */}
          {section==='audit' && (
            <div>
              <div className="card-title" style={{marginBottom:10}}>Audit log</div>
              <div className="alert info" style={{fontSize:12}}>ℹ Audit logging is stored locally. Showing demo entries.</div>
              <div className="card" style={{padding:0}}>
                {[{user:'Diksha',action:'Meeting set',detail:'Menzies LLP',ts:'Today 11:38',col:'#1D9E75'},{user:'Admin',action:'User added',detail:'Sadichha added as Rep',ts:'Today 09:01',col:'#7F77DD'},{user:'Sadichha',action:'Firm added',detail:'Bishop Fleming',ts:'Today 09:14',col:'#378ADD'},{user:'Diksha',action:'Call logged',detail:'haysmacintyre — No answer',ts:'Yesterday 16:02',col:'#888780'},{user:'Admin',action:'Export',detail:'12 firms exported',ts:'Yesterday 14:55',col:'#E24B4A'},{user:'Sadichha',action:'Stage updated',detail:'PKF Littlejohn → Proposal',ts:'Yesterday 11:10',col:'#7F77DD'}].map((l,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 14px',borderBottom:'.5px solid var(--border)'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:l.col,flexShrink:0,marginTop:4}} />
                    <div style={{flex:1}}><span style={{fontWeight:500}}>{l.user}</span> — {l.action} <span style={{fontSize:11,padding:'1px 6px',borderRadius:4,background:'var(--grl)',color:'var(--gray)'}}>{l.detail}</span></div>
                    <div style={{fontSize:11,color:'var(--t3)',whiteSpace:'nowrap'}}>{l.ts}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* User modal */}
      {userModal && (
        <div className="mov" onClick={e=>{if(e.target===e.currentTarget)setUserModal(null)}}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="mhd"><h2>{userModal.mode==='add'?'Add user':`Edit — ${userModal.user?.name}`}</h2><button className="mx" onClick={()=>setUserModal(null)}>✕</button></div>
            <div className="mbd">
              <div className="form-grid">
                <div className="fg"><label>Full name *</label><input value={userForm.name||''} onChange={e=>setUserForm(f=>({...f,name:e.target.value}))} /></div>
                <div className="fg"><label>Email *</label><input type="email" value={userForm.email||''} onChange={e=>setUserForm(f=>({...f,email:e.target.value}))} /></div>
                <div className="fg"><label>Password</label><input type="password" value={(userForm as any).password||''} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))} placeholder={userModal.mode==='edit'?'Leave blank to keep current':''} /></div>
                <div className="fg"><label>Role</label>
                  <select value={userForm.role||'rep'} onChange={e=>{const r=e.target.value;setUserForm(f=>({...f,role:r as any,perms:{...admin.rolePerms?.[r]}}));}}>
                    <option value="rep">Rep</option><option value="manager">Manager</option><option value="admin">Admin</option>
                  </select>
                </div>
                <div className="fg"><label>Linked rep</label>
                  <select value={userForm.linkedRep||''} onChange={e=>setUserForm(f=>({...f,linkedRep:e.target.value}))}>
                    <option value="">— Not a rep —</option>{admin.reps?.map(r=><option key={r.name}>{r.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Status</label>
                  <select value={userForm.status||'active'} onChange={e=>setUserForm(f=>({...f,status:e.target.value as any}))}>
                    <option value="active">Active</option><option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="full"><div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--brand)',marginBottom:8}}>Permission overrides</div>
                  {PERM_KEYS.map(k=>(
                    <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'.5px solid var(--border)'}}>
                      <div><div style={{fontSize:12,fontWeight:500}}>{PERM_LABELS[k].l}</div><div style={{fontSize:11,color:'var(--t2)'}}>{PERM_LABELS[k].d}</div></div>
                      <label className="toggle"><input type="checkbox" checked={!!(userForm.perms as any)?.[k]} onChange={e=>setUserForm(f=>({...f,perms:{...f.perms,[k]:e.target.checked}}))} /><span className="tslider"></span></label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mft"><button className="btn" onClick={()=>setUserModal(null)}>Cancel</button><button className="btn primary" onClick={saveUser}>{userModal.mode==='add'?'Add user':'Save changes'}</button></div>
          </div>
        </div>
      )}

      {/* Confirm */}
      {confirmCb && (
        <div className="mov" style={{zIndex:700}} onClick={e=>{if(e.target===e.currentTarget)setConfirmCb(null)}}>
          <div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
            <div className="mhd"><h2>{confirmCb.title}</h2><button className="mx" onClick={()=>setConfirmCb(null)}>✕</button></div>
            <div className="mbd"><div style={{fontSize:13,lineHeight:1.6,color:'var(--t2)'}} dangerouslySetInnerHTML={{__html:confirmCb.body}} /></div>
            <div className="mft"><button className="btn" onClick={()=>setConfirmCb(null)}>Cancel</button><button className={`btn primary ${confirmCb.cls||''}`} onClick={()=>{confirmCb.cb();setConfirmCb(null);}}>{confirmCb.ok}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
