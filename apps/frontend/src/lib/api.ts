export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}/api${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `HTTP Error ${response.status}`;
    try {
      const parsed = JSON.parse(errorText);
      errorMessage = parsed.message || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  projects: {
    list: () => request<any[]>('/projects'),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (name: string) =>
      request<any>('/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    update: (id: string, name: string) =>
      request<any>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    delete: (id: string) =>
      request<any>(`/projects/${id}`, {
        method: 'DELETE',
      }),
    metadata: (id: string) => request<any>(`/projects/${id}/metadata`),
  },
  chapters: {
    create: (projectId: string, title: string, importPath: string, height?: number, sensitivity?: number) =>
      request<any>(`/projects/${projectId}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ title, importPath, height, sensitivity }),
      }),
    delete: (id: string) =>
      request<any>(`/chapters/${id}`, {
        method: 'DELETE',
      }),
    export: (id: string) =>
      request<any>(`/chapters/${id}/export`, {
        method: 'POST',
      }),
    autoCrop: (id: string) =>
      request<{ status: string; updatedCount: number }>(`/chapters/${id}/auto-crop`, {
        method: 'POST',
      }),
  },
  panels: {
    list: (chapterId: string, includeDeleted?: boolean) =>
      request<any[]>(`/chapters/${chapterId}/panels${includeDeleted ? '?includeDeleted=true' : ''}`),
    crop: (id: string, cropBox: { x: number; y: number; width: number; height: number } | null) =>
      request<any>(`/panels/${id}/crop`, {
        method: 'PATCH',
        body: JSON.stringify({ cropBox }),
      }),
    split: (id: string, splitY: number) =>
      request<any>(`/panels/${id}/split`, {
        method: 'POST',
        body: JSON.stringify({ splitY }),
      }),
    merge: (panelIds: string[]) =>
      request<any>(`/panels/merge`, {
        method: 'POST',
        body: JSON.stringify({ panelIds }),
      }),
    delete: (id: string) =>
      request<any>(`/panels/${id}`, {
        method: 'DELETE',
      }),
    restore: (id: string) =>
      request<any>(`/panels/${id}/restore`, {
        method: 'POST',
      }),
    duplicate: (id: string) =>
      request<any>(`/panels/${id}/duplicate`, {
        method: 'POST',
      }),
    detect: (id: string) =>
      request<{
        status: string;
        panels: { x: number; y: number; width: number; height: number }[];
        dialogues: { x: number; y: number; width: number; height: number }[];
        smart_crops: { x: number; y: number; width: number; height: number }[];
      }>(`/panels/${id}/detect`, {
        method: 'POST',
      }),
  },
};
