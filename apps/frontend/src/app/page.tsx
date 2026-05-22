'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useProjectStore, Project } from '@/store/projectStore';
import { Plus, Trash2, Edit3, Folder, Calendar, Clock, ChevronRight, LayoutGrid } from 'lucide-react';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    activeProjectId,
    setActiveProjectId,
    activeProject,
    setActiveProject,
    setActiveChapterId,
  } = useProjectStore();

  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editProjectName, setEditProjectName] = useState('');

  // Queries
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  });

  // Fetch single project details when selected
  useQuery({
    queryKey: ['project', activeProjectId],
    queryFn: async () => {
      const data = await api.projects.get(activeProjectId!);
      setActiveProject(data);
      return data;
    },
    enabled: !!activeProjectId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: api.projects.create,
    onSuccess: (newProj) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setNewProjectName('');
      setIsCreating(false);
      setActiveProjectId(newProj.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.projects.update(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (activeProject && activeProject.id === editingProjectId) {
        setActiveProject({ ...activeProject, name: editProjectName });
      }
      setEditingProjectId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.projects.delete,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (activeProjectId === deletedId) {
        setActiveProjectId(null);
        setActiveProject(null);
      }
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    createMutation.mutate(newProjectName);
  };

  const handleRename = (id: string, name: string) => {
    if (!name.trim()) return;
    updateMutation.mutate({ id, name });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project and all its files? This action cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const selectedProj = projects.find(p => p.id === activeProjectId) || activeProject;

  return (
    <div className="flex flex-col h-screen bg-neutral-950 font-sans antialiased text-neutral-200">
      {/* Premium Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 shadow-lg shadow-indigo-500/20">
            <LayoutGrid className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
              Webtoon Studio Pro
            </h1>
            <p className="text-xs text-neutral-500">Panel Slicing & Correction Engine</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-1.5 rounded-md border border-neutral-800">
            Local Storage Node
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Projects */}
        <aside className="w-80 border-r border-neutral-800 bg-neutral-900/25 flex flex-col">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/10">
            <h2 className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">Projects</h2>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="p-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 transition-colors"
              title="New Project"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Create project form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 border-b border-neutral-800 bg-neutral-900/40">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project Name..."
                className="w-full px-3 py-2 text-sm bg-neutral-950 border border-neutral-800 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-500 text-white placeholder-neutral-600 mb-2"
                required
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-2.5 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          )}

          {/* Projects List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {isLoading ? (
              <div className="text-sm text-neutral-500 text-center py-8">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-neutral-600 text-center py-8">No projects found. Create one to begin.</div>
            ) : (
              projects.map((project) => {
                const isActive = project.id === activeProjectId;
                const isEditing = project.id === editingProjectId;
                return (
                  <div
                    key={project.id}
                    onClick={() => {
                      if (!isEditing) {
                        setActiveProjectId(project.id);
                      }
                    }}
                    className={`group relative p-3 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                      isActive
                        ? 'bg-neutral-800/40 border-violet-500/50 shadow-md shadow-violet-500/5'
                        : 'bg-neutral-900/10 border-neutral-900 hover:bg-neutral-900/40 hover:border-neutral-800'
                    }`}
                  >
                    {isEditing ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editProjectName}
                          onChange={(e) => setEditProjectName(e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-neutral-950 border border-neutral-800 rounded text-white focus:outline-none focus:ring-1 focus:ring-violet-500 mb-2"
                        />
                        <div className="flex justify-end space-x-1.5">
                          <button
                            onClick={() => setEditingProjectId(null)}
                            className="px-2 py-1 text-2xs text-neutral-400 hover:text-neutral-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleRename(project.id, editProjectName)}
                            className="px-2 py-1 text-2xs bg-violet-600 text-white rounded hover:bg-violet-500"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2.5">
                            <Folder className={`w-4.5 h-4.5 ${isActive ? 'text-violet-400' : 'text-neutral-500'}`} />
                            <span className={`text-sm font-medium transition-colors ${isActive ? 'text-neutral-100' : 'text-neutral-300'}`}>
                              {project.name}
                            </span>
                          </div>
                          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity space-x-1 absolute right-2 top-2 bg-neutral-900/90 rounded border border-neutral-800 p-0.5 shadow-lg">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProjectId(project.id);
                                setEditProjectName(project.name);
                              }}
                              className="p-1 rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                              title="Rename"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(project.id, e)}
                              className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-neutral-800"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 mt-2 text-3xs text-neutral-500">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {new Date(project.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </span>
                          <span>{project._count?.chapters || 0} chapters</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Main Display Panel */}
        <main className="flex-1 bg-neutral-950 flex flex-col overflow-y-auto">
          {selectedProj ? (
            <div className="p-8 max-w-4xl w-full mx-auto space-y-8">
              {/* Project Header section */}
              <div className="flex items-center justify-between pb-6 border-b border-neutral-900">
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">{selectedProj.name}</h2>
                  <div className="flex items-center space-x-3 text-xs text-neutral-500 mt-2">
                    <span className="bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded">
                      ID: {selectedProj.id}
                    </span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Created {new Date(selectedProj.createdAt).toLocaleDateString()}</span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    router.push('/workspace');
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg font-medium text-sm shadow-lg shadow-violet-500/25 transition-all flex items-center space-x-2"
                >
                  <span>Open Workspace</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Chapters list block */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-neutral-300">Chapters</h3>
                  <button
                    onClick={() => {
                      router.push('/workspace');
                    }}
                    className="text-xs text-violet-400 hover:text-violet-300 font-medium flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Import Chapter</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedProj.chapters && selectedProj.chapters.length > 0 ? (
                    selectedProj.chapters.map((chapter) => (
                      <div
                        key={chapter.id}
                        onClick={() => {
                          setActiveChapterId(chapter.id);
                          router.push('/workspace');
                        }}
                        className="bg-neutral-900/30 border border-neutral-900 hover:border-neutral-800 p-4 rounded-xl flex items-center justify-between transition-colors group cursor-pointer"
                      >
                        <div>
                          <h4 className="text-sm font-semibold text-neutral-200 group-hover:text-white transition-colors">
                            {chapter.title}
                          </h4>
                          <span className={`inline-block text-3xs font-medium px-2 py-0.5 rounded-full mt-2 border ${
                            chapter.status === 'SLICED'
                              ? 'bg-emerald-950/30 border-emerald-800 text-emerald-400'
                              : chapter.status === 'PENDING'
                              ? 'bg-amber-950/30 border-amber-800 text-amber-400'
                              : 'bg-red-950/30 border-red-800 text-red-400'
                          }`}>
                            {chapter.status}
                          </span>
                        </div>
                        <div className="text-3xs text-neutral-500 text-right">
                          <p>{chapter._count?.panels || 0} panels</p>
                          <p className="mt-1">{new Date(chapter.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 bg-neutral-900/10 border border-dashed border-neutral-800/60 rounded-xl p-8 text-center text-sm text-neutral-500">
                      No chapters imported yet. Import raw images or a ZIP archive to run automatic panel detection.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6 text-neutral-500 shadow-inner">
                <Folder className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">No Project Selected</h2>
              <p className="text-sm text-neutral-500 max-w-sm">
                Select an existing project from the sidebar list or create a new project to start slicing chapters.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
