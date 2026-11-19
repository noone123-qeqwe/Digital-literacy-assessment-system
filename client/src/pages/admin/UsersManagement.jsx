import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import PageHeader from '../../components/common/PageHeader';
import { useAuth } from '../../contexts/useAuth';
import { AdminNotice } from '../../components/admin/AdminPrimitives';
import {
  UserPlus,
  Search,
  Filter,
  Trash2,
  Edit2,
  Upload,
  FileSpreadsheet,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react';
import toast from 'react-hot-toast';

const getRoleLabel = (role) => (
  role === 'admin' ? 'Administrator' : role === 'respondent' ? 'Student' : 'Retired role (disabled)'
);

const getRoleBadgeClass = (role) => {
  if (role === 'admin') return 'bg-purple-100 text-purple-800 border border-purple-200/70';
  return 'bg-emerald-100 text-emerald-800 border border-emerald-200/70';
};

function parseRosterCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = '';
    } else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error('The CSV needs a header and at least one participant row.');
  const headers = rows.shift().map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const emailIndex = headers.findIndex((header) => ['email', 'email_address', 'school_email'].includes(header));
  const idIndex = headers.findIndex((header) => ['student_id', 'institutional_id', 'id_number'].includes(header));
  if (emailIndex < 0 && idIndex < 0) throw new Error('Include an email column, student_id column, or both.');
  return rows.slice(0, 500).map((fields) => ({
    email: emailIndex >= 0 ? String(fields[emailIndex] || '').trim().toLowerCase() : '',
    student_id: idIndex >= 0 ? String(fields[idIndex] || '').trim() : '',
  }));
}

