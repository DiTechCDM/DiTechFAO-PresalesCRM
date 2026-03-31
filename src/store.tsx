import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Firm, Call, AdminSettings, Reminder } from './types';
import * as api from './lib/api';

const defaultAdmin: AdminSettings = {
  active_fy: 'fy2026-27',
  financial_years: [{ id: 'fy2026-27', label: 'FY 2026-27', start_year: 2026, status: 'active', locked: false, kpi: { calls_day: 50, li_day: 10, mine_day: 25, meetings_month: 20, leads_month: 40, q1_leads: 120, q2_leads: 240, q3_leads: 240, q4_leads: 240, qual_rate: 40, engage_rate: 50, close_rate: 30, rev_fte: 2700, rev_payg: 4500 } }],
  kpi: { calls_day: 50, li_day: 10, mine_day: 25, meetings_month: 20, leads_month: 40, q1_leads: 120, q2_leads: 240, q3_leads: 240, q4_leads: 240, qual_rate: 40, engage_rate: 50, close_rate: 30, rev_fte: 2700, rev_payg: 4500 },
  users: [],
  reps: [],
  rolePerms: {
    rep: { export: false, delete: false, addFirm: true, editFirm: true, viewAll: false, logCall: true, bulkOps: false, viewReports: true },
    manager: { export: true, delete: false, addFirm: true, editFirm: true, viewAll: true, logCall: true, bulkOps: true, viewReports: true },
    admin: { export: true, delete: true, addFirm: true, editFirm: true, viewAll: true, logCall: true, bulkOps: true, viewReports: true },
  },
  customFields: [],
  dropdowns: { stage: ['Lead', 'Suspect', 'Proposal', 'Win', 'Lost'], source: ['Data mining', 'LinkedIn', 'Event', 'SEO / Inbound', 'Referral'], software: ['Xero', 'QuickBooks', 'Sage 50', 'Sage Cloud', 'IRIS Suite', 'CCH', 'FreeAgent', 'Alphatax', 'TaxCalc', 'Multiple', 'Other'], assigned_to: ['Diksha', 'Sadichha'] },
  settings: { company: 'DiTech FAO', adminEmail: 'admin@ditech.com', market: 'UK Accounting Firms', currency: 'GBP (£)' },
};

/* ── Auto-sync helpers: diff arrays and fire API calls ── */

function syncArray<T extends { id: string }>(
  oldArr: T[] | undefined, newArr: T[] | undefined,
  onCreate: (item: T) => Promise<any>,
  onUpdate: (item: T) => Promise<any>,
  onDelete: (item: T) => Promise<any>,
) {
  const o = oldArr || [];
  const n = newArr || [];
  const added   = n.filter(x => !o.find(y => y.id === x.id));
  const removed = o.filter(x => !n.find(y => y.id === x.id));
  const updated = n.filter(x => { const prev = o.find(y => y.id === x.id); return prev && JSON.stringify(prev) !== JSON.stringify(x); });
  for (const item of added)   onCreate(item).catch(e => console.error('API sync create:', e));
  for (const item of updated) onUpdate(item).catch(e => console.error('API sync update:', e));
  for (const item of removed) onDelete(item).catch(e => console.error('API sync delete:', e));
}

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  admin: AdminSettings;
  setAdmin: (admin: AdminSettings) => void;
  firms: Firm[];
  setFirms: (firms: Firm[]) => void;
  calls: Call[];
  setCalls: (calls: Call[]) => void;
  reminders: Reminder[];
  setReminders: (reminders: Reminder[]) => void;
  showToast: (msg: string, type?: 'ok' | 'err' | 'warn') => void;
  toast: { msg: string; type: string; visible: boolean };
  hasPerm: (p: string) => boolean;
  isAdmin: () => boolean;
  isRep: () => boolean;
  scopeFirms: (all: Firm[]) => Firm[];
  scopeCalls: (all: Call[]) => Call[];
  getActiveFYKpi: () => AdminSettings['kpi'];
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  loading: boolean;
}

