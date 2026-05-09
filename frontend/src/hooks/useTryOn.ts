import { useState, useEffect, useRef } from 'react';
import api from '../config/api';
import { TryOnJob } from '../types';

const POLL_MS = 3000;

export function useTryOn() {
  const [job, setJob] = useState<TryOnJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  function pollJob(jobId: string) {
    timerRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get<TryOnJob>(`/tryon/${jobId}`);
        setJob(data);

        if (data.status === 'FAILED') {
          setError(data.errorMessage || 'Generation failed');
        } else if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          pollJob(jobId);
        }
      } catch {
        setError('Lost connection while waiting for results.');
      }
    }, POLL_MS);
  }

  async function submit(photoUris: string[]) {
    if (photoUris.length === 0) return;

    setSubmitting(true);
    setError(null);
    setJob(null);

    try {
      const formData = new FormData();
      for (const uri of photoUris) {
        formData.append('photos', { uri, type: 'image/jpeg', name: 'clothing.jpg' } as unknown as Blob);
      }

      const { data } = await api.post<{ jobId: string }>('/tryon', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setJob({ id: data.jobId, status: 'PENDING' } as TryOnJob);
      pollJob(data.jobId);
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string; error?: string }; status?: number } })?.response;
      const msg = response?.data?.message ?? response?.data?.error ?? 'Submission failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setJob(null);
    setError(null);
  }

  return { job, submitting, error, submit, reset };
}
