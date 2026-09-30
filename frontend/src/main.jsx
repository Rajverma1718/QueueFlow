import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
// Edit these values to change the profile shown in the bottom-left sidebar.
const CURRENT_USER = {
  initials: 'JD',
  name: 'Raj Verma',
  role: 'Administrator',
};
const api = async (path, options = {}) => {
  const res = await fetch(API + path, {headers: {'Content-Type': 'application/json'}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Something went wrong');
  return data;
};
const localToday = () => new Date().toLocaleDateString('en-CA');
const prettyDate = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});

function App() {
  const [day, setDay] = useState(localToday());
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [form, setForm] = useState({patient_name: '', patient_email: '', appointment_date: localToday(), scheduled_time: '11:00', service_id: '', priority: 'normal', notes: ''});

  const refresh = async (requestedDay = day) => {
    setLoading(true);
    try {
      const [a, s, d] = await Promise.all([api(`/appointments?day=${requestedDay}`), api('/services'), api(`/dashboard?day=${requestedDay}`)]);
      setAppointments(a); setServices(s); setDashboard(d);
      if (!form.service_id && s[0]) setForm(f => ({...f, service_id: String(s[0].id)}));
    } catch (error) { setToast(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(day); }, [day]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); } }, [toast]);

  const update = async (id, status) => {
    try { await api(`/appointments/${id}/status`, {method: 'PATCH', body: JSON.stringify({status})}); setToast(status === 'completed' ? 'Appointment completed' : 'Status updated'); refresh(); }
    catch (error) { setToast(error.message); }
  };
  const callNext = async () => {
    try { await api(`/queue/call-next?day=${day}`, {method: 'POST'}); setToast('Next patient moved to service'); refresh(); }
    catch (error) { setToast(error.message); }
  };
  const sendReminder = async () => {
    try { const result = await api(`/notifications/reminders?day=${day}`, {method: 'POST'}); setToast(result.message); }
    catch (error) { setToast(error.message); }
  };
  const submit = async event => {
    event.preventDefault();
    try {
      await api('/appointments', {method: 'POST', body: JSON.stringify({...form, service_id: Number(form.service_id)})});
      setToast('Appointment booked'); setDay(form.appointment_date); setTab('appointments');
      setForm(f => ({...f, patient_name: '', patient_email: '', notes: ''}));
      if (form.appointment_date === day) refresh(day);
    } catch (error) { setToast(error.message); }
  };
  const waiting = appointments.filter(a => ['checked_in', 'called'].includes(a.status));
  const filteredAppointments = useMemo(() => appointments.filter(a => `${a.patient_name} ${a.token} ${a.service.name}`.toLowerCase().includes(search.toLowerCase())), [appointments, search]);
  const navigate = nextTab => { setSearchOpen(false); setNotificationsOpen(false); setTab(nextTab); };
  const title = {overview: 'Good morning, Jordan', queue: 'Live queue', appointments: 'Appointments', patients: 'Patients', book: 'New appointment', settings: 'Settings', help: 'Help center', block: 'Block time'}[tab] || 'QueueFlow';

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><span className="brandmark">Q</span><span>queueflow</span></div>
      <button className="clinic" onClick={() => navigate('settings')}><div className="avatar">HC</div><div><b>Harbor Clinic</b><small>Downtown location</small></div><span className="chev">⌄</span></button>
      <div className="navlabel">WORKSPACE</div>
      <nav>{[['overview', '▦', 'Overview'], ['queue', '↗', 'Live queue'], ['appointments', '□', 'Appointments'], ['patients', '♙', 'Patients']].map(([id, icon, label]) => <button className={tab === id ? 'active' : ''} onClick={() => navigate(id)} key={id}><i>{icon}</i>{label}{id === 'queue' && <em>{waiting.length}</em>}</button>)}</nav>
      <div className="navlabel">MANAGE</div>
      <nav><button className={tab === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><i>⚙</i>Settings</button><button className={tab === 'help' ? 'active' : ''} onClick={() => navigate('help')}><i>?</i>Help center</button></nav>
      <div className="profile"><div className="avatar peach">{CURRENT_USER.initials}</div><div><b>{CURRENT_USER.name}</b><small>{CURRENT_USER.role}</small></div><button className="dots" onClick={() => navigate('settings')}>•••</button></div>
    </aside>
    <main>
      <header><div><div className="breadcrumb">Workspace <span>/</span> {title}</div><h1>{title}</h1></div><div className="header-actions">
        <label className="date-picker">▣ <span>{prettyDate(day)}</span><input type="date" value={day} onChange={e => {setDay(e.target.value); setForm(f => ({...f, appointment_date: e.target.value}));}} /></label>
        <button className="iconbtn" aria-label="Search" onClick={() => {setSearchOpen(v => !v); setNotificationsOpen(false)}}>⌕</button>
        <button className="iconbtn notification-button" aria-label="Notifications" onClick={() => {setNotificationsOpen(v => !v); setSearchOpen(false)}}>♢<span className="notification-dot" /></button>
        <button className="primary" onClick={() => navigate('book')}>+ New appointment</button>
      </div></header>
      {searchOpen && <div className="searchbar"><span>⌕</span><input autoFocus placeholder="Search patients, tokens, services..." value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => {setSearch(''); setSearchOpen(false)}}>×</button></div>}
      {notificationsOpen && <div className="notification-panel"><b>Notifications</b><p>{waiting.length ? `${waiting.length} patient${waiting.length === 1 ? '' : 's'} waiting in the queue.` : 'No patients are currently waiting.'}</p><button onClick={() => {setNotificationsOpen(false); navigate('queue')}}>Open live queue →</button></div>}
      {loading ? <div className="loading card">Loading QueueFlow...</div> : tab === 'book' ? <Booking form={form} setForm={setForm} services={services} submit={submit} cancel={() => navigate('overview')} /> : tab === 'appointments' ? <Appointments appointments={filteredAppointments} update={update} /> : tab === 'patients' ? <Patients appointments={filteredAppointments} /> : tab === 'queue' ? <QueuePage appointments={appointments} dashboard={dashboard} update={update} callNext={callNext} /> : tab === 'settings' ? <Settings setToast={setToast} /> : tab === 'help' ? <Help /> : tab === 'block' ? <BlockTime setToast={setToast} /> : <Overview dashboard={dashboard} appointments={appointments} update={update} callNext={callNext} navigate={navigate} sendReminder={sendReminder} />}
    </main>{toast && <div className="toast">{toast}</div>}
  </div>;
}