export const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(null);
  const [admin, setAdminState] = useState<AdminSettings>(defaultAdmin);
  const [firms, setFirmsState] = useState<Firm[]>([]);
  const [calls, setCallsState] = useState<Call[]>([]);
  const [reminders, setRemindersState] = useState<Reminder[]>([]);
  const [toast, setToast] = useState({ msg: '', type: '', visible: false });
  const [loading, setLoading] = useState(true);

  // Refs keep the "previous" snapshot so setters can diff
  const firmsRef     = useRef<Firm[]>([]);
  const callsRef     = useRef<Call[]>([]);
  const remindersRef = useRef<Reminder[]>([]);
  const adminRef     = useRef<AdminSettings>(defaultAdmin);

  /* ── Load all data from API ── */
  const loadAllData = async () => {
    try {
      const [firmsData, callsData, remindersData, adminData] = await Promise.all([
        api.firms.getAll(), api.calls.getAll(), api.reminders.getAll(), api.admin.getAll(),
      ]);
      const merged = { ...defaultAdmin, ...adminData };

      /* ── Sync/repair: ensure every user with role "rep" has a matching admin.reps entry + dropdown ── */
      let repsDirty = false;
      const reps = [...(merged.reps || [])];
      const assignedTo = [...(merged.dropdowns?.assigned_to || [])];
      const colours = ['#1D9E75','#7F77DD','#378ADD','#EF9F27','#A32D2D','#185FA5','#854F0B'];

      for (const u of merged.users || []) {
        if (u.role !== 'rep') continue;
        const uName = u.name.trim();
        const hasRep = reps.some(r => r.name.toLowerCase() === uName.toLowerCase() || r.id === u.linkedRep);
        if (!hasRep) {
          const col = colours[reps.length % colours.length];
          const init = uName.substring(0, 2).toUpperCase();
          reps.push({ id: 'r' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), name: uName, init, col, mtg: 20, calls: 50, mine: 25, li: 10, status: 'Active' });
          repsDirty = true;
        }
        if (!assignedTo.some(n => n.toLowerCase() === uName.toLowerCase())) {
          assignedTo.push(uName);
          repsDirty = true;
        }
      }

      if (repsDirty) {
        merged.reps = reps;
        merged.dropdowns = { ...merged.dropdowns, assigned_to: assignedTo };
        // Persist the repaired data back to the server
        for (const r of reps) {
          if (!(adminData?.reps || []).find((er: any) => er.id === r.id)) {
            api.admin.createRep(r).catch(e => console.error('Rep sync create:', e));
          }
        }
        api.admin.updateDropdowns('assigned_to', assignedTo).catch(e => console.error('Dropdown sync:', e));
      }

      setFirmsState(firmsData);       firmsRef.current = firmsData;
      setCallsState(callsData);       callsRef.current = callsData;
      setRemindersState(remindersData); remindersRef.current = remindersData;
      setAdminState(merged);           adminRef.current = merged;
    } catch (err) { console.error('Failed to load data from API:', err); }
  };

  /* ── Boot: try to restore session from stored token ── */
  useEffect(() => {
    const stored = sessionStorage.getItem('dtp_token');
    if (stored) {
      try {
        const { token, user } = JSON.parse(stored);
        api.setToken(token);
        setCurrentUserState(user);
        loadAllData().finally(() => setLoading(false));
        return;
      } catch { /* fall through */ }
    }
    setLoading(false);
  }, []);

  /* ── Login / logout ── */
  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const { token, user } = await api.auth.login(email, password);
      api.setToken(token);
      setCurrentUserState(user);
      sessionStorage.setItem('dtp_token', JSON.stringify({ token, user }));
      await loadAllData();
      return {};
    } catch (err: any) {
      return { error: err.message || 'Login failed' };
    }
  };

  const logout = () => {
    setCurrentUserState(null);
    api.setToken('');
    sessionStorage.removeItem('dtp_token');
  };

  /* ── Auto-sync setters ────────────────────────────────
     Each setter updates React state immediately (optimistic UI)
     then diffs against the previous snapshot and fires the
     correct API calls in the background.
     ──────────────────────────────────────────────────── */

  const setFirms = (newFirms: Firm[]) => {
    const old = firmsRef.current;
    setFirmsState(newFirms);
    firmsRef.current = newFirms;
    syncArray(old, newFirms,
      f => api.firms.create(f),
      f => api.firms.update(f.id, f),
      f => api.firms.remove(f.id),
    );
  };

  const setCalls = (newCalls: Call[]) => {
    const old = callsRef.current;
    setCallsState(newCalls);
    callsRef.current = newCalls;
    syncArray(old, newCalls,
      c => api.calls.create(c),
      c => api.calls.update(c.id, c),
      c => api.calls.remove(c.id),
    );
  };

  const setReminders = (newReminders: Reminder[]) => {
    const old = remindersRef.current;
    setRemindersState(newReminders);
    remindersRef.current = newReminders;
    syncArray(old, newReminders,
      r => api.reminders.create(r),
      r => api.reminders.update(r.id, r),
      r => api.reminders.remove(r.id),
    );
  };

  const setAdmin = (newAdmin: AdminSettings) => {
    const old = adminRef.current;
    setAdminState(newAdmin);
    adminRef.current = newAdmin;

    // Sync users
    syncArray(old.users, newAdmin.users,
      u => api.admin.createUser(u),
      u => api.admin.updateUser(u.id, u),
      u => api.admin.deleteUser(u.id),
    );
    // Sync reps
    syncArray(old.reps, newAdmin.reps,
      r => api.admin.createRep(r),
      r => api.admin.updateRep(r.id, r),
      r => api.admin.deleteRep(r.id),
    );
    // Sync financial years
    syncArray(old.financial_years, newAdmin.financial_years,
      fy => api.admin.createFY(fy),
      fy => api.admin.updateFY(fy.id, fy),
      () => Promise.resolve(), // don't delete FYs
    );
    // Active FY change
    if (old.active_fy !== newAdmin.active_fy && newAdmin.active_fy) {
      api.admin.activateFY(newAdmin.active_fy).catch(console.error);
    }
    // Dropdowns
    for (const key of Object.keys(newAdmin.dropdowns || {})) {
      if (key === 'assigned_to') continue; // auto-synced by reps
      if (JSON.stringify(old.dropdowns?.[key]) !== JSON.stringify(newAdmin.dropdowns[key])) {
        api.admin.updateDropdowns(key, newAdmin.dropdowns[key]).catch(console.error);
      }
    }
    // Role permissions
    for (const role of Object.keys(newAdmin.rolePerms || {})) {
      if (JSON.stringify(old.rolePerms?.[role]) !== JSON.stringify(newAdmin.rolePerms[role])) {
        api.admin.updateRolePerms(role, newAdmin.rolePerms[role]).catch(console.error);
      }
    }
  };

  const setCurrentUser = (user: User | null) => {
    setCurrentUserState(user);
    if (!user) { logout(); }
  };

  const showToast = (msg: string, type: 'ok' | 'err' | 'warn' = 'ok') => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2600);
  };

  const hasPerm = useCallback((p: string) => currentUser?.role === 'admin' || (currentUser?.perms as any)?.[p] === true, [currentUser]);
  const isAdmin = useCallback(() => currentUser?.role === 'admin', [currentUser]);
  const isRep = useCallback(() => currentUser?.role === 'rep', [currentUser]);

  const scopeFirms = useCallback((all: Firm[]) => {
    if (hasPerm('viewAll')) return all;
    return all.filter(f => f.assigned_to === currentUser?.linkedRep || f.assigned_to === currentUser?.name);
  }, [currentUser, hasPerm]);

  const scopeCalls = useCallback((all: Call[]) => {
    if (hasPerm('viewAll')) return all;
    return all.filter(c => c.rep === currentUser?.linkedRep || c.rep === currentUser?.name);
  }, [currentUser, hasPerm]);

  const getActiveFYKpi = useCallback(() => {
    const fy = admin.financial_years?.find(f => f.id === admin.active_fy) || admin.financial_years?.[0];
    return fy?.kpi || admin.kpi;
  }, [admin]);

  return (
    <AppContext.Provider value={{ currentUser, setCurrentUser, admin, setAdmin, firms, setFirms, calls, setCalls, reminders, setReminders, showToast, toast, hasPerm, isAdmin, isRep, scopeFirms, scopeCalls, getActiveFYKpi, login, logout, loading }}>
      {children}
      <div id="toast" className={`${toast.type} ${toast.visible ? 'show' : ''}`}>{toast.msg}</div>
    </AppContext.Provider>
  );
}

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
};
