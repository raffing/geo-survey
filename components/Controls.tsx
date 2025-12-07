
import React, { useState, useRef, useEffect } from 'react';
import { useSurvey } from '../context/SurveyContext';
import { generateRegularPolygon, checkConnectionStatus, generateDXF } from '../utils/geometry';
import { Plus, Ruler, RefreshCw, Trash2, Download, Focus, Minus, Link2, Unlink, AlertTriangle, CheckCircle, X, Layers, Check, Undo2, Redo2, Scaling, ArrowRightLeft, Square, Ban, PenTool, StopCircle, Split, PlusCircle, MoveHorizontal, FileJson, FileType, Upload, FolderOpen, Sun, Moon, HelpCircle, Command, FilePlus, Pencil } from 'lucide-react';
import { EdgeType, Polygon } from '../types';

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

  const addMenuRef = useRef<HTMLDivElement>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const selectedPoly = state.polygons.find(p => p.id === state.selectedPolygonId);
  const selectedEdges = selectedPoly?.edges.filter(e => state.selectedEdgeIds.includes(e.id)) || [];
  const selectedEdge = selectedEdges.length === 1 ? selectedEdges[0] : null; 
  
  const selectedVerticesCount = state.selectedVertexIds.length;

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
              if (showHelp) setShowHelp(false);
              setShowAddMenu(false);
              setShowLayerMenu(false);
              setShowExportMenu(false);
              setEditingId(null);
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedPoly && !selectedEdge && state.selectedVertexIds.length === 0 && !editingId) {
                  dispatch({ type: 'DELETE_POLYGON', payload: selectedPoly.id });
              }
              if (selectedEdge && selectedEdge.type === EdgeType.DIAGONAL) {
                  dispatch({ type: 'DELETE_EDGE', payload: selectedEdge.id });
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPoly, selectedEdge, state.selectedVertexIds, state.isDrawingMode, showHelp, editingId]);

  // Constraint Status calculation
  const constraintStats = React.useMemo(() => {
      if (!selectedPoly) return null;
      const v = selectedPoly.vertices.length;
      if (v < 3) return null;
      const needed = Math.max(0, v - 3);
      
      const diags = selectedPoly.edges.filter(e => e.type === EdgeType.DIAGONAL).length;
      const angles = selectedPoly.vertices.filter(p => p.fixedAngle !== undefined).length;
      const current = diags + angles;
      
      return { current, needed };
  }, [selectedPoly]);

  // Connection Check
  const canConnect = React.useMemo(() => {
      if (!selectedPoly || selectedVerticesCount !== 2) return false;
      const v1 = state.selectedVertexIds[0];
      const v2 = state.selectedVertexIds[1];
      const status = checkConnectionStatus(v1, v2, selectedPoly);
      return status.valid;
  }, [selectedPoly, selectedVerticesCount, state.selectedVertexIds]);

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
    };
    if (showAddMenu || showLayerMenu || showExportMenu) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddMenu, showLayerMenu, showExportMenu]);

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

  // Vertex Menu Calculation
  const vertexMenuNode = React.useMemo(() => {
      if (!state.openVertexMenuId || !selectedPoly) return null;
      const v = selectedPoly.vertices.find(v => v.id === state.openVertexMenuId);
      if (!v) return null;

      const rad = state.rotation;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const sx = v.x * state.zoomLevel;
      const sy = v.y * state.zoomLevel;
      const rx = sx * cos - sy * sin;
      const ry = sx * sin + sy * cos;
      const x = rx + state.panOffset.x;
      const y = ry + state.panOffset.y;

      return { vertex: v, x, y };
  }, [state.openVertexMenuId, selectedPoly, state.zoomLevel, state.panOffset, state.rotation]);

  // Edge Editor Position Calculation (Flying)
  const edgeEditorPos = React.useMemo(() => {
      if (!selectedEdge || !selectedPoly) return null;
      const v1 = selectedPoly.vertices.find(v => v.id === selectedEdge.startVertexId);
      const v2 = selectedPoly.vertices.find(v => v.id === selectedEdge.endVertexId);
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
      const EDITOR_W = 260;
      const EDITOR_H = 180;
      
      let safeX = x + 20; 
      let safeY = y + 20; 

      if (safeX + EDITOR_W > window.innerWidth) safeX = x - EDITOR_W - 20;
      if (safeY + EDITOR_H > window.innerHeight) safeY = y - EDITOR_H - 20;

      safeX = Math.max(10, safeX);
      safeY = Math.max(80, safeY); 

      return { x: safeX, y: safeY };
  }, [selectedEdge, selectedPoly, state.zoomLevel, state.panOffset, state.rotation]);

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

  const buttonClass = (isActive: boolean = false) => `p-3 rounded-xl flex flex-col items-center gap-1 min-w-[56px] transition-colors ${
      isActive 
      ? 'bg-brand-500 text-white' 
      : 'bg-white/90 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 shadow-sm'
  }`;
  
  const containerClass = "bg-slate-100/90 dark:bg-slate-800/90 backdrop-blur rounded-2xl p-1.5 shadow-xl border border-slate-200 dark:border-slate-700 flex flex-wrap justify-center items-center gap-1 sm:gap-2";

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10">
        
        {/* Top Header Section */}
        <div className="w-full flex flex-col items-center sm:block pt-2 px-2 sm:pt-4 sm:px-4 relative pointer-events-none">
            
            {/* Centered Toolbar */}
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
                                                    state.selectedPolygonId === null
                                                    ? 'bg-brand-100 dark:bg-brand-900/50 border border-brand-500/50' 
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
                                                }`}
                                            >
                                                {state.selectedPolygonId === null ? <Check size={14} className="text-brand-600 dark:text-brand-400" /> : <div className="w-[14px]" />}
                                                <span className={`text-sm font-medium ${state.selectedPolygonId === null ? 'text-brand-700 dark:text-brand-200' : ''}`}>
                                                    Show All (Overview)
                                                </span>
                                            </div>
                                            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1 mx-2"></div>
                                            {state.polygons.length === 0 ? (
                                                <div className="text-slate-500 text-sm px-2 py-2 text-center">No polygons</div>
                                            ) : (
                                                state.polygons.map(p => (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => {
                                                            dispatch({ type: 'SELECT_POLYGON', payload: { id: p.id, shouldFocus: true } });
                                                        }}
                                                        className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                                                            p.id === state.selectedPolygonId 
                                                            ? 'bg-brand-100 dark:bg-brand-900/50 border border-brand-500/50' 
                                                            : 'hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 flex-1">
                                                            {p.id === state.selectedPolygonId && <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />}
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
                                                                <span className={`text-sm font-medium truncate ${p.id === state.selectedPolygonId ? 'text-brand-700 dark:text-brand-200' : ''}`}>
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
                                                                className="p-1.5 text-slate-500 hover:text-red-500 rounded hover:bg-slate-200 dark:hover:bg-slate-900/50 cursor-pointer"
                                                                title="Delete"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
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
                                             <FilePlus size={16}/> New / Reset
                                         </button>
                                         <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
                                         <label className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-sm cursor-pointer">
                                             <Upload size={16}/> Import JSON
                                             <input 
                                                 ref={fileInputRef}
                                                 type="file" 
                                                 accept=".json"
                                                 className="hidden" 
                                                 onChange={handleImportJSON}
                                             />
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

            {/* Top Right Controls (Theme & Help) */}
            <div className="pointer-events-auto absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex gap-2">
                 <button 
                     onClick={() => dispatch({ type: 'TOGGLE_THEME', payload: undefined })}
                     className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                     title="Toggle Theme (T)"
                 >
                     {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                 </button>
                 <button 
                     onClick={() => setShowHelp(true)}
                     className="p-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur rounded-lg border border-slate-200 dark:border-slate-700 shadow-md text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                     title="Help (?)"
                 >
                     <HelpCircle size={18} />
                 </button>
            </div>

            {/* Title / Status */}
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
                                selectedPoly ? selectedPoly.name : `${state.polygons.length} Shape${state.polygons.length !== 1 ? 's' : ''}`
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Solver Message */}
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

        {/* Flying Edge Editor */}
        {!state.isJoinMode && !state.isDrawingMode && selectedEdge && edgeEditorPos && (
             <div 
                className="pointer-events-auto absolute z-40 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-xl p-3 shadow-2xl border border-brand-500/50 animate-in zoom-in-95 flex flex-col gap-2 w-[260px] text-slate-800 dark:text-slate-100"
                style={{ top: edgeEditorPos.y, left: edgeEditorPos.x }}
             >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-brand-600 dark:text-brand-400 font-bold text-xs uppercase flex items-center gap-2">
                            <Ruler size={14}/> Edit Edge
                        </span>
                        <div className="flex gap-1">
                            {selectedEdge.type === EdgeType.PERIMETER && (
                                <button onClick={() => dispatch({ type: 'SPLIT_EDGE', payload: selectedEdge.id })} className="text-brand-600 dark:text-brand-300 hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded" title="Split">
                                    <Split size={14} />
                                </button>
                            )}
                            {selectedEdge.type === EdgeType.PERIMETER && !selectedEdge.linkedEdgeId && state.polygons.length > 1 && (
                                <button 
                                    onClick={() => dispatch({ type: 'SHOW_MESSAGE', payload: { type: 'success', text: 'Future Implementation' } })} 
                                    className="text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 p-1.5 rounded" 
                                    title="Join (Future)"
                                >
                                    <ArrowRightLeft size={14} />
                                </button>
                            )}
                            {selectedEdge.linkedEdgeId && (
                                <button onClick={() => dispatch({ type: 'UNLINK_EDGE', payload: selectedEdge.id })} className="text-[10px] bg-brand-50 dark:bg-brand-900/50 text-brand-600 dark:text-brand-200 px-2 py-1 rounded border border-brand-200 dark:border-brand-700 flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-900/50 hover:text-red-500" title="Unlink">
                                    <Unlink size={10} /> LINKED
                                </button>
                            )}
                            {selectedEdge.type === EdgeType.DIAGONAL && (
                                <button onClick={() => dispatch({ type: 'DELETE_EDGE', payload: selectedEdge.id })} className="text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 p-1.5 rounded" title="Delete">
                                    <Trash2 size={14} />
                                </button>
                            )}
                            <button onClick={() => dispatch({ type: 'SELECT_EDGE', payload: null })} className="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 p-1.5 rounded" title="Close">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <input 
                            key={selectedEdge.id}
                            type="number" 
                            inputMode="decimal"
                            value={localLength}
                            onChange={(e) => setLocalLength(e.target.value)}
                            onBlur={commitEdgeUpdate}
                            onKeyDown={handleEdgeKeyDown}
                            className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-2 text-lg font-mono text-slate-900 dark:text-white focus:border-brand-500 focus:outline-none"
                            step="0.01"
                        />
                        <div className="flex flex-col justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">cm</div>
                    </div>

                    {selectedEdge.type === EdgeType.PERIMETER && (
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                                {selectedEdge.linkedEdgeId && (
                                    <div className="bg-slate-100 dark:bg-slate-700/50 p-2 rounded-lg">
                                        <div className="flex justify-between text-[10px] text-brand-600 dark:text-brand-300 uppercase font-bold mb-1">
                                            <span className="flex items-center gap-1"><MoveHorizontal size={10} /> Offset</span>
                                            <span>{(selectedEdge.alignmentOffset || 0).toFixed(2)} m</span>
                                        </div>
                                        <input 
                                        type="number" 
                                        value={selectedEdge.alignmentOffset || 0}
                                        onChange={(e) => dispatch({ 
                                            type: 'UPDATE_EDGE_ALIGNMENT', 
                                            payload: { edgeId: selectedEdge.id, offset: parseFloat(e.target.value) || 0 } 
                                        })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                                        step="0.05"
                                        />
                                    </div>
                                )}
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">
                                        <span>Thickness: {(selectedEdge.thickness || 10).toFixed(0)} cm</span>
                                    </div>
                                    <input 
                                    type="range" 
                                    min="5" max="100" 
                                    value={selectedEdge.thickness || 10}
                                    onChange={(e) => dispatch({ 
                                        type: 'UPDATE_EDGE_THICKNESS', 
                                        payload: { edgeId: selectedEdge.id, thickness: parseInt(e.target.value) } 
                                    })}
                                    className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                                    />
                                </div>
                        </div>
                    )}
             </div>
        )}

        {/* Vertex Context Menu (Popup) */}
        {vertexMenuNode && (
            <div 
                className="pointer-events-auto absolute bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-2xl p-2 z-50 flex gap-2 animate-in zoom-in-95"
                style={{ 
                    top: vertexMenuNode.y - 60, 
                    left: vertexMenuNode.x,
                    transform: 'translateX(-50%)' 
                }}
            >
                <button 
                     onClick={() => dispatch({ 
                         type: 'SET_VERTEX_ANGLE', 
                         payload: { vertexId: vertexMenuNode.vertex.id, angle: 90 } 
                     })}
                     className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 ${vertexMenuNode.vertex.fixedAngle === 90 ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                >
                    <Square size={14} /> 90°
                </button>
                <button 
                     onClick={() => dispatch({ 
                         type: 'SET_VERTEX_ANGLE', 
                         payload: { vertexId: vertexMenuNode.vertex.id, angle: undefined } 
                     })}
                     className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 ${vertexMenuNode.vertex.fixedAngle === undefined ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
                >
                    <Ban size={14} /> Free
                </button>
                <div className="w-px bg-slate-200 dark:bg-slate-600 mx-1"></div>
                <button 
                     onClick={() => dispatch({ 
                         type: 'DELETE_VERTEX', 
                         payload: vertexMenuNode.vertex.id 
                     })}
                     className="px-3 py-2 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/80 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                    <Trash2 size={14} />
                </button>
                <div className="w-px bg-slate-200 dark:bg-slate-600 mx-1"></div>
                <button 
                     onClick={() => dispatch({ type: 'CLOSE_VERTEX_MENU', payload: undefined })}
                     className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                >
                    <X size={14} />
                </button>
                
                <div className="absolute top-full left-1/2 -ml-2 -mt-px w-4 h-4 overflow-hidden">
                    <div className="w-3 h-3 bg-white dark:bg-slate-800 border-r border-b border-slate-200 dark:border-slate-600 rotate-45 transform origin-top-left translate-x-1/2"></div>
                </div>
            </div>
        )}

        {/* HELP MODAL */}
        {showHelp && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-auto">
                <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowHelp(false)}></div>
                <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto flex flex-col border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <HelpCircle size={20} className="text-brand-500"/> User Guide
                        </h2>
                        <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-500">
                            <X size={20}/>
                        </button>
                    </div>
                    <div className="p-6 space-y-6 text-slate-600 dark:text-slate-300 text-sm">
                        <section>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2 uppercase text-xs tracking-wider">Shortcuts</h3>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>Add Polygon</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">A</kbd></div>
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>List View</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">L</kbd></div>
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>Free Draw</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">D</kbd></div>
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>Solve Geometry</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">S</kbd></div>
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>Toggle Theme</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">T</kbd></div>
                                <div className="flex justify-between p-2 bg-slate-50 dark:bg-slate-700/50 rounded"><span>Delete Selected</span> <kbd className="font-mono bg-slate-200 dark:bg-slate-600 px-1 rounded">Del</kbd></div>
                            </div>
                        </section>
                        
                        <section>
                            <h3 className="font-bold text-slate-900 dark:text-white mb-2 uppercase text-xs tracking-wider">Workflow</h3>
                            <ul className="list-disc pl-4 space-y-1">
                                <li><strong>Add Shapes:</strong> Use the "Add" menu to create regular polygons or sketch freely.</li>
                                <li><strong>Edit Measures:</strong> Tap any edge to input real-world measurements freely.</li>
                                <li><strong>Triangulate:</strong> Add diagonal connections between vertices to rigidify the shape.</li>
                                <li><strong>Solve:</strong> Press "Solve" to reconstruct the geometry based on your measurements.</li>
                                <li><strong>Join:</strong> Snap and align a polygon to another (Polygons remain independent).</li>
                            </ul>
                        </section>
                    </div>
                </div>
            </div>
        )}

        {/* Drawing Mode Hint */}
        {state.isDrawingMode && (
             <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-full text-xs text-brand-200 font-bold shadow-xl border border-brand-500/30 w-max max-w-[90%] text-center">
                 Tap to add points. Tap the start point to close.
             </div>
        )}

        {/* BOTTOM SECTION */}
        <div className="pointer-events-auto w-full p-4 flex flex-col justify-end space-y-3 sm:max-w-md sm:ml-auto sm:mr-4">
            
            {state.isJoinMode && (
                <div className="bg-yellow-100 dark:bg-yellow-900/80 backdrop-blur border border-yellow-300 dark:border-yellow-600/50 p-4 rounded-xl text-center shadow-2xl animate-in slide-in-from-bottom-5">
                    <p className="text-yellow-800 dark:text-yellow-100 font-bold mb-2">Select an edge on another polygon to join.</p>
                    <button onClick={() => dispatch({ type: 'SELECT_POLYGON', payload: selectedPoly?.id || null })} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white px-6 py-2 rounded-lg font-bold border border-slate-200 dark:border-slate-600">CANCEL</button>
                </div>
            )}

            {!state.isJoinMode && !state.isDrawingMode && selectedVerticesCount === 2 && canConnect && (
                 <div className="flex justify-end animate-in slide-in-from-bottom-5">
                    <button onClick={() => dispatch({ type: 'ADD_DIAGONAL', payload: undefined })} className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2">
                        <Link2 size={20} /> CONNECT
                    </button>
                 </div>
            )}
            
            {/* SOLVE BUTTON AREA - ALWAYS VISIBLE */}
            {!state.isDrawingMode && !state.isJoinMode && (
                <div className="flex gap-2 justify-end">
                    {/* Constraints Badge (Only if selected) */}
                    {selectedPoly && constraintStats && (
                         <div className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-bold uppercase shadow-sm ${
                             constraintStats.current > constraintStats.needed 
                             ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500 text-blue-800 dark:text-blue-200'
                             : (constraintStats.current === constraintStats.needed 
                                ? 'bg-green-100 dark:bg-green-900/50 border-green-500 text-green-800 dark:text-green-200' 
                                : 'bg-amber-100 dark:bg-amber-900/50 border-amber-500 text-amber-800 dark:text-amber-200')
                         }`}>
                             <StopCircle size={14} />
                             {constraintStats.current}/{constraintStats.needed}
                         </div>
                    )}

                    <button 
                        onClick={() => selectedPoly && dispatch({ type: 'RECONSTRUCT_GEOMETRY', payload: selectedPoly.id })}
                        disabled={!selectedPoly}
                        className={`px-6 py-4 rounded-xl font-bold shadow-lg flex items-center gap-2 flex-1 justify-center transition-transform ${
                            selectedPoly 
                            ? 'bg-green-600 hover:bg-green-500 text-white active:scale-95 cursor-pointer' 
                            : 'bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-slate-200 dark:border-slate-600'
                        }`}
                        title="Solve (S)"
                    >
                        <RefreshCw size={20} />
                        SOLVE
                    </button>
                </div>
            )}
            
            {!state.isDrawingMode && !selectedPoly && state.polygons.length === 0 && (
                <div className="text-center p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl text-slate-500 dark:text-slate-400 text-sm">
                    Tap "Add" to start a new survey sketch.
                </div>
            )}
        </div>
    </div>
  );
};
