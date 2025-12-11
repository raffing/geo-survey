import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSurvey } from '../context/SurveyContext';
import { generateRegularPolygon, checkConnectionStatus, generateDXF } from '../utils/geometry';
import { Plus, Ruler, RefreshCw, Trash2, Focus, Minus, Link2, Unlink, AlertTriangle, CheckCircle, X, Layers, Check, Undo2, Redo2, ArrowRightLeft, Square, Ban, PenTool, StopCircle, Split, MoveHorizontal, FileJson, FileType, Upload, FolderOpen, Sun, Moon, HelpCircle, Pencil, ChevronDown, ChevronRight, Lock, Unlock, ArrowRight, Copy, FlipHorizontal, FlipVertical, AlignStartVertical, Settings2, MoreHorizontal, Sparkles, Link, DoorOpen, LayoutGrid } from 'lucide-react';
import { EdgeType, Polygon } from '../types';

// Helper component for Angle Input to handle local state (decimals, empty string)
const AngleInput = ({ 
    vertexId, 
    initialAngle, 
    onUpdate 
}: { 
    vertexId: string; 
    initialAngle: number | undefined; 
    onUpdate: (angle: number | undefined) => void;
}) => {
    const [localValue, setLocalValue] = useState<string>(initialAngle?.toString() ?? '');

    // Sync when selection changes
    useEffect(() => {
        setLocalValue(initialAngle?.toString() ?? '');
    }, [vertexId, initialAngle]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);

        if (val === '') {
            onUpdate(undefined);
        } else {
            const num = parseFloat(val);
            if (!isNaN(num)) {
                onUpdate(num);
            }
        }
    };

    return (
        <div className="flex items-center bg-slate-100 dark:bg-slate-700 rounded px-1 w-16">
            <input
                type="number"
                placeholder="Deg"
                className="w-full bg-transparent border-none text-xs font-mono py-1 text-slate-800 dark:text-slate-100 focus:outline-none text-center appearance-none"
                value={localValue}
                onChange={handleChange}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()} // Prevent global hotkeys while typing
            />
            <span className="text-[9px] text-slate-400">°</span>
        </div>
    );
};

