import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { downloadProtectedFile } from '../../utils/download';

export function useKnowledgeData(paths) {
  const key = JSON.stringify(paths);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: [], loading: true, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(JSON.parse(key).map((path) => api.get(path, { signal: controller.signal })))
      .then((responses) => { if (!controller.signal.aborted) setState({ data: responses.map((response) => response.data.data), loading: false, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ data: [], loading: false, error: error.response?.data?.message || 'We could not load this page. Please try again.' }); });
    return () => controller.abort();
  }, [key, revision]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
}
export function useKnowledgeAction() {
  const [busy, setBusy] = useState(false);
  const run = async (action, message) => {
    setBusy(true);
    try { const response = await action(); if (message) toast.success(message); return response || true; }
    catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not save your changes.'); return false; }
    finally { setBusy(false); }
  };
  return { busy, run };
}
export async function knowledgeDownload(path, filename) {
  try { await downloadProtectedFile(path, filename); }
  catch (error) { toast.error(error.response?.status === 409 ? 'This download is not available for this attempt.' : 'Could not download the file. Please try again.'); }
}
export const displayDate = (value) => value ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`).toLocaleDateString() : '—';