export const UsersManagement = () => {
  const { user: currentUser } = useAuth();
  const requestRef = useRef(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    institutional_id: '',
    password: '',
    role: 'respondent',
    status: 'active'
  });
  const [rosterAssessments, setRosterAssessments] = useState([]);
  const [rosterAssessmentId, setRosterAssessmentId] = useState('');
  const [rosterRows, setRosterRows] = useState([]);
  const [rosterFileName, setRosterFileName] = useState('');
  const [rosterResults, setRosterResults] = useState(null);
  const [rosterImporting, setRosterImporting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchUsers = useCallback(async (requestedPage = page, searchTerm = debouncedSearch) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      let url = `/users?page=${requestedPage}&limit=20&sort=${encodeURIComponent(sortBy)}`;
      if (roleFilter) url += `&role=${roleFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      const res = await api.get(url, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.data.success) {
        setError('');
        setUsers(res.data.data.users);
        setPagination(res.data.data.pagination);
      } else throw new Error('The user directory could not be loaded.');
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.response?.data?.message || 'The user directory could not be loaded. Please try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [page, roleFilter, debouncedSearch, statusFilter, sortBy]);

  useEffect(() => {
    let active = true;
    // Start after the committed render; cancelled views must not start a request.
    Promise.resolve().then(() => { if (active) void fetchUsers(); });
    return () => { active = false; requestRef.current?.abort(); };
  }, [fetchUsers]);

  useEffect(() => {
    api.get('/assessments').then((response) => {
      setRosterAssessments((response.data?.data || []).filter((assessment) => assessment.status === 'active'));
    }).catch(() => {});
  }, []);

  const handleRosterFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseRosterCsv(await file.text());
      setRosterRows(parsed);
      setRosterFileName(file.name);
      setRosterResults(null);
      if (parsed.length >= 500) toast('Showing the first 500 roster rows.', { icon: 'ℹ️' });
    } catch (error) {
      setRosterRows([]);
      setRosterFileName('');
      toast.error(error.message || 'Could not read this roster file.');
    }
    event.target.value = '';
  };

  const handleRosterImport = async () => {
    if (!rosterAssessmentId || !rosterRows.length) return;
    try {
      setRosterImporting(true);
      const response = await api.post('/users/import-roster', { assessment_id: Number(rosterAssessmentId), rows: rosterRows });
      setRosterResults(response.data.data);
      toast.success(response.data.message || 'Roster processed.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Roster import failed.');
    } finally {
      setRosterImporting(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setPage(1);
    fetchUsers(1, search);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const res = await api.post('/users', formData);
      if (res.data.success) {
        toast.success('User account created');
        setIsAddModalOpen(false);
        setFormData({
          first_name: '',
          last_name: '',
          email: '',
          institutional_id: '',
          password: '',
          role: 'respondent',
          status: 'active'
        });
        fetchUsers();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to create user';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const openEditUser = (user) => {
    setEditingUser({
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      institutional_id: user.institutional_id || '',
      role: user.role,
      status: user.status,
      password: '',
    });
    setIsEditModalOpen(true);
  };

  const handleEditUser = async (event) => {
    event.preventDefault();
    try {
      setIsSaving(true);
      const { id, ...updates } = editingUser;
      if (!updates.password) delete updates.password;
      await api.put(`/users/${id}`, updates);
      toast.success('User account updated');
      setIsEditModalOpen(false);
      await fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user account');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      setIsDeactivating(true);
      const res = await api.delete(`/users/${deactivateTarget.id}`);
      if (res.data.success) {
        toast.success(`${deactivateTarget.first_name} ${deactivateTarget.last_name} deactivated`);
        setDeactivateTarget(null);
        fetchUsers();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate user');
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="admin-users-page space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="User management"
        description="Manage administrator and student accounts."
        action={(
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex w-full items-center justify-center rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 sm:w-auto"
          >
            <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            <span>Add user</span>
          </button>
        )}
      />

      <details className="admin-roster-panel">
      <summary><FileSpreadsheet size={21} aria-hidden="true" /><div><strong>Research roster import</strong><p>Assign a research assessment to existing verified students using a CSV file.</p></div><ChevronDown size={18} aria-hidden="true" /></summary>
      <section aria-labelledby="roster-import-title" className="rounded-2xl border border-green-100 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileSpreadsheet aria-hidden="true" className="h-4 w-4 text-green-700" /><h2 id="roster-import-title">Import an assessment roster</h2></div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Match existing, verified student accounts by email or student ID, then assign them in one step. No new accounts are created.</p>
          </div>
          <div className="admin-roster-controls grid w-full gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:max-w-3xl">
            <label className="block text-xs font-semibold text-slate-600">
              Assessment
              <select value={rosterAssessmentId} onChange={(event) => setRosterAssessmentId(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800">
                <option value="">Choose assessment</option>
                {rosterAssessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{assessment.title}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 hover:bg-green-50">
              <Upload aria-hidden="true" className="h-4 w-4 text-green-700" />
              <span className="max-w-44 truncate">{rosterFileName || 'Choose roster CSV'}</span>
              <input type="file" accept=".csv,text/csv" onChange={handleRosterFile} className="sr-only" />
            </label>
            <button type="button" onClick={handleRosterImport} disabled={!rosterRows.length || !rosterAssessmentId || rosterImporting} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50">
              {rosterImporting ? 'Importing…' : `Assign ${rosterRows.length || ''}`}
            </button>
          </div>
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500"><span>CSV headers: <code>email</code> and/or <code>student_id</code>. Up to 500 rows. The file is processed in this browser and not stored.</span><a href="data:text/csv;charset=utf-8,email%2Cstudent_id%0Astudent%40example.edu%2C20260001" download="dlas-roster-template.csv" className="font-semibold text-green-800 underline">Download template</a></p>
        {rosterRows.length > 0 && <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold text-slate-700">Preview · {rosterRows.length} participants</p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{rosterRows.slice(0, 6).map((row, index) => <p key={`${row.email}-${row.student_id}-${index}`} className="truncate rounded-lg bg-white px-2.5 py-2 text-xs text-slate-600">{row.email || 'No email'}{row.student_id ? ` · ${row.student_id}` : ''}</p>)}</div>
        </div>}
        {rosterResults && <div className="mt-4 rounded-xl border border-slate-200 p-3" role="status">
          <p className="text-sm font-bold text-slate-800">{rosterResults.assignedCount} assigned · {rosterResults.alreadyAssigned} already assigned · {rosterResults.skippedCount} skipped</p>
          {rosterResults.results.some((row) => row.status === 'skipped') && <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">{rosterResults.results.filter((row) => row.status === 'skipped').map((row) => <li key={row.row}>Row {row.row}: {row.reason}</li>)}</ul>}
        </div>}
      </section>
      </details>

      {/* Filter and Search Bar */}
      <div className="admin-user-filters bg-white rounded-2xl border border-slate-200/80 shadow-xs gap-3">
        <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="search"
            aria-label="Search users by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter aria-hidden="true" className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            aria-label="Filter users by role"
            value={roleFilter}
            onChange={(e) => { setLoading(true); setPage(1); setRoleFilter(e.target.value); }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Roles</option>
            <option value="respondent">Students</option>
            <option value="admin">Administrators</option>
          </select>
          <label className="sr-only" htmlFor="user-status-filter">Account status</label>
          <select
            id="user-status-filter"
            value={statusFilter}
            onChange={(e) => { setLoading(true); setPage(1); setStatusFilter(e.target.value); }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <label className="sr-only" htmlFor="user-sort-by">Sort accounts</label>
            <select
              id="user-sort-by"
              value={sortBy}
              onChange={(e) => { setLoading(true); setPage(1); setSortBy(e.target.value); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="newest">Sort: Default</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="submissions">Sort: Most Submissions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <header className="admin-directory-heading"><div><h2>User directory</h2><p>{loading ? 'Loading accounts…' : `${pagination.total} matching account${pagination.total === 1 ? '' : 's'}`}</p></div>{(search || roleFilter || statusFilter || sortBy !== 'newest') && <button type="button" className="admin-text-link" onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setSortBy('newest'); setPage(1); }}>Clear filters</button>}</header>
        {error ? <div className="admin-directory-error"><AdminNotice tone="error" action={<button className="admin-button admin-button-secondary" onClick={() => fetchUsers()}>Try again</button>}>{error}</AdminNotice></div> : loading ? (
          <LoadingSpinner text="Retrieving user directory..." />
        ) : (
          <>
          <div className="admin-user-mobile-list">
            {!users.length && <p className="p-6 text-sm text-slate-500">No accounts match these filters. Try a different name, role, or status.</p>}
            {users.map((u) => <article key={u.id}><header><div><h3>{u.first_name} {u.last_name}</h3><p>{u.email}</p></div><span className={`admin-tag ${u.status === 'active' ? 'admin-tag-ready' : 'admin-tag-pending'}`}>{u.status}</span></header><dl><div><dt>Role</dt><dd><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${getRoleBadgeClass(u.role)}`}>{getRoleLabel(u.role)}</span></dd></div><div><dt>Research submissions</dt><dd>{u.completed_assessments || 0}</dd></div><div><dt>Research profile</dt><dd>{u.role === 'respondent' ? u.municipality || 'Profile pending' : 'Not applicable'}</dd></div>{u.role === 'respondent' && u.municipality && <div><dt>Demographics</dt><dd>{u.sex || 'Unspecified'}{u.age ? ` · ${u.age} y/o` : ''}{u.shs_strand ? ` · ${u.shs_strand}` : ''}</dd></div>}</dl><footer><button type="button" className="admin-button admin-button-secondary" onClick={() => openEditUser(u)} aria-label={`Edit ${u.first_name} ${u.last_name}`}><Edit2 size={16} aria-hidden="true" />Edit account</button>{u.status === 'active' && <button type="button" className="admin-button admin-button-secondary admin-deactivate" disabled={u.id === currentUser?.id} onClick={() => setDeactivateTarget(u)} aria-label={`Deactivate ${u.first_name} ${u.last_name}`}><Trash2 size={16} aria-hidden="true" />Deactivate</button>}</footer></article>)}
          </div>
          <div className="admin-user-table overflow-x-auto" tabIndex={0} role="region" aria-label="User directory table; scroll horizontally to see all columns">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 uppercase font-bold tracking-wider">
                  <th className="py-3.5 px-6">User</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Demographics</th>
                  <th className="py-3.5 px-4">Research submissions</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-500">No user accounts match these filters.</td></tr>}
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-xs border border-slate-200">
                          {u.first_name?.[0]}
                          {u.last_name?.[0]}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs">
                            {u.first_name} {u.last_name}
                          </p>
                          <p className="text-[11px] text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${getRoleBadgeClass(u.role)}`}
                      >
                        {getRoleLabel(u.role)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {u.municipality ? (
                        <div>
                          <span className="font-medium text-slate-800">{u.municipality}</span>
                          <span className="block text-[10px] text-slate-400">
                            {u.sex || 'N/A'}, {u.age ? `${u.age} y/o` : ''} • {u.shs_strand || 'SHS'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">{u.role === 'respondent' ? 'Profile pending' : 'Not applicable'}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-extrabold text-slate-800">{u.completed_assessments || 0}</span>
                      <span className="text-slate-400 text-[11px] ml-1">submitted</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${u.status === 'active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                        {u.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditUser(u)}
                        className="text-slate-400 hover:text-green-600 p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                        title="Edit Account"
                        aria-label={`Edit ${u.first_name} ${u.last_name}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.status === 'active' ? (
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(u)}
                          disabled={u.id === currentUser?.id}
                          aria-label={`Deactivate ${u.first_name} ${u.last_name}`}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Deactivate Account"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Inactive</span>
                      )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="admin-pagination">
        <span>{pagination.total} account{pagination.total === 1 ? '' : 's'} · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold disabled:opacity-40">Previous</button>
          <button type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={page >= pagination.totalPages || loading} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New User Account"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="new-user-first-name" className="block text-xs font-bold text-slate-700 uppercase">First Name</label>
              <input
                id="new-user-first-name"
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label htmlFor="new-user-last-name" className="block text-xs font-bold text-slate-700 uppercase">Last Name</label>
              <input
                id="new-user-last-name"
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-user-email" className="block text-xs font-bold text-slate-700 uppercase">Email Address</label>
            <input
              id="new-user-email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {formData.role === 'respondent' && <div>
            <label htmlFor="new-user-student-id" className="block text-xs font-bold text-slate-700 uppercase">Student ID (optional)</label>
            <input id="new-user-student-id" type="text" maxLength={64} value={formData.institutional_id} onChange={(e) => setFormData({ ...formData, institutional_id: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>}

          <div>
            <label htmlFor="new-user-password" className="block text-xs font-bold text-slate-700 uppercase">Temporary Password</label>
            <input
              id="new-user-password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">Use at least 10 characters. Share temporary credentials securely.</p>
          </div>

          <div>
            <label htmlFor="new-user-role" className="block text-xs font-bold text-slate-700 uppercase">System Role</label>
            <select
              id="new-user-role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-500 font-semibold"
            >
              <option value="respondent">Respondent (BSCS Freshmen)</option>
              <option value="admin">Administrator (System / CCS Head)</option>
            </select>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold shadow-md cursor-pointer transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit User Account"
        maxWidth="max-w-lg"
      >
        {editingUser && <form onSubmit={handleEditUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-first-name" className="block text-xs font-bold uppercase text-slate-700">First name</label>
              <input id="edit-first-name" required maxLength={100} value={editingUser.first_name} onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="edit-last-name" className="block text-xs font-bold uppercase text-slate-700">Last name</label>
              <input id="edit-last-name" required maxLength={100} value={editingUser.last_name} onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label htmlFor="edit-email" className="block text-xs font-bold uppercase text-slate-700">Email</label>
            <input id="edit-email" type="email" required value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          {editingUser.role === 'respondent' && <div>
            <label htmlFor="edit-student-id" className="block text-xs font-bold uppercase text-slate-700">Student ID (optional)</label>
            <input id="edit-student-id" type="text" maxLength={64} value={editingUser.institutional_id || ''} onChange={(e) => setEditingUser({ ...editingUser, institutional_id: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-role" className="block text-xs font-bold uppercase text-slate-700">Role</label>
              <select id="edit-role" value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {!['admin', 'respondent'].includes(editingUser.role) && <option value={editingUser.role} disabled>Retired role — choose a new role</option>}
              <option value="respondent">Student</option><option value="admin">Administrator</option>
              </select>
            </div>
            <div>
              <label htmlFor="edit-status" className="block text-xs font-bold uppercase text-slate-700">Status</label>
              <select id="edit-status" value={editingUser.status} onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="edit-password" className="block text-xs font-bold uppercase text-slate-700">Reset password (optional)</label>
            <input id="edit-password" type="password" minLength={10} maxLength={128} autoComplete="new-password" value={editingUser.password} onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-5 py-2.5 rounded-xl bg-green-600 text-xs font-bold text-white disabled:opacity-50">{isSaving ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>}
      </Modal>

      <Modal
        isOpen={Boolean(deactivateTarget)}
        onClose={() => { if (!isDeactivating) setDeactivateTarget(null); }}
        title="Deactivate User Account"
        maxWidth="max-w-md"
      >
        {deactivateTarget && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600">
              Deactivating <strong className="text-slate-900">{deactivateTarget.first_name} {deactivateTarget.last_name}</strong> ({deactivateTarget.email}) will block sign-in while preserving their assessment history and audit records.
            </p>
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={isDeactivating}
                onClick={() => setDeactivateTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeactivating}
                onClick={confirmDeactivate}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeactivating ? 'Deactivating…' : 'Deactivate account'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UsersManagement;