export const Controls: React.FC = () => {
  const { state, dispatch } = useSurvey();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [numSides, setNumSides] = useState(4);
  const [newPolyName, setNewPolyName] = useState('');
  const [localLength, setLocalLength] = useState<string>('');
  
  // Renaming State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // Collapsed Groups State
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const addMenuRef = useRef<HTMLDivElement>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  // Get selected polygon(s)
  const selectedPolyId = state.selectedPolygonIds.length === 1 ? state.selectedPolygonIds[0] : null;
  const selectedPoly = selectedPolyId ? state.polygons.find(p => p.id === selectedPolyId) : null;
  
  const multiSelectionCount = state.selectedPolygonIds.length;
  
  // Find edge details (only if 1 edge selected)
  const selectedEdgePoly = state.polygons.find(p => p.edges.some(e => state.selectedEdgeIds.includes(e.id)));
  const selectedEdges = selectedEdgePoly?.edges.filter(e => state.selectedEdgeIds.includes(e.id)) || [];
  const selectedEdge = state.selectedEdgeIds.length === 1 && selectedEdges.length === 1 ? selectedEdges[0] : null; 
  
  const selectedVerticesCount = state.selectedVertexIds.length;

  // Check if we can join selected edges (Multi-select Join)
  const canJoinMulti = useMemo(() => {
      if (state.selectedEdgeIds.length !== 2) return false;
      const poly1 = state.polygons.find(p => p.edges.some(e => e.id === state.selectedEdgeIds[0]));
      const poly2 = state.polygons.find(p => p.edges.some(e => e.id === state.selectedEdgeIds[1]));
      
      if (!poly1 || !poly2 || poly1.id === poly2.id) return false;
      if (!poly1.isLocked || !poly2.isLocked) return false;
      
      return true;
  }, [state.selectedEdgeIds, state.polygons]);

  // Grouping Logic for List View
  const polygonGroups = useMemo(() => {
      const groups: Record<string, Polygon[]> = {};
      const ungrouped: Polygon[] = [];

      state.polygons.forEach(p => {
          if (p.groupId) {
              if (!groups[p.groupId]) groups[p.groupId] = [];
              groups[p.groupId].push(p);
          } else {
              ungrouped.push(p);
          }
      });
      
      return { groups, ungrouped };
  }, [state.polygons]);

  const toggleGroupCollapse = (groupId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setCollapsedGroups(prev => {
          const next = new Set(prev);
          if (next.has(groupId)) next.delete(groupId);
          else next.add(groupId);
          return next;
      });
  };

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
          
          const key = e.key.toLowerCase();
          
          if (key === 'a') {
              setShowAddMenu(prev => !prev);
              setShowLayerMenu(false);
              setShowExportMenu(false);
          }
          if (key === 'l') {
              setShowLayerMenu(prev => !prev);
              setShowAddMenu(false);
              setShowExportMenu(false);
          }
          if (key === 'd') {
              dispatch({ type: 'START_DRAWING', payload: undefined });
              setShowAddMenu(false);
          }
          if (key === 's' && selectedPoly) {
              dispatch({ type: 'RECONSTRUCT_GEOMETRY', payload: selectedPoly.id });
          }
          if (key === 't') {
              dispatch({ type: 'TOGGLE_THEME', payload: undefined });
          }
          if (key === 'h' || key === '?') {
              setShowHelp(prev => !prev);
          }
          if (e.key === 'Escape') {
              if (state.isDrawingMode) dispatch({ type: 'CANCEL_DRAWING', payload: undefined });
              if (state.isJoinMode) dispatch({ type: 'CANCEL_JOIN_CONFLICT', payload: undefined });
              if (state.alignState) dispatch({ type: 'CANCEL_ALIGNMENT', payload: undefined });
              if (state.contextMenu) dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined });
              if (state.openVertexMenuId) dispatch({ type: 'CLOSE_VERTEX_MENU', payload: undefined });
              if (showHelp) setShowHelp(false);
              setShowAddMenu(false);
              setShowLayerMenu(false);
              setShowExportMenu(false);
              setEditingId(null);
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (state.selectedPolygonIds.length > 0 && state.selectedEdgeIds.length === 0 && state.selectedVertexIds.length === 0 && !editingId) {
                  state.selectedPolygonIds.forEach(id => dispatch({ type: 'DELETE_POLYGON', payload: id }));
              }
              if (selectedEdge && selectedEdge.type === EdgeType.DIAGONAL) {
                  dispatch({ type: 'DELETE_EDGE', payload: selectedEdge.id });
              }
              if (state.selectedVertexIds.length === 1 && state.selectedVertexIds[0]) {
                   dispatch({ type: 'DELETE_VERTEX', payload: state.selectedVertexIds[0] });
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPoly, selectedEdge, state.selectedPolygonIds, state.selectedEdgeIds, state.selectedVertexIds, state.isDrawingMode, state.isJoinMode, state.alignState, state.contextMenu, state.openVertexMenuId, showHelp, editingId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
      if (layerMenuRef.current && !layerMenuRef.current.contains(event.target as Node)) {
        setShowLayerMenu(false);
      }
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
      if (state.contextMenu && contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
          dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined });
      }
    };
    if (showAddMenu || showLayerMenu || showExportMenu || state.contextMenu) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddMenu, showLayerMenu, showExportMenu, state.contextMenu]);

  useEffect(() => {
    if (showAddMenu) {
        setNewPolyName(`Polygon ${state.polygons.length + 1}`);
    }
  }, [showAddMenu, state.polygons.length]);

  useEffect(() => {
      if (selectedEdge) {
          setLocalLength((selectedEdge.length * 100).toFixed(2));
      } else {
          setLocalLength('');
      }
  }, [selectedEdge?.length, selectedEdge?.id]);

  useEffect(() => {
      if (state.solverMsg?.type === 'success') {
          const timer = setTimeout(() => {
              dispatch({ type: 'DISMISS_MESSAGE', payload: undefined });
          }, 3000);
          return () => clearTimeout(timer);
      }
  }, [state.solverMsg, dispatch]);

  // Edge Editor Position Calculation (Flying)
  const edgeEditorPos = React.useMemo(() => {
      if (!selectedEdge || !selectedEdgePoly) return null;
      const v1 = selectedEdgePoly.vertices.find(v => v.id === selectedEdge.startVertexId);
      const v2 = selectedEdgePoly.vertices.find(v => v.id === selectedEdge.endVertexId);
      if (!v1 || !v2) return null;

      // Calculate midpoint in world space
      const midX = (v1.x + v2.x) / 2;
      const midY = (v1.y + v2.y) / 2;

      // Transform to screen space
      const rad = state.rotation;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const sx = midX * state.zoomLevel;
      const sy = midY * state.zoomLevel;
      const rx = sx * cos - sy * sin;
      const ry = sx * sin + sy * cos;
      const x = rx + state.panOffset.x;
      const y = ry + state.panOffset.y;

      // Clamp to viewport
      const EDITOR_W = 280;
      const EDITOR_H = 220; 
      
      let safeX = x + 20; 
      let safeY = y + 20; 

      if (safeX + EDITOR_W > window.innerWidth) safeX = x - EDITOR_W - 20;
      if (safeY + EDITOR_H > window.innerHeight) safeY = y - EDITOR_H - 20;

      safeX = Math.max(10, safeX);
      safeY = Math.max(80, safeY); 

      return { x: safeX, y: safeY };
  }, [selectedEdge, selectedEdgePoly, state.zoomLevel, state.panOffset, state.rotation]);

  // Vertex Editor Position
  const vertexEditorPos = useMemo(() => {
    if (!state.openVertexMenuId) return null;
    let targetV = null;
    for (const p of state.polygons) {
        const v = p.vertices.find(vi => vi.id === state.openVertexMenuId);
        if (v) { targetV = v; break; }
    }
    if (!targetV) return null;
    
    // Transform
    const rad = state.rotation;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const sx = targetV.x * state.zoomLevel;
    const sy = targetV.y * state.zoomLevel;
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    const x = rx + state.panOffset.x;
    const y = ry + state.panOffset.y;
    
    // Position slightly above and right
    return { x: x + 15, y: y - 60 }; 
  }, [state.openVertexMenuId, state.polygons, state.panOffset, state.zoomLevel, state.rotation]);


  const handleAddPolygon = () => {
    const center = { 
        x: (window.innerWidth / 2 - state.panOffset.x) / state.zoomLevel + (Math.random() * 100 - 50),
        y: (window.innerHeight / 2 - state.panOffset.y) / state.zoomLevel + (Math.random() * 100 - 50)
    };
    const finalName = newPolyName.trim() || `Polygon ${state.polygons.length + 1}`;
    const newPoly = generateRegularPolygon(center, numSides, `poly-${Date.now()}`, finalName);
    dispatch({ type: 'ADD_POLYGON', payload: newPoly });
    setShowAddMenu(false);
  };
  
  // Create Polygon at context click position
  const handleAddPolygonAtContext = () => {
      if (!state.contextMenu) return;
      const { x, y } = state.contextMenu;
      const { panOffset, zoomLevel, rotation } = state;

      // Inverse Transform
      const dx = x - panOffset.x;
      const dy = y - panOffset.y;
      
      // Rotate inverse (-rotation)
      const cos = Math.cos(-rotation);
      const sin = Math.sin(-rotation);
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      
      // Scale inverse
      const worldX = rx / zoomLevel;
      const worldY = ry / zoomLevel;

      const finalName = `Polygon ${state.polygons.length + 1}`;
      const newPoly = generateRegularPolygon({ x: worldX, y: worldY }, 4, `poly-${Date.now()}`, finalName);
      
      dispatch({ type: 'ADD_POLYGON', payload: newPoly });
      dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined });
  };
  
  const handleContextImport = () => {
      fileInputRef.current?.click();
      dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined });
  };

  const handleStartDrawing = () => {
      dispatch({ type: 'START_DRAWING', payload: undefined });
      setShowAddMenu(false);
  };

  const commitEdgeUpdate = () => {
    if (!selectedEdge) return;
    const num = parseFloat(localLength);
    if (!isNaN(num) && localLength !== '') {
        dispatch({
            type: 'UPDATE_EDGE_LENGTH',
            payload: { edgeId: selectedEdge.id, length: num / 100 }
        });
    }
  };

  const handleEdgeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.currentTarget.blur(); // Triggers onBlur which calls commitEdgeUpdate
      }
  };

  // ... (Export logic unchanged) ...
  const handleExportJSON = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.polygons, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "survey_data.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      setShowExportMenu(false);
  };

  const handleExportDXF = () => {
      const dxfString = generateDXF(state.polygons);
      const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(dxfString);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "survey_data.dxf");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      setShowExportMenu(false);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (Array.isArray(json)) {
                  const valid = json.every(p => p.id && Array.isArray(p.vertices) && Array.isArray(p.edges));
                  if (valid) {
                      dispatch({ type: 'IMPORT_DATA', payload: json as Polygon[] });
                  } else {
                      alert("Invalid JSON format");
                  }
              }
          } catch (err) {
              console.error(err);
              alert("Failed to parse JSON");
          }
      };
      reader.readAsText(file);
      setShowExportMenu(false);
  };

  const handleCenterView = () => {
      if (state.polygons.length === 0) {
          dispatch({ type: 'PAN_ZOOM', payload: { x: 0, y: 0, zoom: 1, rotation: 0 } });
          return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasVertices = false;
      state.polygons.forEach(p => {
          p.vertices.forEach(v => {
              if (v.x < minX) minX = v.x;
              if (v.y < minY) minY = v.y;
              if (v.x > maxX) maxX = v.x;
              if (v.y > maxY) maxY = v.y;
              hasVertices = true;
          });
      });
      if (!hasVertices) {
           dispatch({ type: 'PAN_ZOOM', payload: { x: 0, y: 0, zoom: 1, rotation: 0 } });
           return;
      }
      const bboxW = maxX - minX || 100;
      const bboxH = maxY - minY || 100;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const paddingX = 60; 
      const paddingY = 200; 
      const availW = Math.max(300, window.innerWidth - paddingX);
      const availH = Math.max(300, window.innerHeight - paddingY);
      const scaleX = availW / bboxW;
      const scaleY = availH / bboxH;
      let newZoom = Math.min(scaleX, scaleY);
      newZoom = Math.min(Math.max(newZoom, 0.1), 2); 
      const newPanX = (window.innerWidth / 2) - (cx * newZoom);
      const newPanY = (window.innerHeight / 2) - (cy * newZoom);
      dispatch({ type: 'PAN_ZOOM', payload: { x: newPanX, y: newPanY, zoom: newZoom, rotation: 0 } });
  };

  // ... (renderPolygonListItem code unchanged) ...
  const renderPolygonListItem = (p: Polygon) => (
      <div 
        key={p.id}
        onClick={(e) => {
            const isCtrl = e.ctrlKey || e.metaKey;
            dispatch({ type: 'SELECT_POLYGON', payload: { id: p.id, shouldFocus: true, multi: isCtrl } });
        }}
        className={`flex items-center justify-between p-2 rounded cursor-pointer ${
            state.selectedPolygonIds.includes(p.id)
            ? 'bg-brand-100 dark:bg-brand-900/50 border border-brand-500/50' 
            : 'hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
            {state.selectedPolygonIds.includes(p.id) && <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />}
            {p.isLocked ? <Lock size={12} className="text-amber-500/70 shrink-0" /> : <Unlock size={12} className="text-slate-300 shrink-0"/>}
            
            {editingId === p.id ? (
                <input 
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => {
                        if (editName.trim()) dispatch({ type: 'RENAME_POLYGON', payload: { polygonId: p.id, name: editName.trim() }});
                        setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (editName.trim()) dispatch({ type: 'RENAME_POLYGON', payload: { polygonId: p.id, name: editName.trim() }});
                            setEditingId(null);
                        }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-white dark:bg-slate-900 border border-brand-500 rounded px-1 py-0.5 text-xs text-slate-900 dark:text-slate-100"
                />
            ) : (
                <span className={`text-sm font-medium truncate ${state.selectedPolygonIds.includes(p.id) ? 'text-brand-700 dark:text-brand-200' : ''}`}>
                    {p.name}
                </span>
            )}
        </div>
        <div className="flex items-center gap-1">
            {editingId !== p.id && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(p.id);
                        setEditName(p.name);
                    }}
                    className="p-1.5 text-slate-400 hover:text-brand-500 rounded hover:bg-slate-200 dark:hover:bg-slate-900/50"
                    title="Rename"
                >
                    <Pencil size={14} />
                </button>
            )}
            <button 
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'DELETE_POLYGON', payload: p.id });
                }}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-900/50 cursor-pointer"
                title="Delete"
            >
                <Trash2 size={16} />
            </button>
        </div>
      </div>
  );

  const buttonClass = (isActive: boolean = false) => `p-3 rounded-xl flex flex-col items-center gap-1 min-w-[56px] transition-colors ${
      isActive 
      ? 'bg-brand-500 text-white' 
      : 'bg-white/90 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-sm'
  }`;
  
  const containerClass = "bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur rounded-2xl p-1.5 shadow-xl border border-slate-200 dark:border-slate-700 flex flex-wrap justify-center items-center gap-1 sm:gap-2";

  const showBottomToolbar = (selectedPoly || state.selectedVertexIds.length === 2) && !state.isJoinMode && !state.alignState && !state.isDrawingMode && !state.contextMenu;

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10">
        
        {/* Hidden File Input for context menu */}
        <input 
             ref={fileInputRef}
             type="file" 
             accept=".json"
             className="hidden pointer-events-auto" 
             onChange={handleImportJSON}
        />

        {/* ... Top Toolbar (No Changes) ... */}
        <div className="w-full flex flex-col items-center sm:block pt-2 px-2 sm:pt-4 sm:px-4 relative pointer-events-none">
             <div className="pointer-events-auto relative z-20 flex flex-wrap justify-center gap-2">
                {!state.isDrawingMode ? (
                    <div className={containerClass}>
                        {/* Group 1: Creation & List */}
                        <div className="flex gap-1">
                            <div className="relative">
                                <button 
                                    onClick={() => { setShowAddMenu(!showAddMenu); setShowLayerMenu(false); setShowExportMenu(false); }}
                                    className={buttonClass(showAddMenu)}
                                >
                                    <Plus size={20} className={showAddMenu ? 'rotate-45 transition-transform' : 'transition-transform'}/>
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Add</span>
                                </button>
                                {showAddMenu && (
                                    <div ref={addMenuRef} className="fixed left-4 right-4 top-20 sm:absolute sm:top-full sm:left-0 sm:right-auto sm:w-64 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left text-slate-800 dark:text-slate-200">
                                        <h3 className="text-sm font-bold mb-3">New Polygon</h3>
                                        <div className="mb-3">
                                            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={newPolyName}
                                                onChange={(e) => setNewPolyName(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                                                placeholder="Enter name..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <button 
                                                onClick={handleStartDrawing}
                                                className="bg-brand-600 hover:bg-brand-500 text-white py-2 rounded-md font-semibold text-xs shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <PenTool size={14} /> Free Draw
                                            </button>
                                        </div>
                                        <div className="border-t border-slate-200 dark:border-slate-700 my-3"></div>
                                        <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2">Regular Shape</h4>
                                        <div className="flex items-center justify-between mb-4 bg-slate-100 dark:bg-slate-900 rounded-md p-2">
                                            <button 
                                                onClick={() => setNumSides(Math.max(3, numSides - 1))}
                                                className="p-2 bg-slate-200 dark:bg-slate-700 rounded hover:opacity-80"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <div className="text-center">
                                                <div className="text-xl font-bold text-brand-500 dark:text-brand-400">{numSides}</div>
                                                <div className="text-[10px] text-slate-500 uppercase">Sides</div>
                                            </div>
                                            <button 
                                                onClick={() => setNumSides(Math.min(12, numSides + 1))}
                                                className="p-2 bg-slate-200 dark:bg-slate-700 rounded hover:opacity-80"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <button 
                                            onClick={handleAddPolygon}
                                            className="w-full bg-slate-200 dark:bg-slate-700 hover:opacity-90 py-2 rounded-md font-semibold text-sm shadow-sm"
                                        >
                                            Add Regular
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <button 
                                    onClick={() => { setShowLayerMenu(!showLayerMenu); setShowAddMenu(false); setShowExportMenu(false); }}
                                    className={buttonClass(showLayerMenu)}
                                >
                                    <Layers size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">List</span>
                                </button>
                                {showLayerMenu && (
                                    <div ref={layerMenuRef} className="fixed left-4 right-4 top-20 sm:absolute sm:top-full sm:left-0 sm:right-auto sm:w-64 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left text-slate-800 dark:text-slate-200">
                                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Polygons</h3>
                                        <div className="max-h-60 overflow-y-auto space-y-1">
                                            <div 
                                                onClick={() => {
                                                    dispatch({ type: 'SELECT_POLYGON', payload: null });
                                                    setShowLayerMenu(false);
                                                }}
                                                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                                                    state.selectedPolygonIds.length === 0
                                                    ? 'bg-brand-100 dark:bg-brand-900/50 border border-brand-500/50' 
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
                                                }`}
                                            >
                                                {state.selectedPolygonIds.length === 0 ? <Check size={14} className="text-brand-600 dark:text-brand-400" /> : <div className="w-[14px]" />}
                                                <span className={`text-sm font-medium ${state.selectedPolygonIds.length === 0 ? 'text-brand-700 dark:text-brand-200' : ''}`}>
                                                    Show All (Overview)
                                                </span>
                                            </div>
                                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1 mx-2"></div>
                                            
                                            {state.polygons.length === 0 ? (
                                                <div className="text-slate-500 text-sm px-2 py-2 text-center">No polygons</div>
                                            ) : (
                                                <>
                                                    {Object.entries(polygonGroups.groups).map(([groupId, groupPolygons]) => {
                                                        const polygons = groupPolygons as Polygon[];
                                                        return (
                                                        <div key={groupId} className="rounded border border-slate-100 dark:border-slate-700/50 overflow-hidden mb-1">
                                                            <div 
                                                                onClick={(e) => toggleGroupCollapse(groupId, e)}
                                                                className="flex items-center gap-2 p-1.5 bg-slate-50 dark:bg-slate-700/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
                                                            >
                                                                {collapsedGroups.has(groupId) ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
                                                                <span className="text-xs font-bold text-slate-500 uppercase">Group</span>
                                                                <span className="text-[10px] bg-slate-200 dark:bg-slate-600 px-1 rounded-full">{polygons.length}</span>
                                                            </div>
                                                            {!collapsedGroups.has(groupId) && (
                                                                <div className="pl-2 pr-1 pb-1 pt-1 bg-white dark:bg-slate-800 space-y-1">
                                                                    {polygons.map(p => renderPolygonListItem(p))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )})}
                                                    {polygonGroups.ungrouped.map(p => renderPolygonListItem(p))}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-slate-300 dark:bg-slate-700 mx-0.5"></div>

                        {/* Group 2: Tools */}
                        <div className="flex gap-1">
                            <div className="relative">
                                <button 
                                    onClick={() => { setShowExportMenu(!showExportMenu); setShowAddMenu(false); setShowLayerMenu(false); }}
                                    className={buttonClass(showExportMenu)}
                                >
                                    <FolderOpen size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">File</span>
                                </button>
                                {showExportMenu && (
                                     <div ref={exportMenuRef} className="fixed left-4 right-4 top-20 sm:absolute sm:top-full sm:left-0 sm:right-auto sm:w-48 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left text-slate-800 dark:text-slate-200">
                                         <button onClick={() => { dispatch({ type: 'RESET_CANVAS', payload: undefined }); setShowExportMenu(false); }} className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm text-red-600 dark:text-red-400">
                                             <FileJson size={16}/> New / Reset
                                         </button>
                                         <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                         <label className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm cursor-pointer">
                                             <Upload size={16}/> Import JSON
                                         </label>
                                         <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                         <button onClick={handleExportJSON} className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm">
                                             <FileJson size={16}/> Export JSON
                                         </button>
                                         <button onClick={handleExportDXF} className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm">
                                             <FileType size={16}/> Export DXF
                                         </button>
                                     </div>
                                )}
                            </div>

                            <button onClick={handleCenterView} className={buttonClass()}>
                                <Focus size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Fit</span>
                            </button>
                        </div>

                        <div className="w-px h-8 bg-slate-300 dark:bg-slate-700 mx-0.5"></div>

                        {/* Group 3: History */}
                        <div className="flex gap-1">
                            <button 
                                onClick={() => dispatch({ type: 'UNDO', payload: undefined })}
                                disabled={state.past.length === 0}
                                className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[50px] transition-colors ${state.past.length === 0 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'}`}
                            >
                                <Undo2 size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Undo</span>
                            </button>
                            <button 
                                onClick={() => dispatch({ type: 'REDO', payload: undefined })}
                                disabled={state.future.length === 0}
                                className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[50px] transition-colors ${state.future.length === 0 ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'}`}
                            >
                                <Redo2 size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Redo</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Drawing Mode Toolbar */
                    <div className="bg-brand-900/90 backdrop-blur rounded-2xl p-1.5 shadow-xl border border-brand-700 flex items-center gap-2 animate-in slide-in-from-top-2">
                        <button 
                            onClick={() => dispatch({ type: 'CANCEL_DRAWING', payload: undefined })}
                            className="p-3 bg-red-900/50 hover:bg-red-900/80 text-red-200 rounded-xl flex flex-col items-center gap-1 min-w-[60px]"
                        >
                            <X size={20} />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Cancel</span>
                        </button>
                        <button 
                            onClick={() => dispatch({ type: 'UNDO_DRAWING_POINT', payload: undefined })}
                            disabled={state.drawingPoints.length === 0}
                            className="p-3 bg-brand-800 hover:bg-brand-700 text-brand-100 rounded-xl flex flex-col items-center gap-1 min-w-[60px]"
                        >
                            <Undo2 size={20} />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Back</span>
                        </button>
                        <div className="w-px bg-brand-700 mx-1"></div>
                        <button 
                            onClick={() => dispatch({ type: 'FINISH_DRAWING', payload: newPolyName })}
                            disabled={state.drawingPoints.length < 3}
                            className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] ${state.drawingPoints.length < 3 ? 'bg-brand-900 text-brand-500/50' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                        >
                            <CheckCircle size={20} />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Finish</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Top Right Controls (Theme & Help) ... */}
            <div className="pointer-events-auto absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex gap-2">
                 <button 
                     onClick={() => dispatch({ type: 'TOGGLE_THEME', payload: undefined })}
                     className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                     title="Toggle Theme (T)"
                 >
                     {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                 </button>
                 <button 
                     onClick={() => dispatch({type: 'TOGGLE_AI_PANEL', payload: undefined})}
                     className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-purple-600 dark:text-purple-400 hover:bg-white dark:hover:bg-slate-700"
                     title="AI Assistant"
                 >
                     <Sparkles size={18} />
                 </button>
                 <button 
                     onClick={() => setShowHelp(true)}
                     className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                     title="Help (?)"
                 >
                     <HelpCircle size={18} />
                 </button>
            </div>

            {/* Title / Status ... */}
            <div className="pointer-events-auto mt-2 sm:mt-0 sm:absolute sm:top-4 sm:left-4 z-10 flex justify-center sm:block">
                <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-700/50 text-center shadow-lg min-w-[120px]">
                    <h1 className="text-xs font-bold text-brand-600 dark:text-brand-500 uppercase tracking-wider">GeoSurvey</h1>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {state.isDrawingMode ? (
                            <span className="text-brand-500 dark:text-brand-300 font-bold animate-pulse">DRAWING MODE ({state.drawingPoints.length} pts)</span>
                        ) : (
                            state.isJoinMode ? (
                                <span className="text-yellow-600 dark:text-yellow-400 font-bold animate-pulse">SELECT TARGET EDGE</span>
                            ) : (
                                state.alignState ? (
                                    <span className="text-purple-600 dark:text-purple-400 font-bold animate-pulse">ALIGNING...</span>
                                ) : (
                                    multiSelectionCount > 1 ? (
                                        <span className="text-brand-600 dark:text-brand-400 font-bold">{multiSelectionCount} Selected</span>
                                    ) : (
                                        selectedPoly ? selectedPoly.name : `${state.polygons.length} Shape${state.polygons.length !== 1 ? 's' : ''}`
                                    )
                                )
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Solver Message ... */}
            {state.solverMsg && (
                <div className={`pointer-events-auto mt-2 sm:absolute sm:top-20 sm:right-4 sm:mt-0 max-w-[90%] sm:max-w-xs p-3 rounded-xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-top-2 z-30 ${state.solverMsg.type === 'error' ? 'bg-red-50 dark:bg-red-900/95 border-red-200 dark:border-red-700 text-red-800 dark:text-red-100' : 'bg-green-50 dark:bg-green-900/95 border-green-200 dark:border-green-700 text-green-800 dark:text-green-100'}`}>
                    {state.solverMsg.type === 'error' ? <AlertTriangle size={20} className="shrink-0 mt-0.5" /> : <CheckCircle size={20} className="shrink-0 mt-0.5" />}
                    <div className="flex-1 text-xs font-medium">
                        {state.solverMsg.text}
                    </div>
                    <button onClick={() => dispatch({ type: 'DISMISS_MESSAGE', payload: undefined })} className="p-0.5 hover:bg-black/10 dark:hover:bg-white/20 rounded"><X size={14} /></button>
                </div>
            )}
        </div>

        {/* BOTTOM TOOLBAR ... (Unchanged) */}
        {showBottomToolbar && (
            <div className="pointer-events-auto absolute bottom-6 left-0 right-0 flex justify-center z-30 animate-in slide-in-from-bottom-4">
                 <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-2xl shadow-2xl p-2 flex items-center gap-1 sm:gap-2 border border-slate-200 dark:border-slate-700">
                      {/* ... Toolbar Buttons ... */}
                      {state.selectedVertexIds.length === 2 && (
                          <>
                            <button onClick={() => dispatch({ type: 'ADD_DIAGONAL', payload: undefined })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-900"><Link size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Connect</span></button>
                            <div className="w-px h-8 bg-slate-300 dark:bg-slate-600 mx-1"></div>
                          </>
                      )}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'RECONSTRUCT_GEOMETRY', payload: selectedPoly!.id })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"><RefreshCw size={20} className={selectedPoly.isLocked ? "text-green-500" : "text-slate-500"} /><span className="text-[9px] font-bold uppercase tracking-wider">Solve</span></button>)}
                      {selectedPoly && (<div className="w-px h-8 bg-slate-300 dark:bg-slate-600 mx-1"></div>)}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'START_ALIGN_MODE', payload: undefined })} disabled={!selectedPoly.isLocked} className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] ${!selectedPoly.isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-purple-600 dark:text-purple-400'}`}><AlignStartVertical size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Align</span></button>)}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'MIRROR_POLYGON', payload: { axis: 'X' } })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"><FlipHorizontal size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Flip X</span></button>)}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'MIRROR_POLYGON', payload: { axis: 'Y' } })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"><FlipVertical size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Flip Y</span></button>)}
                      {selectedPoly && (<div className="w-px h-8 bg-slate-300 dark:bg-slate-600 mx-1"></div>)}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'DUPLICATE_POLYGON', payload: selectedPoly.id })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"><Copy size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Clone</span></button>)}
                      {selectedPoly && (<button onClick={() => dispatch({ type: 'DELETE_POLYGON', payload: selectedPoly.id })} className="p-3 rounded-xl flex flex-col items-center gap-1 min-w-[60px] hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400"><Trash2 size={20} /><span className="text-[9px] font-bold uppercase tracking-wider">Del</span></button>)}
                 </div>
            </div>
        )}

        {/* ALIGNMENT WIZARD MODAL ... */}
        {state.alignState && (
            <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-50 flex flex-col items-center">
                 <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-purple-500/30 p-4 max-w-sm w-full animate-in slide-in-from-bottom-10">
                    <div className="flex justify-between items-center mb-3">
                         <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-2"><Settings2 size={16}/> Align Polygon</h3>
                         <button onClick={() => dispatch({ type: 'CANCEL_ALIGNMENT', payload: undefined })} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500"><X size={16} /></button>
                    </div>
                    {state.alignState.step === 'SELECT_SOURCE' && <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Select an edge on the <strong>active polygon</strong> to align.</p>}
                    {state.alignState.step === 'SELECT_TARGET' && <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Select an edge on a <strong>target polygon</strong> to snap to.</p>}
                    {state.alignState.step === 'ADJUST' && (
                        <div className="space-y-4">
                             <div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mb-1"><span>Offset (Slide)</span><span>{state.alignState.offset.toFixed(2)} m</span></div>
                                <input type="range" min="-5" max="5" step="0.05" value={state.alignState.offset} onChange={(e) => dispatch({ type: 'UPDATE_ALIGN_PARAMS', payload: { offset: parseFloat(e.target.value) } })} className="w-full h-1 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                             </div>
                             <div>
                                <div className="flex justify-between text-xs font-bold text-slate-500 uppercase mb-1"><span>Gap (Distance)</span><span>{state.alignState.dist.toFixed(2)} m</span></div>
                                <input type="range" min="0" max="2" step="0.01" value={state.alignState.dist} onChange={(e) => dispatch({ type: 'UPDATE_ALIGN_PARAMS', payload: { dist: parseFloat(e.target.value) } })} className="w-full h-1 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                             </div>
                             <button onClick={() => dispatch({ type: 'CONFIRM_ALIGNMENT', payload: undefined })} className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg mt-2">APPLY</button>
                        </div>
                    )}
                 </div>
            </div>
        )}

        {/* JOIN CONFLICT MODAL ... */}
        {state.joinConflict && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-auto">
                <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => dispatch({ type: 'CANCEL_JOIN_CONFLICT', payload: undefined })}></div>
                <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2"><AlertTriangle className="text-amber-500" size={24}/> Thickness Conflict</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">The joined edges have different thicknesses. Please select which thickness to apply to both edges.</p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <button onClick={() => dispatch({ type: 'RESOLVE_JOIN_CONFLICT', payload: state.joinConflict!.sourceThickness })} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-500 bg-slate-50 dark:bg-slate-700/50 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all group"><span className="text-xs uppercase font-bold text-slate-500 group-hover:text-brand-500">Source</span><span className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{state.joinConflict!.sourceThickness} <span className="text-xs font-normal">cm</span></span></button>
                        <button onClick={() => dispatch({ type: 'RESOLVE_JOIN_CONFLICT', payload: state.joinConflict!.targetThickness })} className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-slate-200 dark:border-slate-600 hover:border-brand-500 dark:hover:border-brand-500 bg-slate-50 dark:bg-slate-700/50 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all group"><span className="text-xs uppercase font-bold text-slate-500 group-hover:text-brand-500">Target</span><span className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{state.joinConflict!.targetThickness} <span className="text-xs font-normal">cm</span></span></button>
                    </div>
                    <button onClick={() => dispatch({ type: 'CANCEL_JOIN_CONFLICT', payload: undefined })} className="w-full py-2 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Cancel Join</button>
                </div>
            </div>
        )}
        
        {/* CUSTOM CONTEXT MENU */}
        {state.contextMenu && (
            <div className="fixed inset-0 z-[100] pointer-events-auto">
                 {/* Backdrop to close on click outside */}
                 <div className="absolute inset-0" onClick={() => dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined })}></div>
                 
                 <div 
                    ref={contextMenuRef}
                    className="absolute bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-600 py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ left: state.contextMenu.x, top: state.contextMenu.y }}
                 >
                     {state.contextMenu.type === 'CANVAS' && (
                         <>
                            <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Canvas Actions</div>
                            <button onClick={handleAddPolygonAtContext} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Plus size={16} className="text-brand-500" /> Add Polygon Here</button>
                            <button onClick={handleContextImport} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><FileJson size={16} className="text-slate-400" /> Import Data</button>
                         </>
                     )}

                     {state.contextMenu.type === 'POLYGON' && state.contextMenu.targetId && (
                         <>
                            <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Polygon Actions</div>
                            <button onClick={() => { dispatch({ type: 'DUPLICATE_POLYGON', payload: state.contextMenu?.targetId }); dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Copy size={16} className="text-slate-400" /> Duplicate</button>
                             <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'RECONSTRUCT_GEOMETRY', payload: state.contextMenu.targetId }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><RefreshCw size={16} className="text-brand-500" /> Solve Geometry</button>
                             <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'DELETE_POLYGON', payload: state.contextMenu.targetId }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"><Trash2 size={16} /> Delete</button>
                         </>
                     )}

                     {state.contextMenu.type === 'EDGE' && state.contextMenu.targetId && (
                         <>
                            <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Edge Actions</div>
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SPLIT_EDGE', payload: state.contextMenu.targetId }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Split size={16} className="text-slate-400" /> Split Edge</button>
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: state.contextMenu.targetId, feature: 'door' } }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><DoorOpen size={16} className="text-amber-500" /> Mark as Door</button>
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: state.contextMenu.targetId, feature: 'window' } }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><LayoutGrid size={16} className="text-cyan-500" /> Mark as Window</button>
                             <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SELECT_EDGE', payload: { edgeId: state.contextMenu.targetId, multi: false } }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Ruler size={16} className="text-brand-500" /> Set Length / Edit</button>
                         </>
                     )}

                     {state.contextMenu.type === 'VERTEX' && state.contextMenu.targetId && (
                         <>
                            <div className="px-3 py-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Vertex Actions</div>
                            <AngleInput 
                                vertexId={state.contextMenu.targetId}
                                initialAngle={
                                    state.polygons.find(p => p.vertices.some(v => v.id === state.contextMenu?.targetId))
                                    ?.vertices.find(v => v.id === state.contextMenu?.targetId)?.fixedAngle
                                }
                                onUpdate={(val) => {
                                    if (state.contextMenu?.targetId) {
                                        dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.contextMenu.targetId, angle: val, shouldClose: false } });
                                    }
                                }}
                            />
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.contextMenu.targetId, angle: 90 } }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Square size={16} className="text-amber-500" /> Fix 90°</button>
                            <button onClick={() => { if (state.contextMenu?.targetId) { dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.contextMenu.targetId, angle: undefined } }); } dispatch({ type: 'CLOSE_CONTEXT_MENU', payload: undefined }); }} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"><Ban size={16} className="text-slate-400" /> Free Angle</button>
                         </>
                     )}
                 </div>
            </div>
        )}

        {/* Flying Edge Editor ... (Unchanged) */}
        {!state.isJoinMode && !state.alignState && !state.isDrawingMode && selectedEdge && edgeEditorPos && (
             <div 
                className="pointer-events-auto absolute z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-xl p-3 shadow-2xl border border-brand-500/50 animate-in zoom-in-95 flex flex-col gap-2 w-[280px] text-slate-800 dark:text-slate-100"
                style={{ top: edgeEditorPos.y, left: edgeEditorPos.x }}
             >
                    {/* ... Edge Editor Content (Same as before) ... */}
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-brand-600 dark:text-brand-400 font-bold text-xs uppercase flex items-center gap-2"><Ruler size={14}/> Edit Edge</span>
                        <div className="flex gap-1">
                            {selectedEdge.type === EdgeType.PERIMETER && (
                                <>
                                    <button onClick={() => dispatch({ type: 'SPLIT_EDGE', payload: selectedEdge.id })} className="text-brand-600 dark:text-brand-300 hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded" title="Split"><Split size={14} /></button>
                                    <button onClick={() => dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: selectedEdge.id, feature: selectedEdge.feature === 'door' ? null : 'door' } })} className={`${selectedEdge.feature === 'door' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-500' : 'text-slate-500 hover:text-amber-600'} hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded transition-all`} title="Toggle Door"><DoorOpen size={14} /></button>
                                     <button onClick={() => dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: selectedEdge.id, feature: selectedEdge.feature === 'window' ? null : 'window' } })} className={`${selectedEdge.feature === 'window' ? 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-500' : 'text-slate-500 hover:text-cyan-600'} hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded transition-all`} title="Toggle Window"><LayoutGrid size={14} /></button>
                                </>
                            )}
                            {selectedEdge.type === EdgeType.PERIMETER && !selectedEdge.linkedEdgeId && state.polygons.length > 1 && selectedEdgePoly?.isLocked && !canJoinMulti && (
                                <button onClick={() => dispatch({ type: 'START_JOIN_MODE', payload: selectedEdge.id })} className="text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 p-1.5 rounded" title="Join / Snap"><ArrowRightLeft size={14} /></button>
                            )}
                            {selectedEdge.linkedEdgeId && (<button onClick={() => dispatch({ type: 'UNLINK_EDGE', payload: selectedEdge.id })} className="text-[10px] bg-brand-50 dark:bg-brand-900/50 text-brand-600 dark:text-brand-200 px-2 py-1 rounded border border-brand-200 dark:border-brand-700 flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/50 hover:text-red-500" title="Unlink"><Unlink size={10} /> LINKED</button>)}
                            {selectedEdge.type === EdgeType.DIAGONAL && (<button onClick={() => dispatch({ type: 'DELETE_EDGE', payload: selectedEdge.id })} className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded" title="Delete"><Trash2 size={14} /></button>)}
                            <button onClick={() => dispatch({ type: 'SELECT_EDGE', payload: null })} className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded" title="Close"><X size={14} /></button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input key={`len-${selectedEdge.id}`} type="number" inputMode="decimal" value={localLength} onChange={(e) => setLocalLength(e.target.value)} onBlur={commitEdgeUpdate} onKeyDown={handleEdgeKeyDown} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-lg font-mono text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none" step="0.01"/>
                        <div className="flex flex-col justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">cm</div>
                    </div>
                    {selectedEdge.type === EdgeType.PERIMETER && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-1">
                             <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold"><span>Thickness</span><span>{selectedEdge.thickness || 10} cm</span></div>
                             <input type="range" min="1" max="100" value={selectedEdge.thickness || 10} onChange={(e) => dispatch({ type: 'UPDATE_EDGE_THICKNESS', payload: { edgeId: selectedEdge.id, thickness: parseInt(e.target.value) } })} className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-brand-500"/>
                        </div>
                    )}
                    {selectedEdge.feature && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                             <div className="flex gap-2 items-center"><span className="text-[10px] uppercase font-bold text-slate-500 w-16">Width</span><input className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded px-2 py-1 text-sm font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none" type="number" step="0.05" value={selectedEdge.featureWidth || (selectedEdge.feature === 'door' ? 0.8 : 1.2)} onChange={(e) => dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: selectedEdge.id, feature: selectedEdge.feature, width: parseFloat(e.target.value) } })} /><span className="text-[10px] text-slate-400">m</span></div>
                             <div className="flex gap-1 items-center justify-between">
                                 <div className="flex flex-col flex-1"><span className="text-[8px] uppercase font-bold text-slate-400 mb-0.5 ml-1">From {selectedEdgePoly?.vertices.find(v => v.id === selectedEdge.startVertexId)?.label || 'A'}</span><div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded px-1"><input type="number" step="0.05" value={selectedEdge.featureDistance !== undefined ? selectedEdge.featureDistance.toFixed(2) : ((selectedEdge.length - (selectedEdge.featureWidth || 0.8))/2).toFixed(2)} onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) { dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: selectedEdge.id, feature: selectedEdge.feature, distance: val } }); } }} className="w-full bg-transparent border-none py-1 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none" /><span className="text-[9px] text-slate-400">m</span></div></div>
                                 <div className="text-slate-300 dark:text-slate-600 px-1 mt-3">↔</div>
                                 <div className="flex flex-col flex-1"><span className="text-[8px] uppercase font-bold text-slate-400 mb-0.5 ml-1">From {selectedEdgePoly?.vertices.find(v => v.id === selectedEdge.endVertexId)?.label || 'B'}</span><div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded px-1"><input type="number" step="0.05" value={(() => { const dist = selectedEdge.featureDistance !== undefined ? selectedEdge.featureDistance : (selectedEdge.length - (selectedEdge.featureWidth || 0.8))/2; const w = selectedEdge.featureWidth || (selectedEdge.feature === 'door' ? 0.8 : 1.2); return (selectedEdge.length - dist - w).toFixed(2); })()} onChange={(e) => { const val = parseFloat(e.target.value); if (!isNaN(val)) { const w = selectedEdge.featureWidth || (selectedEdge.feature === 'door' ? 0.8 : 1.2); const newStartDist = selectedEdge.length - w - val; dispatch({ type: 'SET_EDGE_FEATURE', payload: { edgeId: selectedEdge.id, feature: selectedEdge.feature, distance: newStartDist } }); } }} className="w-full bg-transparent border-none py-1 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none" /><span className="text-[9px] text-slate-400">m</span></div></div>
                             </div>
                        </div>
                    )}
             </div>
        )}

        {/* Flying Vertex Editor */}
        {!state.isJoinMode && !state.alignState && !state.isDrawingMode && vertexEditorPos && (
             <div 
                className="pointer-events-auto absolute z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-xl p-2 shadow-2xl border border-brand-500/50 animate-in zoom-in-95 flex gap-2 items-center text-slate-800 dark:text-slate-100"
                style={{ top: vertexEditorPos.y, left: vertexEditorPos.x }}
             >
                <div className="flex items-center gap-1 border-r border-slate-200 dark:border-slate-700 pr-2 mr-0.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Angle</span>
                </div>
                
                {/* Use Helper Component */}
                <AngleInput 
                    vertexId={state.openVertexMenuId}
                    initialAngle={
                        state.polygons.find(p => p.vertices.some(v => v.id === state.openVertexMenuId))
                        ?.vertices.find(v => v.id === state.openVertexMenuId)?.fixedAngle
                    }
                    onUpdate={(val) => {
                        if (state.openVertexMenuId) {
                            dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.openVertexMenuId, angle: val, shouldClose: false } });
                        }
                    }}
                />

                <button 
                    onClick={() => {
                        if (state.openVertexMenuId) {
                            dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.openVertexMenuId, angle: 90 } });
                        }
                    }}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1"
                    title="Fix 90 Degrees"
                >
                    <Square size={16} className="text-amber-500" />
                    <span className="text-[9px] font-bold uppercase">90°</span>
                </button>
                <button 
                    onClick={() => {
                        if (state.openVertexMenuId) {
                            dispatch({ type: 'SET_VERTEX_ANGLE', payload: { vertexId: state.openVertexMenuId, angle: undefined } });
                        }
                    }}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1"
                    title="Free Angle"
                >
                    <Ban size={16} className="text-slate-400" />
                    <span className="text-[9px] font-bold uppercase">Free</span>
                </button>
                 <button 
                    onClick={() => dispatch({ type: 'CLOSE_VERTEX_MENU', payload: undefined })}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 ml-1"
                >
                    <X size={14} />
                </button>
             </div>
        )}
    </div>
  );
};