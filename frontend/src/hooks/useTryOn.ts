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
        console.log(`[TryOn] Polling job ${jobId}...`);
        const { data } = await api.get<TryOnJob>(`/tryon/${jobId}`);
        console.log(`[TryOn] Job status: ${data.status}`, data);
        setJob(data);
        
        if (data.status === 'FAILED') {
          setError(data.errorMessage || 'Generation failed');
          console.error('[TryOn] Job failed:', data.errorMessage);
        } else if (data.status === 'PENDING' || data.status === 'PROCESSING') {
          pollJob(jobId);
        } else if (data.status === 'COMPLETE') {
          console.log('[TryOn] Job complete!', {
            fullBody: data.resultFullBodyUrl,
            medium: data.resultMediumUrl,
          });
        }
      } catch (err) {
        console.error('[TryOn] Poll error:', err);
        setError('Lost connection while waiting for results.');
      }
    }, POLL_MS);
  }

  async function submit(photoUris: string[]) {
    if (photoUris.length === 0) return;
    
    console.log('[TryOn] Submitting try-on with photos:', photoUris);
    setSubmitting(true);
    setError(null);
    setJob(null);

    try {
      const formData = new FormData();
      for (const uri of photoUris) {
        console.log('[TryOn] Adding photo:', uri.substring(0, 50));
        formData.append('photos', { uri, type: 'image/jpeg', name: 'clothing.jpg' } as unknown as Blob);
      }
      
      console.log('[TryOn] Sending request...');
      const { data } = await api.post<{ jobId: string }>('/tryon', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      console.log('[TryOn] Job submitted:', data.jobId);
      setJob({ id: data.jobId, status: 'PENDING' } as TryOnJob);
      pollJob(data.jobId);
    } catch (err: unknown) {
      console.error('[TryOn] Submit error:', err);
      const response = (err as { response?: { data?: { message?: string; error?: string }; status?: number } })?.response;
      console.error('[TryOn] Error response:', response?.status, response?.data);
      
      const msg = response?.data?.message ?? response?.data?.error ?? 'Submission failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    console.log('[TryOn] Resetting state');
    if (timerRef.current) clearTimeout(timerRef.current);
    setJob(null);
    setError(null);
  }

  return { job, submitting, error, submit, reset };
}
