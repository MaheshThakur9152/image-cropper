import { create } from 'zustand';

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  chapters?: Chapter[];
  _count?: {
    chapters: number;
  };
}

export interface Chapter {
  id: string;
  projectId: string;
  title: string;
  status: 'PENDING' | 'SLICED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  panels?: Panel[];
  _count?: {
    panels: number;
  };
}

export interface Panel {
  id: string;
  chapterId: string;
  panelNumber: number;
  filePath: string;
  width: number;
  height: number;
  cropBox: string | null; // stringified JSON
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  activeProject: Project | null;
  activeChapterId: string | null;
  activeChapter: Chapter | null;
  setProjects: (projects: Project[]) => void;
  setActiveProjectId: (id: string | null) => void;
  setActiveProject: (project: Project | null) => void;
  setActiveChapterId: (id: string | null) => void;
  setActiveChapter: (chapter: Chapter | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  activeProject: null,
  activeChapterId: null,
  activeChapter: null,
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setActiveProject: (project) => set({ activeProject: project }),
  setActiveChapterId: (id) => set({ activeChapterId: id }),
  setActiveChapter: (chapter) => set({ activeChapter: chapter }),
}));
