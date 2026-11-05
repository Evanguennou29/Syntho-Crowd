export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((item: { msg: string }) => item.msg).join(' ; ')
      : data.error || 'Le service est indisponible. Réessayez.';
    throw new Error(message);
  }
  return data as T;
}

export const activeStatus = (status: string) => ['queued', 'running'].includes(status);
export const statusLabel = (status: string) => ({
  queued: 'En attente', running: 'En cours', completed: 'Terminé', success: 'Terminé',
  partial: 'Terminé avec des erreurs', failure: 'Échec technique', cancelled: 'Annulé',
}[status] || status);
