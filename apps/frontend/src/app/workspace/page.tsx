'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/lib/api';
import { useProjectStore, Project, Chapter, Panel } from '@/store/projectStore';
import {
  ArrowLeft,
  Settings,
  FolderOpen,
  Scissors,
  Crop,
  Layers,
  ChevronRight,
  Eye,
  Trash,
  Plus,
  RefreshCw,
  Undo2,
  Redo2,
  Square,
  CheckSquare,
  Download,
  FileJson,
  EyeOff
} from 'lucide-react';
import Link from 'next/link';

interface UndoAction {
  type: 'crop' | 'split' | 'merge' | 'delete';
  panelId?: string;
  panelIds?: string[];
  previousCropBox?: string | null;
  originalPanelId?: string;
  originalPanelIds?: string[];
  createdPanelIds?: string[];
}

export default function Workspace() {
  const queryClient = useQueryClient();

  // Selected project/chapter from global store
  const {
    activeProjectId,
    setActiveProjectId,
    activeProject,
    setActiveProject,
    activeChapterId,
    setActiveChapterId,
  } = useProjectStore();

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  // Import chapter states
  const [isImporting, setIsImporting] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('');
  const [importPath, setImportPath] = useState('');
  const [heightSetting, setHeightSetting] = useState(2000);
  const [sensitivitySetting, setSensitivitySetting] = useState(90);

  // Filtering states
  const [showDeleted, setShowDeleted] = useState(false);
  const [showCroppedOnly, setShowCroppedOnly] = useState(false);

  // Multi-select for merging
  const [selectedPanels, setSelectedPanels] = useState<string[]>([]);

  // Crop / Split modal states
  const [croppingPanel, setCroppingPanel] = useState<Panel | null>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropW, setCropW] = useState(0);
  const [cropH, setCropH] = useState(0);

  const [splittingPanel, setSplittingPanel] = useState<Panel | null>(null);
  const [splitY, setSplitY] = useState(0);

  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);

  // Queries
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: api.projects.list,
  });

  // Fetch project details (for chapters list)
  const { data: projectDetails } = useQuery<Project>({
    queryKey: ['project', activeProjectId],
    queryFn: async () => {
      const data = await api.projects.get(activeProjectId!);
      setActiveProject(data);
      return data;
    },
    enabled: !!activeProjectId,
  });

  // Fetch panels when chapter or filters change
  const { data: panels = [], isLoading: isLoadingPanels } = useQuery<Panel[]>({
    queryKey: ['panels', activeChapterId, showDeleted],
    queryFn: () => api.panels.list(activeChapterId!, showDeleted),
    enabled: !!activeChapterId,
  });

  // Filter panels locally for cropped-only mode
  const displayedPanels = showCroppedOnly
    ? panels.filter((p) => p.cropBox !== null)
    : panels;
  // Mutations
  const importChapterMutation = useMutation({
    mutationFn: ({ projId, title, path, h, s }: { projId: string; title: string; path: string; h: number; s: number }) =>
      api.chapters.create(projId, title, path, h, s),
    onSuccess: (newChap) => {
      queryClient.invalidateQueries({ queryKey: ['project', activeProjectId] });
      setIsImporting(false);
      setChapterTitle('');
      setImportPath('');
      setActiveChapterId(newChap.id);
      setUndoStack([]);
      setRedoStack([]);
    },
    onError: (err: any) => {
      alert(`Import failed: ${err.message || 'Unknown error'}`);
    },
  });

  const deleteChapterMutation = useMutation({
    mutationFn: api.chapters.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', activeProjectId] });
      setActiveChapterId(null);
      setSelectedPanelId(null);
      setUndoStack([]);
      setRedoStack([]);
    },
    onError: (err: any) => {
      alert(`Failed to delete chapter: ${err.message || 'Unknown error'}`);
    },
  });

  const cropMutation = useMutation({
    mutationFn: ({ id, cropBox }: { id: string; cropBox: any }) => api.panels.crop(id, cropBox),
    onSuccess: (updatedPanel) => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
      setCroppingPanel(null);
    },
    onError: (err: any) => {
      alert(`Failed to crop panel: ${err.message || 'Unknown error'}`);
    },
  });

  const splitMutation = useMutation({
    mutationFn: ({ id, splitY }: { id: string; splitY: number }) => api.panels.split(id, splitY),
    onSuccess: (newPanel1) => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
      setSplittingPanel(null);
    },
    onError: (err: any) => {
      alert(`Failed to split panel: ${err.message || 'Unknown error'}`);
    },
  });

  const mergeMutation = useMutation({
    mutationFn: (panelIds: string[]) => api.panels.merge(panelIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
      setSelectedPanels([]);
    },
    onError: (err: any) => {
      alert(`Failed to merge panels: ${err.message || 'Unknown error'}`);
    },
  });

  const deletePanelMutation = useMutation({
    mutationFn: api.panels.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
    },
    onError: (err: any) => {
      alert(`Failed to delete panel: ${err.message || 'Unknown error'}`);
    },
  });

  const restorePanelMutation = useMutation({
    mutationFn: api.panels.restore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
    },
    onError: (err: any) => {
      alert(`Failed to restore panel: ${err.message || 'Unknown error'}`);
    },
  });


  const exportChapterMutation = useMutation({
    mutationFn: api.chapters.export,
    onSuccess: (data) => {
      alert(`Chapter exported successfully!\nPanels count: ${data.totalPanels}\nExport path: ${data.exportPath}`);
    },
    onError: (err) => {
      alert(`Export failed: ${err.message}`);
    },
  });

  // Undo / Redo Actions Helper
  const pushToUndo = (action: UndoAction) => {
    setUndoStack((prev) => [...prev, action]);
    setRedoStack([]); // Clear redo stack on new action
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, action]);

    try {
      if (action.type === 'crop' && action.panelId) {
        await api.panels.crop(action.panelId, action.previousCropBox ? JSON.parse(action.previousCropBox) : null);
      } else if (action.type === 'delete' && action.panelId) {
        await api.panels.restore(action.panelId);
      } else if (action.type === 'split' && action.originalPanelId) {
        // Rollback split: restore original panel, delete part 1 & part 2
        await api.panels.restore(action.originalPanelId);
        if (action.createdPanelIds) {
          for (const id of action.createdPanelIds) {
            await api.panels.delete(id);
          }
        }
      } else if (action.type === 'merge' && action.originalPanelIds && action.panelId) {
        // Rollback merge: restore original panels, delete merged panel
        await api.panels.delete(action.panelId);
        for (const id of action.originalPanelIds) {
          await api.panels.restore(id);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
    } catch (err: any) {
      alert(`Undo failed: ${err.message}`);
    }
  };

  // Setup virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: displayedPanels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400,
    overscan: 5,
  });

  const activePanel = panels.find((p) => p.id === selectedPanelId);
  const chapters = projectDetails?.chapters || [];

  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !chapterTitle.trim() || !importPath.trim()) return;
    importChapterMutation.mutate({
      projId: activeProjectId,
      title: chapterTitle,
      path: importPath,
      h: heightSetting,
      s: sensitivitySetting
    });
  };

  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chapter and all its panel slices?')) {
      deleteChapterMutation.mutate(id);
    }
  };

  // Launch Crop Modal
  const openCropModal = (panel: Panel) => {
    setCroppingPanel(panel);
    if (panel.cropBox) {
      const box = JSON.parse(panel.cropBox);
      setCropX(box.x);
      setCropY(box.y);
      setCropW(box.width);
      setCropH(box.height);
    } else {
      setCropX(0);
      setCropY(0);
      setCropW(panel.width);
      setCropH(panel.height);
    }
  };

  const handleCropSave = () => {
    if (!croppingPanel) return;
    pushToUndo({
      type: 'crop',
      panelId: croppingPanel.id,
      previousCropBox: croppingPanel.cropBox
    });
    cropMutation.mutate({
      id: croppingPanel.id,
      cropBox: { x: cropX, y: cropY, width: cropW, height: cropH }
    });
  };

  // Launch Split Modal
  const openSplitModal = (panel: Panel) => {
    setSplittingPanel(panel);
    setSplitY(Math.floor(panel.height / 2));
  };

  const handleSplitExecute = async () => {
    if (!splittingPanel) return;

    // Track state to allow rollback
    const panelsBefore = await api.panels.list(activeChapterId!, false);

    splitMutation.mutate(
      { id: splittingPanel.id, splitY },
      {
        onSuccess: async (data) => {
          const panelsAfter = await api.panels.list(activeChapterId!, false);
          // Find the new created panel IDs
          const beforeIds = new Set(panelsBefore.map((p) => p.id));
          const createdPanelIds = panelsAfter.filter((p) => !beforeIds.has(p.id)).map((p) => p.id);

          pushToUndo({
            type: 'split',
            originalPanelId: splittingPanel.id,
            createdPanelIds
          });
        }
      }
    );
  };

  // Perform Merge
  const handleMergeExecute = async () => {
    if (selectedPanels.length < 2) return;
    const panelsBefore = await api.panels.list(activeChapterId!, false);

    mergeMutation.mutate(selectedPanels, {
      onSuccess: async (newMergedPanel) => {
        const panelsAfter = await api.panels.list(activeChapterId!, false);
        const beforeIds = new Set(panelsBefore.map((p) => p.id));
        const created = panelsAfter.find((p) => !beforeIds.has(p.id));

        pushToUndo({
          type: 'merge',
          originalPanelIds: [...selectedPanels],
          panelId: created?.id
        });
      },
      onError: (err: any) => {
        alert(`Merge failed: ${err.message}`);
      }
    });
  };

  // Perform Soft Delete
  const handlePanelDelete = (panel: Panel) => {
    pushToUndo({
      type: 'delete',
      panelId: panel.id
    });
    deletePanelMutation.mutate(panel.id);
  };

  // Handle Export Metadata
  const handleDownloadMetadata = async () => {
    if (!activeProjectId) return;
    try {
      const data = await api.projects.metadata(activeProjectId);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `metadata_${activeProject?.name || 'project'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      alert(`Failed to fetch metadata: ${err.message}`);
    }
  };

  // Toggle selection for Merge
  const togglePanelSelection = (id: string) => {
    setSelectedPanels((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-200 antialiased font-sans overflow-hidden">
      {/* Workspace Subheader */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-900 bg-neutral-900/40 sticky top-0 z-30">
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>
          <span className="text-neutral-700">|</span>
          <div className="flex items-center space-x-2">
            <FolderOpen className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold text-neutral-300">
              {projectDetails?.name || 'No Project'}
            </span>
            {activeChapterId && (
              <>
                <ChevronRight className="w-3 h-3 text-neutral-600" />
                <span className="text-xs text-neutral-400">
                  {chapters.find((c) => c.id === activeChapterId)?.title || 'No Chapter'}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Global Export Buttons */}
        <div className="flex items-center space-x-3">
          {activeProjectId && (
            <button
              onClick={handleDownloadMetadata}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 rounded border border-neutral-800 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              title="Download Project Metadata"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Metadata JSON</span>
            </button>
          )}

          {activeChapterId && (
            <button
              onClick={() => exportChapterMutation.mutate(activeChapterId)}
              disabled={exportChapterMutation.isPending || panels.length === 0}
              className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded text-xs font-semibold shadow transition-all flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{exportChapterMutation.isPending ? 'Exporting...' : 'Export Chapter'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Panel Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Projects, Chapters, Filters */}
        <aside className="w-72 border-r border-neutral-900 bg-neutral-900/20 flex flex-col">
          {/* Projects Select */}
          <div className="p-4 border-b border-neutral-900 bg-neutral-950/20">
            <label className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Active Project</label>
            <select
              value={activeProjectId || ''}
              onChange={(e) => {
                setActiveProjectId(e.target.value || null);
                setActiveChapterId(null);
                setSelectedPanelId(null);
                setSelectedPanels([]);
                setUndoStack([]);
                setRedoStack([]);
              }}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-md text-xs py-2 px-3 text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="">Select a project...</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Chapters List */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-4 flex items-center justify-between border-b border-neutral-900">
              <span className="text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Chapters</span>
              {activeProjectId && (
                <button
                  onClick={() => setIsImporting(!isImporting)}
                  className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 transition-colors"
                  title="Import Chapter"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Import chapter parameters */}
            {isImporting && activeProjectId && (
              <form onSubmit={handleImportSubmit} className="p-4 border-b border-neutral-900 bg-neutral-900/50 space-y-3 max-h-80 overflow-y-auto">
                <div>
                  <label className="block text-3xs font-semibold text-neutral-500 mb-1">Chapter Title</label>
                  <input
                    type="text"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    placeholder="e.g. Chapter 01"
                    className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-3xs font-semibold text-neutral-500 mb-1">Folder or ZIP path</label>
                  <input
                    type="text"
                    value={importPath}
                    onChange={(e) => setImportPath(e.target.value)}
                    placeholder="e.g. D:/raws/ch1.zip"
                    className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-3xs font-semibold text-neutral-500 mb-1">Slice H (px)</label>
                    <input
                      type="number"
                      value={heightSetting}
                      onChange={(e) => setHeightSetting(parseInt(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-3xs font-semibold text-neutral-500 mb-1">Sens (1-100)</label>
                    <input
                      type="number"
                      value={sensitivitySetting}
                      onChange={(e) => setSensitivitySetting(parseInt(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsImporting(false)}
                    className="px-2 py-1 text-2xs text-neutral-400 hover:text-neutral-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importChapterMutation.isPending}
                    className="px-2.5 py-1 text-2xs bg-violet-600 hover:bg-violet-500 text-white rounded transition-colors"
                  >
                    {importChapterMutation.isPending ? 'Slicing...' : 'Run Slicer'}
                  </button>
                </div>
              </form>
            )}

            {/* Chapters list box */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!activeProjectId ? (
                <div className="text-center text-3xs text-neutral-600 py-6">Select project to view chapters</div>
              ) : chapters.length === 0 ? (
                <div className="text-center text-3xs text-neutral-600 py-6">No chapters. Import one.</div>
              ) : (
                chapters.map((c) => {
                  const isActive = c.id === activeChapterId;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        setActiveChapterId(c.id);
                        setSelectedPanelId(null);
                        setSelectedPanels([]);
                        setUndoStack([]);
                        setRedoStack([]);
                      }}
                      className={`group flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-neutral-800/60 text-white border border-neutral-800'
                          : 'hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <span className="text-xs truncate font-medium">{c.title}</span>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-4xs px-1.5 py-0.5 rounded-full border ${
                          c.status === 'SLICED'
                            ? 'bg-emerald-950/20 border-emerald-900 text-emerald-400'
                            : c.status === 'FAILED'
                            ? 'bg-red-950/20 border-red-900 text-red-400'
                            : 'bg-amber-950/20 border-amber-900 text-amber-400'
                        }`}>
                          {c.status}
                        </span>
                        <button
                          onClick={(e) => handleDeleteChapter(c.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-all"
                          title="Delete Chapter"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Filters */}
            <div className="p-4 border-t border-neutral-900 bg-neutral-950/10 space-y-3">
              <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Filters & Visibility</span>
              <label className="flex items-center space-x-2 text-xs text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => {
                    setShowDeleted(e.target.checked);
                    setSelectedPanelId(null);
                  }}
                  className="rounded border-neutral-800 bg-neutral-950 text-violet-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Show Deleted Panels</span>
              </label>

              <label className="flex items-center space-x-2 text-xs text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showCroppedOnly}
                  onChange={(e) => {
                    setShowCroppedOnly(e.target.checked);
                    setSelectedPanelId(null);
                  }}
                  className="rounded border-neutral-800 bg-neutral-950 text-violet-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Show Cropped Only</span>
              </label>
            </div>
          </div>
        </aside>

        {/* Center: Virtualized Panel List */}
        <section className="flex-1 bg-neutral-950 border-r border-neutral-900 flex flex-col min-w-0">
          {!activeChapterId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-600">
              <Eye className="w-12 h-12 mb-4 text-neutral-700" />
              <p className="text-sm">Select a Chapter to display detected panels</p>
            </div>
          ) : isLoadingPanels ? (
            <div className="flex-1 flex items-center justify-center space-x-2 text-sm text-neutral-400">
              <RefreshCw className="w-4 h-4 animate-spin text-violet-400" />
              <span>Loading panels...</span>
            </div>
          ) : displayedPanels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-600">
              <Scissors className="w-12 h-12 mb-4 text-neutral-700" />
              <p className="text-sm">No panels found. Import a chapter or check filters.</p>
            </div>
          ) : (
            <div
              ref={parentRef}
              className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
            >
              <div
                className="w-full relative"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const panel = displayedPanels[virtualRow.index];
                  const isSelected = panel.id === selectedPanelId;
                  const isChecked = selectedPanels.includes(panel.id);
                  const imageUrl = `http://localhost:4000/${panel.filePath}`;

                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="pb-4 px-2"
                    >
                      <div
                        onClick={() => setSelectedPanelId(panel.id)}
                        className={`flex bg-neutral-900/30 border rounded-xl overflow-hidden cursor-pointer transition-all hover:bg-neutral-900/50 hover:border-neutral-800 h-[380px] ${
                          isSelected
                            ? 'border-violet-500/60 shadow-lg shadow-violet-500/5 bg-neutral-900/60'
                            : 'border-neutral-900'
                        } ${panel.isDeleted ? 'opacity-40 border-red-900/40 bg-red-950/5' : ''}`}
                      >
                        {/* Selector checkbox */}
                        <div
                          className="flex items-center justify-center px-3 border-r border-neutral-900/50 bg-neutral-950/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!panel.isDeleted) {
                              togglePanelSelection(panel.id);
                            }
                          }}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-violet-500" />
                          ) : (
                            <Square className="w-4 h-4 text-neutral-700 hover:text-neutral-500" />
                          )}
                        </div>

                        {/* Thumbnail Viewport with non-destructive crop bounds */}
                        <div className="w-72 bg-neutral-950 flex items-center justify-center p-4 border-r border-neutral-900 relative group/thumb">
                          {panel.cropBox ? (
                            (() => {
                              const box = JSON.parse(panel.cropBox);
                              const thumbW = 200;
                              const scale = thumbW / box.width;
                              const wScaled = panel.width * scale;
                              const hScaled = panel.height * scale;
                              const leftScaled = -box.x * scale;
                              const topScaled = -box.y * scale;

                              return (
                                <div
                                  style={{
                                    width: thumbW,
                                    height: box.height * scale,
                                    overflow: 'hidden',
                                    position: 'relative',
                                  }}
                                  className="rounded shadow-lg border border-neutral-800"
                                >
                                  <img
                                    src={imageUrl}
                                    alt={`Panel ${panel.panelNumber}`}
                                    style={{
                                      width: wScaled,
                                      height: hScaled,
                                      position: 'absolute',
                                      left: leftScaled,
                                      top: topScaled,
                                      maxWidth: 'none',
                                    }}
                                    loading="lazy"
                                  />
                                </div>
                              );
                            })()
                          ) : (
                            <img
                              src={imageUrl}
                              alt={`Panel ${panel.panelNumber}`}
                              className="max-h-full max-w-full object-contain rounded-md shadow-inner transition-transform group-hover/thumb:scale-102"
                              loading="lazy"
                            />
                          )}
                        </div>

                        {/* Panel Details */}
                        <div className="flex-1 p-6 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <h4 className="text-base font-bold text-white tracking-wide">
                                Panel #{String(panel.panelNumber).padStart(3, '0')}
                              </h4>
                              <div className="flex space-x-1.5">
                                {panel.isDeleted && (
                                  <span className="text-4xs px-2 py-0.5 rounded border bg-red-950/20 border-red-900 text-red-400">
                                    Deleted
                                  </span>
                                )}
                                <span className={`text-4xs px-2 py-0.5 rounded border ${
                                  panel.cropBox
                                    ? 'bg-amber-950/20 border-amber-900 text-amber-400'
                                    : 'bg-neutral-900 border-neutral-800 text-neutral-500'
                                }`}>
                                  {panel.cropBox ? 'Cropped' : 'Original'}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                              <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-900">
                                <span className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">Dimensions</span>
                                <span className="text-sm font-semibold text-neutral-300">
                                  {panel.width} × {panel.height} px
                                </span>
                              </div>
                              <div className="bg-neutral-900/50 rounded-lg p-3 border border-neutral-900">
                                <span className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">Cropped Area</span>
                                <span className="text-xs font-semibold text-neutral-400">
                                  {panel.cropBox ? (
                                    (() => {
                                      const box = JSON.parse(panel.cropBox);
                                      return `${box.width} × ${box.height} px`;
                                    })()
                                  ) : (
                                    'None'
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-4xs text-neutral-500 pt-4 border-t border-neutral-900/40">
                            <span>ID: {panel.id}</span>
                            <span>{new Date(panel.createdAt).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right Side Settings & Action Bar */}
        <aside className="w-80 border-l border-neutral-900 bg-neutral-900/20 p-6 flex flex-col justify-between">
          <div className="space-y-6">
            {/* Undo / Redo Toolbar */}
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <span className="text-xs font-semibold text-neutral-400">History</span>
              <div className="flex space-x-1">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="p-1 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-900 transition-colors"
                  title="Undo"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Merge Action Box */}
            {selectedPanels.length >= 2 && (
              <div className="bg-violet-950/20 border border-violet-850 p-4 rounded-xl space-y-3">
                <div>
                  <h4 className="text-xs font-bold text-violet-300 flex items-center space-x-1">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Merge Selected Panels</span>
                  </h4>
                  <p className="text-3xs text-violet-400 mt-1">
                    Combine {selectedPanels.length} panels into a single vertical strip.
                  </p>
                </div>
                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => setSelectedPanels([])}
                    className="flex-1 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 rounded text-3xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleMergeExecute}
                    className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded text-3xs font-semibold transition-colors"
                  >
                    Merge
                  </button>
                </div>
              </div>
            )}

            {/* Edit Tools */}
            {activePanel ? (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Panel Editor</h3>
                  <p className="text-3xs text-neutral-500 mt-1">Properties for Panel #{String(activePanel.panelNumber).padStart(3, '0')}</p>
                </div>

                {/* Operations tools */}
                {!activePanel.isDeleted ? (
                  <div className="space-y-3">
                    <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Manual Correction</span>
                    <div className="grid grid-cols-1 gap-2.5">
                      <button
                        onClick={() => openCropModal(activePanel)}
                        className="flex items-center space-x-3 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition-colors"
                      >
                        <Crop className="w-4 h-4 text-violet-400" />
                        <span>Crop Panel</span>
                      </button>
                      <button
                        onClick={() => openSplitModal(activePanel)}
                        className="flex items-center space-x-3 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition-colors"
                      >
                        <Scissors className="w-4 h-4 text-violet-400" />
                        <span>Split Panel</span>
                      </button>
                      <button
                        onClick={() => handlePanelDelete(activePanel)}
                        className="flex items-center space-x-3 px-4 py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-900/50 rounded-lg text-xs font-semibold text-red-400 transition-all"
                      >
                        <Trash className="w-4 h-4 text-red-450" />
                        <span>Delete Panel</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Deleted State</span>
                    <button
                      onClick={() => restorePanelMutation.mutate(activePanel.id)}
                      className="w-full flex items-center justify-center space-x-2 py-2 bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-950/50 text-emerald-400 rounded-lg text-xs font-semibold transition-all"
                    >
                      <RefreshCw className="w-4 h-4 text-emerald-450" />
                      <span>Restore Panel</span>
                    </button>
                  </div>
                )}

                {/* Crop Coordinates metadata display */}
                {activePanel.cropBox && (
                  <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Crop Coordinates</span>
                      <button
                        onClick={() => {
                          pushToUndo({ type: 'crop', panelId: activePanel.id, previousCropBox: activePanel.cropBox });
                          api.panels.crop(activePanel.id, null).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
                          });
                        }}
                        className="text-4xs text-red-450 hover:underline"
                      >
                        Clear Crop
                      </button>
                    </div>
                    <pre className="text-4xs text-neutral-400 bg-neutral-950 p-2.5 rounded border border-neutral-900 overflow-x-auto">
                      {JSON.stringify(JSON.parse(activePanel.cropBox), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-neutral-600 py-12">
                <Settings className="w-8 h-8 mb-3 text-neutral-700 mx-auto" />
                <p className="text-xs">Select a panel row to display manual tools and properties</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-neutral-900 text-center text-4xs text-neutral-600">
            Webtoon Studio Pro Slicer v1.0
          </div>
        </aside>
      </div>

      {/* Visual Crop Modal */}
      {croppingPanel && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col h-[85vh]">
            <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950/40">
              <div>
                <h3 className="text-sm font-bold text-white">Manual Crop Tool</h3>
                <p className="text-3xs text-neutral-500">Selected panel original resolution: {croppingPanel.width} × {croppingPanel.height} px</p>
              </div>
              <button
                onClick={() => setCroppingPanel(null)}
                className="px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Close
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left Viewport */}
              <div className="flex-1 bg-neutral-950 p-6 flex items-center justify-center relative overflow-hidden">
                <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${croppingPanel.width}/${croppingPanel.height}` }}>
                  <img
                    src={`http://localhost:4000/${croppingPanel.filePath}`}
                    alt="Crop workspace"
                    className="max-h-[50vh] object-contain rounded border border-neutral-850"
                  />

                  {/* Visual Crop Bounding Box overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${(cropX / croppingPanel.width) * 100}%`,
                      top: `${(cropY / croppingPanel.height) * 100}%`,
                      width: `${(cropW / croppingPanel.width) * 100}%`,
                      height: `${(cropH / croppingPanel.height) * 100}%`,
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                      border: '2px dashed #8b5cf6',
                    }}
                    className="pointer-events-none"
                  >
                    <div className="absolute right-2 bottom-2 bg-violet-600 text-white font-bold text-4xs px-1.5 py-0.5 rounded shadow">
                      {cropW} × {cropH}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Sliders and controls */}
              <div className="w-80 border-l border-neutral-800 bg-neutral-950/20 p-6 space-y-6 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-5">
                  <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Crop Boundaries</span>

                  {/* Y Sliders */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-3xs">
                      <span className="text-neutral-400">Y Offset (Top)</span>
                      <span className="font-semibold text-violet-400">{cropY} px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={croppingPanel.height - 10}
                      value={cropY}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setCropY(val);
                        if (val + cropH > croppingPanel.height) {
                          setCropH(croppingPanel.height - val);
                        }
                      }}
                      className="w-full accent-violet-600 bg-neutral-800"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-3xs">
                      <span className="text-neutral-400">Crop Height</span>
                      <span className="font-semibold text-violet-400">{cropH} px</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={croppingPanel.height - cropY}
                      value={cropH}
                      onChange={(e) => setCropH(parseInt(e.target.value))}
                      className="w-full accent-violet-600 bg-neutral-800"
                    />
                  </div>

                  {/* X Sliders */}
                  <div className="space-y-2 border-t border-neutral-900 pt-4">
                    <div className="flex justify-between text-3xs">
                      <span className="text-neutral-400">X Offset (Left)</span>
                      <span className="font-semibold text-violet-400">{cropX} px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={croppingPanel.width - 10}
                      value={cropX}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setCropX(val);
                        if (val + cropW > croppingPanel.width) {
                          setCropW(croppingPanel.width - val);
                        }
                      }}
                      className="w-full accent-violet-600 bg-neutral-800"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-3xs">
                      <span className="text-neutral-400">Crop Width</span>
                      <span className="font-semibold text-violet-400">{cropW} px</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={croppingPanel.width - cropX}
                      value={cropW}
                      onChange={(e) => setCropW(parseInt(e.target.value))}
                      className="w-full accent-violet-600 bg-neutral-800"
                    />
                  </div>

                  {/* Text Input Row */}
                  <div className="grid grid-cols-2 gap-2 border-t border-neutral-900 pt-4">
                    <div>
                      <label className="block text-4xs text-neutral-500 mb-1">X Offset</label>
                      <input
                        type="number"
                        value={cropX}
                        onChange={(e) => setCropX(Math.min(croppingPanel.width - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                      />
                    </div>
                    <div>
                      <label className="block text-4xs text-neutral-500 mb-1">Y Offset</label>
                      <input
                        type="number"
                        value={cropY}
                        onChange={(e) => setCropY(Math.min(croppingPanel.height - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 pt-4 border-t border-neutral-900">
                  <button
                    onClick={() => {
                      setCropX(0);
                      setCropY(0);
                      setCropW(croppingPanel.width);
                      setCropH(croppingPanel.height);
                    }}
                    className="flex-1 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 rounded text-xs font-semibold transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleCropSave}
                    className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded text-xs font-semibold transition-colors animate-pulse-subtle"
                  >
                    Apply Crop
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Split Modal */}
      {splittingPanel && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col h-[85vh]">
            <div className="px-6 py-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-950/40">
              <div>
                <h3 className="text-sm font-bold text-white">Manual Split Tool</h3>
                <p className="text-3xs text-neutral-500">Divide this panel strip horizontally into two segments.</p>
              </div>
              <button
                onClick={() => setSplittingPanel(null)}
                className="px-3 py-1 text-xs text-neutral-400 hover:text-neutral-200"
              >
                Close
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left Viewport */}
              <div className="flex-1 bg-neutral-950 p-6 flex items-center justify-center relative overflow-hidden">
                <div className="relative max-h-full max-w-full" style={{ aspectRatio: `${splittingPanel.width}/${splittingPanel.height}` }}>
                  <img
                    src={`http://localhost:4000/${splittingPanel.filePath}`}
                    alt="Split workspace"
                    className="max-h-[50vh] object-contain rounded border border-neutral-850"
                  />

                  {/* Horizontal Red Split Guidelines Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: `${(splitY / splittingPanel.height) * 100}%`,
                      borderTop: '2px dashed #ef4444',
                    }}
                    className="pointer-events-none"
                  >
                    <div className="absolute right-2 bg-red-650 text-white font-bold text-4xs px-1.5 py-0.5 rounded shadow">
                      Cut Point: {splitY} px
                    </div>
                  </div>
                </div>
              </div>

              {/* Right controls */}
              <div className="w-80 border-l border-neutral-800 bg-neutral-950/20 p-6 flex flex-col justify-between">
                <div className="space-y-4">
                  <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Split guideline position</span>
                  <div className="space-y-2">
                    <div className="flex justify-between text-3xs">
                      <span className="text-neutral-400">Y-Coordinate</span>
                      <span className="font-semibold text-red-400">{splitY} px</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={splittingPanel.height - 10}
                      value={splitY}
                      onChange={(e) => setSplitY(parseInt(e.target.value))}
                      className="w-full accent-red-500 bg-neutral-800"
                    />
                  </div>

                  <div>
                    <label className="block text-4xs text-neutral-500 mb-1">Enter Exact Pixel</label>
                    <input
                      type="number"
                      value={splitY}
                      min={10}
                      max={splittingPanel.height - 10}
                      onChange={(e) => setSplitY(Math.min(splittingPanel.height - 10, Math.max(10, parseInt(e.target.value) || 10)))}
                      className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-neutral-900 pt-4">
                  <div className="flex justify-between text-4xs text-neutral-500 px-1">
                    <span>Part 1 H: {splitY} px</span>
                    <span>Part 2 H: {splittingPanel.height - splitY} px</span>
                  </div>
                  <button
                    onClick={handleSplitExecute}
                    className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold transition-colors"
                  >
                    Execute Split
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
