'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api, API_BASE } from '@/lib/api';
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
  EyeOff,
  X,
  Sparkles
} from 'lucide-react';
import Link from 'next/link';

interface UndoAction {
  type: 'crop' | 'split' | 'merge' | 'delete' | 'duplicate';
  panelId?: string;
  panelIds?: string[];
  previousCropBox?: string | null;
  newCropBox?: string | null;
  originalPanelId?: string;
  originalPanelIds?: string[];
  createdPanelIds?: string[];
  duplicatedPanelId?: string;
  splitY?: number;
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

  // Mouse drag crop/split helper states
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [isDraggingBox, setIsDraggingBox] = useState(false); // moving existing box vs drawing new
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cropStartCoords, setCropStartCoords] = useState<{ x: number; y: number } | null>(null);
  const [boxDragOffset, setBoxDragOffset] = useState<{ dx: number; dy: number } | null>(null); // offset when moving box

  // Smart Crop Layout Detection States
  const [detectedFeatures, setDetectedFeatures] = useState<{
    panels: { x: number; y: number; width: number; height: number }[];
    dialogues: { x: number; y: number; width: number; height: number }[];
    smart_crops: { x: number; y: number; width: number; height: number }[];
  } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showDetectedOverlays, setShowDetectedOverlays] = useState(true);

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

  const autoCropChapterMutation = useMutation({
    mutationFn: api.chapters.autoCrop,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
      alert(`Auto-crop completed!\nSuccessfully processed panels: ${data.updatedCount}`);
    },
    onError: (err: any) => {
      alert(`Auto-crop failed: ${err.message || 'Unknown error'}`);
    },
  });

  // Duplicate panel mutation
  const duplicatePanelMutation = useMutation({
    mutationFn: api.panels.duplicate,
    onSuccess: (newPanel) => {
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
      setSelectedPanelId(newPanel.id);
    },
    onError: (err: any) => {
      alert(`Failed to duplicate panel: ${err.message || 'Unknown error'}`);
    },
  });

  const handlePanelDuplicate = (panel: Panel) => {
    duplicatePanelMutation.mutate(panel.id, {
      onSuccess: (newPanel) => {
        pushToUndo({
          type: 'duplicate',
          panelId: panel.id,
          duplicatedPanelId: newPanel.id,
        });
        if (croppingPanel && croppingPanel.id === panel.id) {
          openCropModal(newPanel);
        }
      },
    });
  };

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
      } else if (action.type === 'duplicate' && action.duplicatedPanelId) {
        await api.panels.delete(action.duplicatedPanelId);
      }
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
    } catch (err: any) {
      alert(`Undo failed: ${err.message}`);
    }
  };

  const handleRedo = async () => {
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, action]);

    try {
      if (action.type === 'crop' && action.panelId) {
        await api.panels.crop(action.panelId, action.newCropBox ? JSON.parse(action.newCropBox) : null);
      } else if (action.type === 'delete' && action.panelId) {
        await api.panels.delete(action.panelId);
      } else if (action.type === 'split' && action.originalPanelId && action.splitY !== undefined) {
        const panelsBefore = await api.panels.list(activeChapterId!, false);
        await api.panels.split(action.originalPanelId, action.splitY);
        const panelsAfter = await api.panels.list(activeChapterId!, false);
        const beforeIds = new Set(panelsBefore.map((p) => p.id));
        const newCreatedIds = panelsAfter.filter((p) => !beforeIds.has(p.id)).map((p) => p.id);
        action.createdPanelIds = newCreatedIds;
      } else if (action.type === 'merge' && action.originalPanelIds) {
        const panelsBefore = await api.panels.list(activeChapterId!, false);
        await api.panels.merge(action.originalPanelIds);
        const panelsAfter = await api.panels.list(activeChapterId!, false);
        const beforeIds = new Set(panelsBefore.map((p) => p.id));
        const created = panelsAfter.find((p) => !beforeIds.has(p.id));
        action.panelId = created?.id;
      } else if (action.type === 'duplicate' && action.panelId) {
        const newDuplicated = await api.panels.duplicate(action.panelId);
        action.duplicatedPanelId = newDuplicated.id;
      }
      queryClient.invalidateQueries({ queryKey: ['panels', activeChapterId] });
    } catch (err: any) {
      alert(`Redo failed: ${err.message}`);
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
  const liveCroppingPanel = panels.find((p) => p.id === croppingPanel?.id);
  const chapters = projectDetails?.chapters || [];

  useEffect(() => {
    if (liveCroppingPanel) {
      if (liveCroppingPanel.cropBox) {
        const box = JSON.parse(liveCroppingPanel.cropBox);
        setCropX(box.x);
        setCropY(box.y);
        setCropW(box.width);
        setCropH(box.height);
      } else {
        setCropX(0);
        setCropY(0);
        setCropW(liveCroppingPanel.width);
        setCropH(liveCroppingPanel.height);
      }
    }
  }, [liveCroppingPanel?.cropBox, liveCroppingPanel?.id]);

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

  // Launch Crop Mode
  const openCropModal = (panel: Panel) => {
    setSelectedPanelId(panel.id);
    setCroppingPanel(panel);
    setSplittingPanel(null);
    setDetectedFeatures(null);
    setIsDetecting(true);

    api.panels.detect(panel.id)
      .then((res) => {
        if (res.status === 'success') {
          setDetectedFeatures({
            panels: res.panels || [],
            dialogues: res.dialogues || [],
            smart_crops: res.smart_crops || [],
          });
          // If no previous cropBox exists, automatically apply the largest smart crop suggested!
          if (!panel.cropBox && res.smart_crops && res.smart_crops.length > 0) {
            const largest = res.smart_crops.reduce((max, sc) =>
              (sc.width * sc.height > max.width * max.height) ? sc : max
            , res.smart_crops[0]);
            setCropX(largest.x);
            setCropY(largest.y);
            setCropW(largest.width);
            setCropH(largest.height);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to auto-detect panel layout:', err);
      })
      .finally(() => {
        setIsDetecting(false);
      });

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
    const newBox = { x: cropX, y: cropY, width: cropW, height: cropH };
    pushToUndo({
      type: 'crop',
      panelId: croppingPanel.id,
      previousCropBox: croppingPanel.cropBox,
      newCropBox: JSON.stringify(newBox)
    });
    cropMutation.mutate({
      id: croppingPanel.id,
      cropBox: newBox
    });
  };

  // Launch Split Mode
  const openSplitModal = (panel: Panel) => {
    setSplittingPanel(panel);
    setCroppingPanel(null);
    setSplitY(Math.floor(panel.height / 2));
  };

  const handleSplitExecute = async (panelOverride?: Panel, yOverride?: number) => {
    const targetPanel = panelOverride || splittingPanel;
    const targetY = yOverride !== undefined ? yOverride : splitY;
    if (!targetPanel) return;

    // Track state to allow rollback
    const panelsBefore = await api.panels.list(activeChapterId!, false);

    splitMutation.mutate(
      { id: targetPanel.id, splitY: targetY },
      {
        onSuccess: async (data) => {
          const panelsAfter = await api.panels.list(activeChapterId!, false);
          // Find the new created panel IDs
          const beforeIds = new Set(panelsBefore.map((p) => p.id));
          const createdPanelIds = panelsAfter.filter((p) => !beforeIds.has(p.id)).map((p) => p.id);

          pushToUndo({
            type: 'split',
            originalPanelId: targetPanel.id,
            createdPanelIds,
            splitY: targetY
          });
        }
      }
    );
  };

  // Mouse/Pointer event handlers for inline image interaction (Selection / Split mode guideline tracker)
  const handleImagePointerDown = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    e.stopPropagation();
    setSelectedPanelId(panel.id);
  };

  const handleImagePointerMove = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    if (splittingPanel?.id === panel.id) {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const origY = Math.round((currentY / rect.height) * panel.height);
      setSplitY(Math.min(panel.height - 10, Math.max(10, origY)));
    }
  };

  const handleImagePointerUp = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    // No-op for inline pointer up since dragging crop is disabled on main workspace list cards
  };

  // Mouse/Pointer event handlers for modal image crop interaction
  const handleModalPointerDown = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const origClickX = Math.round((clickX / rect.width) * panel.width);
    const origClickY = Math.round((clickY / rect.height) * panel.height);

    // Check if click is INSIDE the existing crop selection — if so, drag to move
    const insideCrop =
      cropW > 20 && cropH > 20 &&
      origClickX >= cropX && origClickX <= cropX + cropW &&
      origClickY >= cropY && origClickY <= cropY + cropH;

    setDragStart({ x: e.clientX, y: e.clientY });
    setIsDraggingCrop(true);

    if (insideCrop) {
      // Moving mode: remember offset from box top-left
      setIsDraggingBox(true);
      setBoxDragOffset({ dx: origClickX - cropX, dy: origClickY - cropY });
      setCropStartCoords(null);
    } else {
      // Drawing mode: start a new crop box
      setIsDraggingBox(false);
      setBoxDragOffset(null);
      const origStartX = Math.max(0, Math.min(panel.width, origClickX));
      const origStartY = Math.max(0, Math.min(panel.height, origClickY));
      setCropStartCoords({ x: origStartX, y: origStartY });
      setCropX(origStartX);
      setCropY(origStartY);
      setCropW(0);
      setCropH(0);
    }
  };

  const handleModalPointerMove = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    if (!isDraggingCrop || !dragStart) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const currentY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const origCurrentX = Math.max(0, Math.min(panel.width, Math.round((currentX / rect.width) * panel.width)));
    const origCurrentY = Math.max(0, Math.min(panel.height, Math.round((currentY / rect.height) * panel.height)));

    if (isDraggingBox && boxDragOffset) {
      // Move the existing crop box — keep width/height, just shift position
      const newX = Math.max(0, Math.min(panel.width - cropW, origCurrentX - boxDragOffset.dx));
      const newY = Math.max(0, Math.min(panel.height - cropH, origCurrentY - boxDragOffset.dy));
      setCropX(newX);
      setCropY(newY);
    } else if (cropStartCoords) {
      // Draw new crop box
      const x1 = Math.min(cropStartCoords.x, origCurrentX);
      const x2 = Math.max(cropStartCoords.x, origCurrentX);
      const y1 = Math.min(cropStartCoords.y, origCurrentY);
      const y2 = Math.max(cropStartCoords.y, origCurrentY);
      setCropX(x1);
      setCropY(y1);
      setCropW(x2 - x1);
      setCropH(y2 - y1);
    }
  };

  const handleModalPointerUp = (e: React.PointerEvent<HTMLImageElement>, panel: Panel) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}

    setDragStart(null);
    setCropStartCoords(null);
    setBoxDragOffset(null);
    setIsDraggingCrop(false);
    setIsDraggingBox(false);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>, panel: Panel) => {
    e.stopPropagation();
    if (splittingPanel?.id === panel.id) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const origY = Math.round((clickY / rect.height) * panel.height);
      const targetY = Math.min(panel.height - 10, Math.max(10, origY));
      
      handleSplitExecute(panel, targetY);
      setSplittingPanel(null);
    } else {
      setSelectedPanelId(panel.id);
      setCroppingPanel(null);
    }
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
    if (croppingPanel?.id === panel.id) {
      setCroppingPanel(null);
    }
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

  // Keyboard Shortcuts for Undo, Redo, Duplicate, and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // Ctrl + Z -> Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
      // Ctrl + Y -> Redo
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
      // Ctrl + D -> Duplicate active panel
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (activePanel) {
          handlePanelDuplicate(activePanel);
        }
      }
      // Delete key -> Delete active panel
      else if (e.key === 'Delete') {
        if (activePanel && !activePanel.isDeleted) {
          e.preventDefault();
          handlePanelDelete(activePanel);
        }
      }
      // Escape key -> Close cropping modal
      else if (e.key === 'Escape') {
        if (croppingPanel) {
          e.preventDefault();
          setCroppingPanel(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePanel, undoStack, redoStack, activeChapterId, croppingPanel]);

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
            <>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to automatically detect panels & dialogues and auto-crop all panels in this chapter? This will overwrite any manual crop boxes.')) {
                    autoCropChapterMutation.mutate(activeChapterId);
                  }
                }}
                disabled={autoCropChapterMutation.isPending || panels.length === 0}
                className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 rounded border border-violet-500/30 text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                title="Detect panels/dialogues and automatically crop all panels in this chapter"
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>{autoCropChapterMutation.isPending ? 'Auto Cropping...' : 'Auto Crop All'}</span>
              </button>

              <button
                onClick={() => exportChapterMutation.mutate(activeChapterId)}
                disabled={exportChapterMutation.isPending || panels.length === 0}
                className="px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded text-xs font-semibold shadow transition-all flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exportChapterMutation.isPending ? 'Exporting...' : 'Export Chapter'}</span>
              </button>
            </>
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
          {activeChapterId && (
            <div className="bg-neutral-950/80 backdrop-blur-md border-b border-neutral-900 px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center space-x-3">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  {chapters.find((c) => c.id === activeChapterId)?.title || 'Chapter Workspace'}
                </h2>
                <div className="h-4 w-px bg-neutral-800" />
                <span className="text-3xs text-neutral-500 font-medium">
                  {panels.length} panels total &bull; {panels.filter(p => p.cropBox).length} cropped &bull; {panels.filter(p => p.isDeleted).length} deleted
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:border-neutral-800 transition-all text-3xs font-semibold"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-900 disabled:hover:border-neutral-800 transition-all text-3xs font-semibold"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>Redo</span>
                </button>
                {selectedPanels.length >= 2 && (
                  <>
                    <div className="h-4 w-px bg-neutral-800" />
                    <button
                      onClick={handleMergeExecute}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-all text-xs shadow-md shadow-violet-600/10"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Merge ({selectedPanels.length})</span>
                    </button>
                    <button
                      onClick={() => setSelectedPanels([])}
                      className="px-2 py-1.5 text-3xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Clear Selection
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

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
                  const imageUrl = `${API_BASE}/${panel.filePath}`;

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
                        <div className="w-72 bg-neutral-950 flex items-center justify-center p-4 border-r border-neutral-900 relative group/thumb select-none">
                          {panel.cropBox && croppingPanel?.id !== panel.id && splittingPanel?.id !== panel.id ? (
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
                            <div className="relative max-h-full max-w-full flex items-center justify-center">
                              <img
                                src={imageUrl}
                                alt={`Panel ${panel.panelNumber}`}
                                className={`max-h-[346px] max-w-[256px] object-contain rounded-md shadow-inner select-none border transition-all ${
                                  splittingPanel?.id === panel.id
                                    ? 'cursor-row-resize border-red-500/50 bg-red-950/10'
                                    : 'cursor-pointer border-neutral-900 hover:border-violet-500/40'
                                }`}
                                loading="lazy"
                                onPointerDown={(e) => handleImagePointerDown(e, panel)}
                                onPointerMove={(e) => handleImagePointerMove(e, panel)}
                                onPointerUp={(e) => handleImagePointerUp(e, panel)}
                                onClick={(e) => handleImageClick(e, panel)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  openCropModal(panel);
                                }}
                              />

                              {/* Crop Bounding Box overlay */}
                              {croppingPanel?.id === panel.id && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: `${(cropX / panel.width) * 100}%`,
                                    top: `${(cropY / panel.height) * 100}%`,
                                    width: `${(cropW / panel.width) * 100}%`,
                                    height: `${(cropH / panel.height) * 100}%`,
                                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                                    border: '2px dashed #8b5cf6',
                                  }}
                                  className="pointer-events-none"
                                >
                                  <div className="absolute right-1 bottom-1 bg-violet-600 text-white font-bold text-[9px] px-1 py-0.5 rounded shadow whitespace-nowrap">
                                    {cropW} × {cropH}
                                  </div>
                                </div>
                              )}

                              {/* Split Guideline overlay */}
                              {splittingPanel?.id === panel.id && (
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    top: `${(splitY / panel.height) * 100}%`,
                                    borderTop: '2px dashed #ef4444',
                                  }}
                                  className="pointer-events-none"
                                >
                                  <div className="absolute right-1 bg-red-650 text-white font-bold text-[9px] px-1 py-0.5 rounded shadow whitespace-nowrap">
                                    Split: {splitY}px
                                  </div>
                                </div>
                              )}
                            </div>
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

                            {splittingPanel?.id === panel.id ? (
                              <div className="mt-4 p-4 bg-red-950/20 border border-red-800/40 rounded-xl space-y-3">
                                <h5 className="text-xs font-bold text-red-300">Direct Mouse Splitting</h5>
                                <p className="text-3xs text-neutral-400">Click or drag on the image to set split guideline.</p>
                                <div className="flex justify-between text-3xs">
                                  <div>
                                    <span className="text-neutral-500">Split Y: </span>
                                    <span className="font-semibold text-neutral-200">{splitY}px</span>
                                  </div>
                                  <div>
                                    <span className="text-neutral-500">Part 1: </span>
                                    <span className="font-semibold text-neutral-200">{splitY}px</span>
                                  </div>
                                  <div>
                                    <span className="text-neutral-500">Part 2: </span>
                                    <span className="font-semibold text-neutral-200">{panel.height - splitY}px</span>
                                  </div>
                                </div>
                                <div className="flex space-x-2 pt-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSplittingPanel(null);
                                    }}
                                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-850 rounded text-3xs font-semibold text-neutral-400 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSplitExecute();
                                    }}
                                    className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-3xs font-semibold transition-colors"
                                  >
                                    Execute Split
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-4 mt-6">
                                <div className="grid grid-cols-2 gap-4">
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

                                <div className="flex items-center space-x-2 pt-2">
                                  {!panel.isDeleted ? (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPanelId(panel.id);
                                          openCropModal(panel);
                                        }}
                                        className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-lg text-3xs font-semibold text-neutral-300 transition-colors"
                                        title="Crop this panel (mouse-drag)"
                                      >
                                        <Crop className="w-3.5 h-3.5 text-violet-400" />
                                        <span>Crop</span>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPanelId(panel.id);
                                          openSplitModal(panel);
                                        }}
                                        className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-lg text-3xs font-semibold text-neutral-300 transition-colors"
                                        title="Split this panel (mouse-click)"
                                      >
                                        <Scissors className="w-3.5 h-3.5 text-violet-400" />
                                        <span>Split</span>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPanelId(panel.id);
                                          handlePanelDuplicate(panel);
                                        }}
                                        disabled={duplicatePanelMutation.isPending}
                                        className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-lg text-3xs font-semibold text-neutral-300 transition-colors disabled:opacity-50"
                                        title="Duplicate panel"
                                      >
                                        <Layers className="w-3.5 h-3.5 text-violet-400" />
                                        <span>Duplicate</span>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPanelId(panel.id);
                                          handlePanelDelete(panel);
                                        }}
                                        className="flex-1 flex items-center justify-center space-x-1 py-1.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 hover:border-red-900/50 rounded-lg text-3xs font-semibold text-red-400 transition-all"
                                        title="Delete panel"
                                      >
                                        <Trash className="w-3.5 h-3.5 text-red-450" />
                                        <span>Delete</span>
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPanelId(panel.id);
                                        restorePanelMutation.mutate(panel.id);
                                      }}
                                      className="w-full flex items-center justify-center space-x-2 py-1.5 bg-emerald-950/30 border border-emerald-900/40 hover:bg-emerald-950/50 text-emerald-400 rounded-lg text-3xs font-semibold transition-all"
                                    >
                                      <RefreshCw className="w-3.5 h-3.5 text-emerald-450" />
                                      <span>Restore Panel</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
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
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="p-1 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-900 transition-colors"
                  title="Redo"
                >
                  <Redo2 className="w-4 h-4" />
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
                  splittingPanel?.id === activePanel.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="block text-3xs font-semibold text-red-400 uppercase tracking-wider">Split Mode Active</span>
                        <button
                          onClick={() => setSplittingPanel(null)}
                          className="text-4xs text-neutral-450 hover:underline hover:text-neutral-300"
                        >
                          Cancel
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-3xs">
                          <span className="text-neutral-455">Y-Coordinate</span>
                          <span className="font-semibold text-red-455">{splitY} px</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={activePanel.height - 10}
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
                          max={activePanel.height - 10}
                          onChange={(e) => setSplitY(Math.min(activePanel.height - 10, Math.max(10, parseInt(e.target.value) || 10)))}
                          className="w-full px-2 py-1 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200"
                        />
                      </div>

                      <div className="space-y-2 border-t border-neutral-900 pt-4">
                        <div className="flex justify-between text-4xs text-neutral-550 px-1 mb-1">
                          <span>Part 1 H: {splitY} px</span>
                          <span>Part 2 H: {activePanel.height - splitY} px</span>
                        </div>
                        <button
                          onClick={() => handleSplitExecute()}
                          className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold transition-colors"
                        >
                          Execute Split
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <span className="block text-3xs font-semibold text-neutral-500 uppercase tracking-wider">Manual Correction</span>
                      <div className="grid grid-cols-1 gap-2.5">
                        <button
                          onClick={() => openCropModal(activePanel)}
                          className="flex items-center space-x-3 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition-colors"
                        >
                          <Crop className="w-4 h-4 text-violet-400" />
                          <span>Crop Panel</span>
                        </button>
                        <button
                          onClick={() => openSplitModal(activePanel)}
                          className="flex items-center space-x-3 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition-colors"
                        >
                          <Scissors className="w-4 h-4 text-violet-400" />
                          <span>Split Panel</span>
                        </button>
                        <button
                          onClick={() => handlePanelDuplicate(activePanel)}
                          disabled={duplicatePanelMutation.isPending}
                          className="flex items-center space-x-3 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-855 border border-neutral-800 rounded-lg text-xs font-semibold text-neutral-300 transition-colors disabled:opacity-50"
                        >
                          <Layers className="w-4 h-4 text-violet-400" />
                          <span>Duplicate Panel</span>
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
                  )
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
                          pushToUndo({ type: 'crop', panelId: activePanel.id, previousCropBox: activePanel.cropBox, newCropBox: null });
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

      {/* Premium Full-Screen Crop Modal */}
      {croppingPanel && liveCroppingPanel && !liveCroppingPanel.isDeleted && (
        <div className="fixed inset-0 z-50 flex bg-neutral-950/95 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
          <div className="flex flex-col flex-1 h-full overflow-hidden">
            {/* Modal Header */}
            <header className="h-16 px-6 border-b border-neutral-900 bg-neutral-950/50 flex items-center justify-between z-10">
              <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                  <Crop className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Crop Editor &mdash; Panel #{String(liveCroppingPanel.panelNumber).padStart(3, '0')}
                  </h3>
                </div>
                <span className="text-3xs text-neutral-500 font-medium mt-0.5">
                  Original Resolution: {liveCroppingPanel.width} &times; {liveCroppingPanel.height} px
                </span>
              </div>

              {/* Modal Toolbar (Undo, Redo, Duplicate, Delete) */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 disabled:opacity-30 transition-all text-xs font-semibold"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Undo</span>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="flex items-center space-x-1 px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 disabled:opacity-30 transition-all text-xs font-semibold"
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Redo</span>
                </button>
                <div className="h-5 w-px bg-neutral-850 mx-1" />
                <button
                  onClick={() => handlePanelDuplicate(liveCroppingPanel)}
                  disabled={duplicatePanelMutation.isPending}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:bg-neutral-850 hover:border-neutral-700 text-neutral-300 transition-colors text-xs font-semibold disabled:opacity-50"
                  title="Duplicate Panel (Ctrl+D)"
                >
                  <Layers className="w-3.5 h-3.5 text-violet-400" />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={() => handlePanelDelete(liveCroppingPanel)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-red-950/20 border border-red-900/30 hover:bg-red-950/40 text-red-400 transition-colors text-xs font-semibold"
                  title="Delete Panel (Delete)"
                >
                  <Trash className="w-3.5 h-3.5 text-red-450" />
                  <span>Delete</span>
                </button>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setCroppingPanel(null)}
                className="p-1.5 hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200 rounded-lg transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </header>

            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden">
              {/* Canvas Viewport (Main Center) */}
              <div className="flex-1 bg-neutral-950/40 flex items-center justify-center p-8 relative overflow-hidden group select-none">
                <div className="absolute top-4 left-6 pointer-events-none z-10 bg-neutral-950/80 px-3 py-1.5 rounded-md border border-neutral-900 text-3xs text-neutral-400 flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                  <span>
                    {isDraggingBox
                      ? '↕ Moving crop box — release to place'
                      : cropW > 20 && cropH > 20
                        ? 'Click inside the box to move it, or drag outside to redraw'
                        : 'Click and drag on the image to draw a crop box'}
                  </span>
                </div>

                <div className="relative max-h-full max-w-full flex items-center justify-center overflow-hidden rounded border border-neutral-900 bg-neutral-950">
                  <div className="relative">
                    <img
                      src={`${API_BASE}/${liveCroppingPanel.filePath}`}
                      alt={`Cropping Panel ${liveCroppingPanel.panelNumber}`}
                      className={`max-h-[75vh] w-auto object-contain select-none ${
                        isDraggingBox ? 'cursor-move' :
                        cropW > 20 && cropH > 20 ? 'cursor-move' :
                        'cursor-crosshair'
                      }`}
                      loading="lazy"
                      onPointerDown={(e) => handleModalPointerDown(e, liveCroppingPanel)}
                      onPointerMove={(e) => handleModalPointerMove(e, liveCroppingPanel)}
                      onPointerUp={(e) => handleModalPointerUp(e, liveCroppingPanel)}
                    />

                    {/* Crop Selection Overlay Mask */}
                    {cropW > 0 && cropH > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${(cropX / liveCroppingPanel.width) * 100}%`,
                          top: `${(cropY / liveCroppingPanel.height) * 100}%`,
                          width: `${(cropW / liveCroppingPanel.width) * 100}%`,
                          height: `${(cropH / liveCroppingPanel.height) * 100}%`,
                          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
                          border: `2px ${isDraggingBox ? 'solid' : 'dashed'} #8b5cf6`,
                          cursor: isDraggingBox ? 'move' : 'move',
                          transition: isDraggingBox ? 'none' : 'border-color 0.15s',
                        }}
                        className="pointer-events-none z-30"
                      >
                        {/* Size label bottom-right */}
                        <div className="absolute right-2 bottom-2 bg-violet-600 text-white font-bold text-3xs px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap">
                          {cropW} &times; {cropH} px
                        </div>
                        {/* Floating Duplicate button top-left of crop box */}
                        <div
                          className="pointer-events-auto absolute -top-7 left-0 flex items-center space-x-1"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePanelDuplicate(liveCroppingPanel); }}
                            className="flex items-center space-x-1 px-2 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white text-3xs font-bold shadow-lg whitespace-nowrap transition-colors"
                            title="Duplicate Panel (Ctrl+D)"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
                            <span>Duplicate</span>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCropSave(); }}
                            className="flex items-center space-x-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-3xs font-bold shadow-lg whitespace-nowrap transition-colors"
                            title="Apply Crop"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><polyline points="20 6 9 17 4 12"></polyline></svg>
                            <span>Apply</span>
                          </button>
                        </div>
                        {/* Drag hint label in center */}
                        {!isDraggingCrop && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-3xs text-violet-200/60 font-medium pointer-events-none select-none">drag to move</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Detected Panel Illustration regions */}
                    {showDetectedOverlays && detectedFeatures && detectedFeatures.panels.map((p, i) => (
                      <div
                        key={`p-${i}`}
                        style={{
                          position: 'absolute',
                          left: `${(p.x / liveCroppingPanel.width) * 100}%`,
                          top: `${(p.y / liveCroppingPanel.height) * 100}%`,
                          width: `${(p.width / liveCroppingPanel.width) * 100}%`,
                          height: `${(p.height / liveCroppingPanel.height) * 100}%`,
                          border: '1.5px solid #10b981',
                          backgroundColor: 'rgba(16, 185, 129, 0.03)',
                        }}
                        className="pointer-events-none z-10"
                      >
                        <div className="absolute left-1 top-1 bg-emerald-950/85 text-emerald-400 border border-emerald-900/60 font-bold text-[8px] px-1.5 py-0.5 rounded shadow">
                          Panel Illustration
                        </div>
                      </div>
                    ))}

                    {/* Excluded Dialogue Bubbles / Text Blocks */}
                    {showDetectedOverlays && detectedFeatures && detectedFeatures.dialogues.map((d, i) => (
                      <div
                        key={`d-${i}`}
                        style={{
                          position: 'absolute',
                          left: `${(d.x / liveCroppingPanel.width) * 100}%`,
                          top: `${(d.y / liveCroppingPanel.height) * 100}%`,
                          width: `${(d.width / liveCroppingPanel.width) * 100}%`,
                          height: `${(d.height / liveCroppingPanel.height) * 100}%`,
                          border: '1.5px solid #f43f5e',
                          backgroundColor: 'rgba(244, 63, 94, 0.12)',
                        }}
                        className="pointer-events-none z-10"
                      >
                        <div className="absolute left-1 top-1 bg-red-950/85 text-red-400 border border-red-900/50 font-bold text-[8px] px-1.5 py-0.5 rounded shadow">
                          Dialogue Box
                        </div>
                      </div>
                    ))}

                    {/* Interactive smart crop segment click captures */}
                    {showDetectedOverlays && detectedFeatures && detectedFeatures.smart_crops.map((sc, i) => (
                      <div
                        key={`sc-${i}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCropX(sc.x);
                          setCropY(sc.y);
                          setCropW(sc.width);
                          setCropH(sc.height);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${(sc.x / liveCroppingPanel.width) * 100}%`,
                          top: `${(sc.y / liveCroppingPanel.height) * 100}%`,
                          width: `${(sc.width / liveCroppingPanel.width) * 100}%`,
                          height: `${(sc.height / liveCroppingPanel.height) * 100}%`,
                          border: '1.5px dashed #8b5cf6',
                          backgroundColor: 'rgba(139, 92, 246, 0.01)',
                          cursor: 'pointer',
                        }}
                        className="z-20 hover:border-violet-400 hover:bg-violet-500/10 transition-all group/sc"
                        title="Click to apply this smart crop segment"
                      >
                        <div className="absolute right-1 top-1 bg-violet-950/90 text-violet-300 border border-violet-850 font-bold text-[8px] px-1.5 py-0.5 rounded shadow group-hover/sc:bg-violet-600 group-hover/sc:text-white transition-colors">
                          Click to Crop Segment
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar Controls (Right Side) */}
              <aside className="w-80 border-l border-neutral-900 bg-neutral-950/40 p-6 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Crop Area Settings</h4>
                    <p className="text-3xs text-neutral-500 mt-1">Adjust coordinates or drag directly on the image.</p>
                  </div>

                  {/* Smart Detection Section */}
                  <div className="space-y-3.5 border-t border-neutral-900/60 pt-4">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-neutral-300">Smart Crop Detection</h5>
                      {isDetecting && (
                        <div className="flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-ping" />
                          <span className="text-4xs text-violet-400">Analyzing...</span>
                        </div>
                      )}
                    </div>
                    
                    <p className="text-3xs text-neutral-500">
                      Detects illustration panels and speech bubbles to auto crop only images, ignoring dialogues.
                    </p>

                    {detectedFeatures && (
                      <div className="space-y-3">
                        <button
                          onClick={() => {
                            if (detectedFeatures.smart_crops.length > 0) {
                              const largest = detectedFeatures.smart_crops.reduce((max, sc) =>
                                (sc.width * sc.height > max.width * max.height) ? sc : max
                              , detectedFeatures.smart_crops[0]);
                              setCropX(largest.x);
                              setCropY(largest.y);
                              setCropW(largest.width);
                              setCropH(largest.height);
                            }
                          }}
                          disabled={detectedFeatures.smart_crops.length === 0}
                          className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-violet-600/10 transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>Auto Crop Panels</span>
                        </button>

                        {detectedFeatures.smart_crops.length > 0 && (
                          <div className="space-y-1.5">
                            <label className="block text-4xs font-semibold text-neutral-500 uppercase tracking-wider">Suggested Segments</label>
                            <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                              {detectedFeatures.smart_crops.map((sc, index) => {
                                const label = detectedFeatures.smart_crops.length > 1
                                  ? `Illustration segment #${index + 1}`
                                  : `Smart Crop (No Dialogs)`;
                                const isCurrent = cropX === sc.x && cropY === sc.y && cropW === sc.width && cropH === sc.height;
                                return (
                                  <button
                                    key={index}
                                    onClick={() => {
                                      setCropX(sc.x);
                                      setCropY(sc.y);
                                      setCropW(sc.width);
                                      setCropH(sc.height);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 border rounded text-3xs font-medium flex items-center justify-between transition-all ${
                                      isCurrent
                                        ? 'bg-violet-950/20 border-violet-500/50 text-violet-300'
                                        : 'bg-neutral-900/60 hover:bg-neutral-850 hover:border-neutral-700 border-neutral-800 text-neutral-300'
                                    }`}
                                  >
                                    <span>{label}</span>
                                    <span className="text-4xs text-neutral-500">{sc.width} &times; {sc.height} px</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Overlays Visibility Toggle */}
                        <div className="pt-1">
                          <label className="flex items-center space-x-2 text-3xs text-neutral-400 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={showDetectedOverlays}
                              onChange={(e) => setShowDetectedOverlays(e.target.checked)}
                              className="rounded border-neutral-800 bg-neutral-950 text-violet-600 focus:ring-0 w-3 h-3"
                            />
                            <span>Highlight detected areas on canvas</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Coordinate Sliders */}
                  <div className="space-y-4">
                    {/* Y Offset */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-3xs">
                        <span className="text-neutral-400">Y Offset (Top)</span>
                        <span className="font-semibold text-violet-400">{cropY} px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={liveCroppingPanel.height - 10}
                        value={cropY}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setCropY(val);
                          if (val + cropH > liveCroppingPanel.height) {
                            setCropH(liveCroppingPanel.height - val);
                          }
                        }}
                        className="w-full accent-violet-600 bg-neutral-800 cursor-pointer h-1.5 rounded-lg appearance-none"
                      />
                    </div>

                    {/* Crop Height */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-3xs">
                        <span className="text-neutral-400">Crop Height</span>
                        <span className="font-semibold text-violet-400">{cropH} px</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={liveCroppingPanel.height - cropY}
                        value={cropH}
                        onChange={(e) => setCropH(parseInt(e.target.value))}
                        className="w-full accent-violet-600 bg-neutral-800 cursor-pointer h-1.5 rounded-lg appearance-none"
                      />
                    </div>

                    {/* X Offset */}
                    <div className="space-y-1.5 border-t border-neutral-900/60 pt-4">
                      <div className="flex justify-between text-3xs">
                        <span className="text-neutral-400">X Offset (Left)</span>
                        <span className="font-semibold text-violet-400">{cropX} px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={liveCroppingPanel.width - 10}
                        value={cropX}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setCropX(val);
                          if (val + cropW > liveCroppingPanel.width) {
                            setCropW(liveCroppingPanel.width - val);
                          }
                        }}
                        className="w-full accent-violet-600 bg-neutral-800 cursor-pointer h-1.5 rounded-lg appearance-none"
                      />
                    </div>

                    {/* Crop Width */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-3xs">
                        <span className="text-neutral-400">Crop Width</span>
                        <span className="font-semibold text-violet-400">{cropW} px</span>
                      </div>
                      <input
                        type="range"
                        min={10}
                        max={liveCroppingPanel.width - cropX}
                        value={cropW}
                        onChange={(e) => setCropW(parseInt(e.target.value))}
                        className="w-full accent-violet-600 bg-neutral-800 cursor-pointer h-1.5 rounded-lg appearance-none"
                      />
                    </div>
                  </div>

                  {/* Manual Inputs Grid */}
                  <div className="grid grid-cols-2 gap-3 border-t border-neutral-900/60 pt-4">
                    <div>
                      <label className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">X (Left)</label>
                      <input
                        type="number"
                        value={cropX}
                        onChange={(e) => setCropX(Math.min(liveCroppingPanel.width - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">Y (Top)</label>
                      <input
                        type="number"
                        value={cropY}
                        onChange={(e) => setCropY(Math.min(liveCroppingPanel.height - 10, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">Width</label>
                      <input
                        type="number"
                        value={cropW}
                        onChange={(e) => setCropW(Math.min(liveCroppingPanel.width - cropX, Math.max(10, parseInt(e.target.value) || 10)))}
                        className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-4xs text-neutral-500 font-semibold uppercase tracking-wider mb-1">Height</label>
                      <input
                        type="number"
                        value={cropH}
                        onChange={(e) => setCropH(Math.min(liveCroppingPanel.height - cropY, Math.max(10, parseInt(e.target.value) || 10)))}
                        className="w-full px-2.5 py-1.5 text-xs bg-neutral-950 border border-neutral-800 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Apply/Reset Buttons */}
                <div className="flex space-x-2 pt-6 border-t border-neutral-900/60 mt-6">
                  <button
                    onClick={() => {
                      setCropX(0);
                      setCropY(0);
                      setCropW(liveCroppingPanel.width);
                      setCropH(liveCroppingPanel.height);
                    }}
                    className="flex-1 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleCropSave}
                    className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Apply Crop
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
