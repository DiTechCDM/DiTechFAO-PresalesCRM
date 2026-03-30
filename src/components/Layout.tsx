import React, { useState } from 'react';
import { useAppContext } from '../store';
import { Menu } from 'lucide-react';

export default function Layout({ children, currentPanel, setPanel }: any) {
  const { admin, logout, reminders } = useAppContext();
  const [sbOpen, setSbOpen] = useState(true);

  const doLogout = () => {
    logout();
  };

  const { currentUser } = useAppContext();
  const isAdmin = currentUser?.role === 'admin';

  const NAV_PANELS = [
    { id: 'firms',     label: 'Firms DB',        ico: '🏢' },
    { id: 'calls',     label: 'Call Tracker',     ico: '📞' },
    { id: 'allcalls',  label: 'All Calls',        ico: '📋' },
    { id: 'team',      label: 'Team KPIs',        ico: '📊' },
    { id: 'funnel',    label: 'Funnel & Revenue', ico: '📈' },
    { id: 'reminders', label: 'Reminders',        ico: '🔔' },
    { id: 'admin',     label: 'Admin',            ico: '⚙',  adminOnly: true },
  ];

  const groups = [
    { label: 'Database',  items: ['firms'] },
    { label: 'Activity',  items: ['calls','allcalls','team'] },
    { label: 'Analytics', items: ['funnel'] },
    { label: 'Workspace', items: ['reminders'] },
    { label: 'System',    items: ['admin'] },
  ];

  const afy = admin.financial_years?.find((f: any) => f.id === admin.active_fy) || admin.financial_years?.[0];

  // Overdue count for sidebar badge
  const TODAY = new Date().toISOString().split('T')[0];
  const rep = currentUser?.linkedRep || currentUser?.name || '';
  const myReminders = isAdmin ? reminders : reminders.filter(r => r.rep === rep);
  const overdueCount = myReminders.filter(r => !r.done && r.dueDate < TODAY).length;
  const todayCount   = myReminders.filter(r => !r.done && r.dueDate === TODAY).length;
  const urgentCount  = overdueCount + todayCount;

  return (
    <>
      <div id="topbar" style={{ display: 'flex' }}>
        <button className="sb-toggle" onClick={() => setSbOpen(!sbOpen)} title="Toggle sidebar">
          <Menu size={18} color="#fff" />
        </button>
        <div className="topbar-logo">
          <div><div className="name">DiTech FAO</div><div className="tag">Presales CRM</div></div>
        </div>
        <div className="topbar-nav">
          {NAV_PANELS.filter(p => !(p as any).adminOnly || isAdmin).map(p => (
            <button key={p.id} className={`tnav-btn ${currentPanel === p.id ? 'active' : ''}`} onClick={() => setPanel(p.id)}>
              {p.ico} {p.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <div className="fy-badge">{afy?.label}</div>
          <div className="user-pill">
            <div className="uav">{currentUser?.name?.substring(0, 2).toUpperCase()}</div>
            <div><div className="uname">{currentUser?.name}</div><div className="urole">{currentUser?.role}</div></div>
          </div>
          <button className="logout-btn" onClick={doLogout}>Sign out</button>
        </div>
      </div>

      <div id="app" style={{ display: 'block' }}>
        <div id="sidebar" className={sbOpen ? '' : 'collapsed'}>
          <div style={{ padding: '12px 0' }}>
            {groups.map((g, i) => {
              const items = NAV_PANELS.filter(p => g.items.includes(p.id) && (!(p as any).adminOnly || isAdmin));
              if (!items.length) return null;
              return (
                <React.Fragment key={i}>
                  <div className="sb-section-label">{g.label}</div>
                  {items.map(p => (
                    <button key={p.id} className={`slink ${currentPanel === p.id ? 'on' : ''}`} onClick={() => setPanel(p.id)}>
                      <span className="ico">{p.ico}</span>
                      {p.label}
                      {p.id === 'reminders' && urgentCount > 0 && (
                        <span className="badge" style={{ background: overdueCount > 0 ? '#E24B4A' : '#EF9F27', color: '#fff', marginLeft: 'auto' }}>
                          {urgentCount}
                        </span>
                      )}
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
          <div className="sb-footer">DiTech FAO v2.0 · All data local</div>
        </div>
        <div id="content" className={sbOpen ? '' : 'sb-collapsed'}>
          {children}
        </div>
      </div>
    </>
  );
}
