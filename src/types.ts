export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  status: string;
  linkedRep: string;
  perms: {
    export: boolean;
    delete: boolean;
    addFirm: boolean;
    editFirm: boolean;
    viewAll: boolean;
    logCall: boolean;
    bulkOps: boolean;
    viewReports: boolean;
  };
}

export interface FirmContact {
  id: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  notes?: string;
  isPrimary?: boolean;
}

export interface Firm {
  id: string;
  name: string;
  ch_number?: string;
  city?: string;
  region?: string;
  size?: string;
  staff_count?: string;
  contact_name?: string;
  contact_title?: string;
  phone?: string;
  email?: string;
  main_phone?: string;
  software?: string;
  source?: string;
  stage: string;
  assigned_to?: string;
  notes?: string;
  website?: string;
  win_amount?: number;
  linkedin?: string;
  contact_li?: string;
  pricing_model?: string;
  service_interest?: string;
  last_contact?: string;
  follow_up?: string;
  added_date?: string;
  added_by?: string;
  contacts?: FirmContact[];
}

export interface Call {
  id: string;
  rep: string;
  firm: string;
  firmId: string;
  contact?: string;
  type: string;
  oc: string;
  stage?: string;
  notes?: string;
  fu?: string;
  mtgDate?: string;
  ts: string;
}

export interface Rep {
  id: string;
  name: string;
  init: string;
  col: string;
  mtg: number;
  calls: number;
  mine: number;
  li: number;
  status: string;
}

export interface KPI {
  calls_day: number;
  li_day: number;
  mine_day: number;
  meetings_month: number;
  leads_month: number;
  q1_leads: number;
  q2_leads: number;
  q3_leads: number;
  q4_leads: number;
  qual_rate: number;
  engage_rate: number;
  close_rate: number;
  rev_fte: number;
  rev_payg: number;
}

export interface FinancialYear {
  id: string;
  label: string;
  start_year: number;
  status: string;
  locked: boolean;
  kpi: KPI;
}

export interface Reminder {
  id: string;
  type: 'follow-up' | 'meeting' | 'proposal' | 'task';
  title: string;
  firmId?: string;
  firmName?: string;
  contact?: string;
  dueDate: string;
  dueTime?: string;
  notes?: string;
  rep: string;
  done: boolean;
  createdAt: string;
  createdFrom?: 'call-tracker' | 'firms-db' | 'manual';
}

export interface AdminSettings {
  active_fy: string;
  financial_years: FinancialYear[];
  kpi: KPI;
  users: User[];
  reps: Rep[];
  rolePerms: Record<string, any>;
  customFields: any[];
  dropdowns: Record<string, string[]>;
  settings: any;
}
