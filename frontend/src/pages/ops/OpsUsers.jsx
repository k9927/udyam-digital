import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, errorMessage } from '../../api/client.js';
import { dateTime } from '../../lib/format.js';
import { ROLE_LABEL } from '../../components/Layout.jsx';
import { Avatar, Badge, Button, Card, Field, LoadState, Modal, PageHeader, useLoad, useToast } from '../../components/ui.jsx';

const EMPTY = { role: 'partner', name: '', email: '', password: '', cities: '', states: '', languages: '' };

export default function OpsUsers() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const state = useLoad(async () => (await api.get('/ops/users')).data);
  const list = value => value.split(',').map(item => item.trim()).filter(Boolean);
  const create = async () => {
    setBusy(true);
    try { await api.post('/ops/users', { ...form, cities: list(form.cities), states: list(form.states), languages: list(form.languages) }); toast('User created'); setOpen(false); setForm(EMPTY); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } finally { setBusy(false); }
  };
  const toggle = async id => { try { await api.post(`/ops/users/${id}/toggle`); await state.reload(true); } catch (error) { toast(errorMessage(error), 'error'); } };
  return (
    <div className="">
      <PageHeader eyebrow="Administration" title="Team and roles" subtitle="Each role sees only its own screens and data. Partners and field staff get work by city." actions={<Button onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Add team member</Button>} />
      <LoadState state={state}>
        {data => <Card className="scroll-x"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Cities</th><th>Languages</th><th>Last sign-in</th><th>Status</th></tr></thead><tbody>{data.users.map(user => <tr key={user.id}><td><div className="flex items-center gap-2.5"><Avatar name={user.name} size="sm" /><div><p className="font-medium">{user.name}</p><p className="text-xs text-ink-muted">{user.email}</p></div></div></td><td className="whitespace-nowrap">{ROLE_LABEL[user.role]}{user.demo && <span className="ml-1.5 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-muted">demo</span>}</td><td className="text-xs text-ink-muted">{(user.region?.cities || []).join(', ') || '—'}</td><td className="text-xs text-ink-muted">{(user.region?.languages || []).join(', ') || '—'}</td><td className="text-xs">{user.lastLoginAt ? dateTime(user.lastLoginAt) : '—'}</td><td><button onClick={() => toggle(user.id)}><Badge tone={user.active ? 'green' : 'neutral'}>{user.active ? 'Active' : 'Disabled'}</Badge></button></td></tr>)}</tbody></table></Card>}
      </LoadState>
      <Modal open={open} title="Add team member" onClose={() => setOpen(false)} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role"><select className="input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>{['partner', 'delivery', 'technician', 'kyc_officer', 'ops_admin'].map(role => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}</select></Field>
          <Field label="Name"><input className="input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Temporary password" hint="At least 8 characters"><input className="input" type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></Field>
          <Field label="Cities"><input className="input" placeholder="Pune, Nashik" value={form.cities} onChange={event => setForm({ ...form, cities: event.target.value })} /></Field>
          <Field label="States"><input className="input" placeholder="Maharashtra" value={form.states} onChange={event => setForm({ ...form, states: event.target.value })} /></Field>
          <Field label="Languages"><input className="input" value={form.languages} onChange={event => setForm({ ...form, languages: event.target.value })} placeholder="Hindi, Marathi" /></Field>
        </div>
      </Modal>
    </div>
  );
}
