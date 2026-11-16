import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';

export function useAssessmentBookmarks(kind) {
  const { user } = useAuth();
  const { freeDemoReadOnly } = useDemoMode();
  const [saved, setSaved] = useState([]), [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const requests = useRef(new Set());
  useEffect(() => {
    const controller = new AbortController();
    api.get('/bookmarks', { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) { setSaved(response.data.data[kind] || []); setLoading(false); setError(''); }
    }).catch(() => {
      if (!controller.signal.aborted) { setLoading(false); setError('Bookmarks could not be loaded. You can still open your assessments.'); }
    });
    return () => controller.abort();
  }, [kind, user?.id, revision]);
  const retry = () => { setLoading(true); setError(''); setRevision((value) => value + 1); };
  const toggle = async (id) => {
    if (loading || error || freeDemoReadOnly || requests.current.has(id)) return;
    requests.current.add(id); setPending((current) => [...current, id]);
    const adding = !saved.includes(id);
    try {
      await api.request({ method: adding ? 'PUT' : 'DELETE', url: `/bookmarks/${kind}/${id}` });
      setSaved((current) => adding ? [...new Set([...current, id])] : current.filter((value) => value !== id));
      toast.success(adding ? 'Assessment bookmarked.' : 'Bookmark removed.');
    } catch (requestError) {
      toast.error(requestError.response?.data?.message || 'Your bookmark was not saved. Check your connection and try again.');
    } finally {
      requests.current.delete(id); setPending((current) => current.filter((value) => value !== id));
    }
  };
  return { saved, loading, error, retry, toggle, pending, readOnly: freeDemoReadOnly };
}
