/* ── DiTech FAO — API client ──────────────────────────────── */

const API = '/api';

let _token = '';

export function setToken(t: string) { _token = t; }
export function getToken() { return _token; }

async function request<T = any>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Auth ── */
export const auth = {
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
};

/* ── Firms ── */
export const firms = {
  getAll:     ()                              => request<any[]>('/firms'),
  create:     (f: any)                        => request('/firms',           { method: 'POST', body: JSON.stringify(f) }),
  update:     (id: string, f: any)            => request(`/firms/${id}`,     { method: 'PUT',  body: JSON.stringify(f) }),
  remove:     (id: string)                    => request(`/firms/${id}`,     { method: 'DELETE' }),
  bulkDelete: (ids: string[])                 => request('/firms/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  quickStage: (id: string, stage: string)     => request(`/firms/${id}/stage`, { method: 'PUT',  body: JSON.stringify({ stage }) }),
  bulkStage:  (ids: string[], stage: string)  => request('/firms/bulk-stage',  { method: 'POST', body: JSON.stringify({ ids, stage }) }),
  bulkAssign: (ids: string[], assigned_to: string) => request('/firms/bulk-assign', { method: 'POST', body: JSON.stringify({ ids, assigned_to }) }),
};

/* ── Calls ── */
export const calls = {
  getAll: ()                   => request<any[]>('/calls'),
  create: (c: any)             => request('/calls',       { method: 'POST',   body: JSON.stringify(c) }),
  update: (id: string, c: any) => request(`/calls/${id}`, { method: 'PUT',    body: JSON.stringify(c) }),
  remove: (id: string)         => request(`/calls/${id}`, { method: 'DELETE' }),
};

/* ── Reminders ── */
export const reminders = {
  getAll: ()                   => request<any[]>('/reminders'),
  create: (r: any)             => request('/reminders',       { method: 'POST',   body: JSON.stringify(r) }),
  update: (id: string, r: any) => request(`/reminders/${id}`, { method: 'PUT',    body: JSON.stringify(r) }),
  toggle: (id: string)         => request(`/reminders/${id}/toggle`, { method: 'PUT' }),
  remove: (id: string)         => request(`/reminders/${id}`, { method: 'DELETE' }),
};

/* ── Admin ── */
export const admin = {
  getAll:       ()                                    => request<any>('/admin'),
  createUser:   (u: any)                              => request('/admin/users',   { method: 'POST',   body: JSON.stringify(u) }),
  updateUser:   (id: string, u: any)                  => request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(u) }),
  deleteUser:   (id: string)                          => request(`/admin/users/${id}`, { method: 'DELETE' }),
  createRep:    (r: any)                              => request('/admin/reps',    { method: 'POST',   body: JSON.stringify(r) }),
  updateRep:    (id: string, r: any)                  => request(`/admin/reps/${id}`,  { method: 'PUT', body: JSON.stringify(r) }),
  deleteRep:    (id: string)                          => request(`/admin/reps/${id}`,  { method: 'DELETE' }),
  createFY:     (fy: any)                             => request('/admin/financial-years',      { method: 'POST', body: JSON.stringify(fy) }),
  updateFY:     (id: string, fy: any)                 => request(`/admin/financial-years/${id}`, { method: 'PUT',  body: JSON.stringify(fy) }),
  activateFY:   (id: string)                          => request(`/admin/financial-years/${id}/activate`, { method: 'PUT' }),
  updateDropdowns:  (key: string, values: string[])   => request('/admin/dropdowns',  { method: 'PUT', body: JSON.stringify({ key, values }) }),
  updateRolePerms:  (role: string, perms: any)        => request('/admin/role-perms', { method: 'PUT', body: JSON.stringify({ role, perms }) }),
  updateSettings:   (settings: any)                   => request('/admin/settings',   { method: 'PUT', body: JSON.stringify(settings) }),
};