function Overview({dashboard, appointments, update, callNext, navigate, sendReminder}) { return <>
  <section className="metrics"><Metric label="Appointments today" value={dashboard.total || 0} trend="+12.5%" note="vs. last Tuesday" icon="□"/><Metric label="Currently waiting" value={dashboard.waiting || 0} trend="-8.2%" note="vs. last Tuesday" icon="♧" good/><Metric label="Patients served" value={dashboard.served || 0} trend="+18.4%" note="vs. last Tuesday" icon="✓"/><Metric label="Avg. wait time" value={`${dashboard.average_wait || 0} min`} trend="-3 min" note="vs. last Tuesday" icon="◷" good/></section>
  <section className="grid"><div className="card queue-card"><div className="card-head"><div><h2>Live queue</h2><p>Real-time patient flow</p></div><span className="live"><b/>Live</span></div>{dashboard.active && <div className="serving"><span className="serving-dot">●</span><div><small>NOW SERVING</small><strong>{dashboard.active.token} <span>• {dashboard.active.patient_name}</span></strong></div><button onClick={() => update(dashboard.active.id, 'completed')}>Complete</button></div>}<div className="queue-list">{appointments.filter(a => !['completed', 'cancelled'].includes(a.status)).map((a, i) => <QueueRow key={a.id} a={a} position={i + 1} update={update}/>)}</div><button className="outline full" onClick={() => navigate('queue')}>View full queue <span>→</span></button></div><ActivityChart appointments={appointments}/></section>
  <section className="bottom-grid"><div className="card upcoming"><div className="card-head"><div><h2>Upcoming appointments</h2><p>Next scheduled visits</p></div><button className="textbtn" onClick={() => navigate('appointments')}>View all →</button></div>{appointments.filter(a => a.status === 'booked').slice(0, 3).map(a => <AppointmentRow a={a} key={a.id} update={update}/>)}</div><div className="card quick"><div className="card-head"><div><h2>Quick actions</h2><p>Common tasks</p></div></div><div className="action-grid"><button onClick={() => navigate('book')}><span className="action purplebg">+</span><b>Book appointment</b><small>Schedule a new visit</small></button><button onClick={callNext}><span className="action greenbg">↗</span><b>Call next patient</b><small>Move queue forward</small></button><button onClick={() => navigate('block')}><span className="action orangebg">▣</span><b>Block time</b><small>Mark unavailable hours</small></button><button onClick={sendReminder}><span className="action bluebg">⌁</span><b>Send reminder</b><small>Notify waiting patients</small></button></div></div></section>
</>; }
function ActivityChart({appointments}) { const booked = appointments.length; const done = appointments.filter(a => a.status === 'completed').length; return <div className="card chart-card"><div className="card-head"><div><h2>Today's activity</h2><p>{booked} appointments · {done} completed</p></div><span className="select">Live data</span></div><div className="chart"><div className="ylabels"><span>30</span><span>20</span><span>10</span><span>0</span></div><div className="bars">{['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM'].map((x, i) => <div className="barwrap" key={x}><div className={'bar ' + (i === 3 ? 'hi' : '')} style={{height: (22 + (i % 4) * 14) + '%'}}><span>{i % 3 === 0 ? 8 + i : ''}</span></div><small>{x}</small></div>)}</div></div><div className="legend"><span><b className="purple"/>Appointments</span><span><b className="green"/>Completed</span></div></div>; }
function Metric({label, value, trend, note, icon, good}) { return <div className="metric"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><div><b className={good ? 'good' : ''}>{trend}</b><small>{note}</small></div></div>; }
function QueueRow({a, position, update}) { return <div className="queue-row"><span className={'number ' + (a.status === 'serving' ? 'current' : '')}>{a.status === 'serving' ? '●' : String(position).padStart(2, '0')}</span><div className="person"><strong>{a.patient_name}</strong><small>{a.service.name}</small></div><span className={'status ' + a.status}>{a.status.replace('_', ' ')}</span><strong className="wait">{a.status === 'serving' ? 'Now' : position * 8 + ' min'}</strong>{a.status === 'checked_in' && <button className="more call-button" onClick={() => update(a.id, 'called')}>Call</button>}</div>; }
function QueuePage({appointments, dashboard, update, callNext}) { return <div className="card queue-page"><div className="card-head"><div><h2>Live queue</h2><p>Manage the order and status of patients in real time.</p></div><button className="primary" onClick={callNext}>Call next patient</button></div>{dashboard.active && <div className="serving large"><span className="serving-dot">●</span><div><small>NOW SERVING</small><strong>{dashboard.active.token} · {dashboard.active.patient_name}</strong><p>{dashboard.active.service.name}</p></div><button onClick={() => update(dashboard.active.id, 'completed')}>Complete appointment</button></div>}<div className="queue-list full-queue">{appointments.filter(a => !['completed', 'cancelled'].includes(a.status)).map((a, i) => <QueueRow key={a.id} a={a} position={i + 1} update={update}/>)}</div>{!appointments.some(a => !['completed', 'cancelled'].includes(a.status)) && <Empty title="The queue is clear" text="Check in an appointment to start serving patients."/>}</div>; }
function AppointmentRow({a, update}) { return <div className="appointment-row"><span className="time">{a.scheduled_time}</span><div className="person"><strong>{a.patient_name}</strong><small>{a.service.name}</small></div><span className="status booked">{a.status}</span><button className="more" onClick={() => a.status === 'booked' ? update(a.id, 'checked_in') : null}>•••</button></div>; }
function Booking({form, setForm, services, submit, cancel}) { return <div className="card form-card"><div className="card-head"><div><h2>Book a new appointment</h2><p>Create a patient visit and add it to the selected schedule.</p></div></div><form onSubmit={submit}><label>Patient name<input required value={form.patient_name} onChange={e => setForm({...form, patient_name: e.target.value})} placeholder="e.g. Sarah Wilson"/></label><div className="form-grid"><label>Email address<input type="email" value={form.patient_email} onChange={e => setForm({...form, patient_email: e.target.value})} placeholder="patient@example.com"/></label><label>Appointment date<input type="date" required value={form.appointment_date} onChange={e => setForm({...form, appointment_date: e.target.value})}/></label><label>Time<input type="time" required value={form.scheduled_time} onChange={e => setForm({...form, scheduled_time: e.target.value})}/></label><label>Service<select required value={form.service_id} onChange={e => setForm({...form, service_id: e.target.value})}>{services.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label></div><label>Priority<select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}><option value="normal">Normal</option><option value="priority">Priority</option></select></label><label>Notes<textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes for staff"/></label><div className="form-actions"><button type="button" className="outline" onClick={cancel}>Cancel</button><button className="primary" type="submit">Book appointment</button></div></form></div>; }
function Appointments({appointments, update}) { return <div className="card table-card"><div className="card-head"><div><h2>Appointments</h2><p>Appointments for the selected date</p></div><span className="count-pill">{appointments.length} total</span></div><div className="table"><div className="tr th"><span>Patient</span><span>Service</span><span>Time</span><span>Status</span><span>Action</span></div>{appointments.map(a => <div className="tr" key={a.id}><span><b>{a.patient_name}</b><small>{a.token}</small></span><span>{a.service.name}</span><span>{a.scheduled_time}</span><span className={'status ' + a.status}>{a.status.replace('_', ' ')}</span><span>{a.status === 'booked' && <button className="smallbtn" onClick={() => update(a.id, 'checked_in')}>Check in</button>}{a.status === 'checked_in' && <button className="smallbtn" onClick={() => update(a.id, 'called')}>Call</button>}{a.status === 'serving' && <button className="smallbtn" onClick={() => update(a.id, 'completed')}>Complete</button>}{['completed', 'cancelled'].includes(a.status) && <span className="done-label">Done</span>}</span></div>)}</div>{!appointments.length && <Empty title="No appointments found" text="Try another date or book a new appointment."/>}</div>; }
function Patients({appointments}) { const names = [...new Map(appointments.map(a => [a.patient_name, a])).values()]; return <div className="card table-card"><div className="card-head"><div><h2>Patients</h2><p>Patients with visits on the selected date</p></div><span className="count-pill">{names.length} patients</span></div><div className="patient-grid">{names.map(a => <div className="patient" key={a.id}><div className="avatar">{a.patient_name.split(' ').map(x => x[0]).join('')}</div><div><b>{a.patient_name}</b><small>{a.patient_email || 'No email on file'}</small></div><span>›</span></div>)}</div>{!names.length && <Empty title="No patients found" text="Patients will appear here after appointments are booked."/>}</div>; }
function Settings({setToast}) { const [settings, setSettings] = useState({clinic_name: 'Harbor Clinic', location: 'Downtown location', lead_time_minutes: 15}); useEffect(() => { api('/settings').then(setSettings).catch(error => setToast(error.message)); }, []); const save = async e => { e.preventDefault(); try { await api('/settings', {method: 'PATCH', body: JSON.stringify(settings)}); setToast('Settings saved'); } catch (error) { setToast(error.message); } }; return <div className="card form-card"><div className="card-head"><div><h2>Workspace settings</h2><p>Update the clinic details shown to your team.</p></div></div><form onSubmit={save}><label>Clinic name<input value={settings.clinic_name} onChange={e => setSettings({...settings, clinic_name: e.target.value})} required/></label><label>Location<input value={settings.location} onChange={e => setSettings({...settings, location: e.target.value})} required/></label><label>Queue notification lead time<select value={settings.lead_time_minutes} onChange={e => setSettings({...settings, lead_time_minutes: Number(e.target.value)})}><option value="5">5 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label><div className="form-actions"><button className="primary" type="submit">Save settings</button></div></form></div>; }
function Help() { return <div className="card help-card"><h2>Help center</h2><p>Quick answers for running your clinic queue.</p><div className="help-items"><details open><summary>How do I move a patient through the queue?</summary><p>Check in a booked appointment, then use “Call” or “Call next patient”. Complete the appointment when service is finished.</p></details><details><summary>How are wait times calculated?</summary><p>QueueFlow estimates eight minutes per patient ahead of the selected patient and prioritizes priority appointments.</p></details><details><summary>How do I book a new visit?</summary><p>Use the “New appointment” button, complete the form, and the appointment will appear in the selected date.</p></details></div></div>; }
function BlockTime({setToast}) { const [saved, setSaved] = useState(false); const [values, setValues] = useState({block_date: localToday(), start_time: '13:00', end_time: '14:00', reason: 'staff', note: ''}); const submit = async e => { e.preventDefault(); try { await api('/blocked-slots', {method: 'POST', body: JSON.stringify(values)}); setSaved(true); setToast('Unavailable time saved'); } catch (error) { setToast(error.message); } }; return <div className="card form-card"><div className="card-head"><div><h2>Block time</h2><p>Mark a period as unavailable for new appointments.</p></div></div><form onSubmit={submit}><div className="form-grid"><label>Date<input type="date" required value={values.block_date} onChange={e => setValues({...values, block_date: e.target.value})}/></label><label>Reason<select value={values.reason} onChange={e => setValues({...values, reason: e.target.value})}><option value="staff">Staff meeting</option><option value="break">Break</option><option value="holiday">Holiday</option></select></label><label>Start time<input type="time" required value={values.start_time} onChange={e => setValues({...values, start_time: e.target.value})}/></label><label>End time<input type="time" required value={values.end_time} onChange={e => setValues({...values, end_time: e.target.value})}/></label></div><label>Note<textarea value={values.note} onChange={e => setValues({...values, note: e.target.value})} placeholder="Optional note for the team"/></label><div className="form-actions"><button className="primary" type="submit">{saved ? 'Saved ✓' : 'Block time'}</button></div></form></div>; }
function Empty({title, text}) { return <div className="empty"><b>{title}</b><span>{text}</span></div>; }
createRoot(document.getElementById('root')).render(<App/>);
