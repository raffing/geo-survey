

import React, { useState, useRef, useEffect } from 'react';
import { useSurvey } from '../context/SurveyContext';
import { generateRegularPolygon, checkConnectionStatus } from '../utils/geometry';
import { Plus, Ruler, RefreshCw, Trash2, Download, Focus, Minus, Link2, Unlink, AlertTriangle, CheckCircle, X, Layers, Check, Undo2, Redo2, Scaling, ArrowRightLeft, Square, Ban, PenTool, StopCircle, Split, PlusCircle, MoveHorizontal } from 'lucide-react';
import { EdgeType } from '../types';

export const Controls: React.FC = () => {
  const { state, dispatch } = useSurvey();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [numSides, setNumSides] = useState(4);
  const [newPolyName, setNewPolyName] = useState('');
  const [localLength, setLocalLength] = useState<string>(''); // Local state for input
  const addMenuRef = useRef<HTMLDivElement>(null);
  const layerMenuRef = useRef<HTMLDivElement>(null);
  
  const selectedPoly = state.polygons.find(p => p.id === state.selectedPolygonId);
  const selectedEdges = selectedPoly?.edges.filter(e => state.selectedEdgeIds.includes(e.id)) || [];
  const selectedEdge = selectedEdges.length === 1 ? selectedEdges[0] : null; 
  
  const selectedVerticesCount = state.selectedVertexIds.length;

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
    };
    if (showAddMenu || showLayerMenu) {
        document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddMenu, showLayerMenu]);

  useEffect(() => {
    if (showAddMenu) {
        setNewPolyName(`Polygon ${state.polygons.length + 1}`);
    }
  }, [showAddMenu, state.polygons.length]);

  useEffect(() => {
      if (selectedEdge) {
          // Convert meters to cm for display
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

      // Project vertex to screen coordinates
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

  const handleEdgeUpdate = (val: string) => {
    setLocalLength(val);
    if (!selectedEdge) return;
    const num = parseFloat(val);
    if (!isNaN(num) && val !== '') {
        // Convert input cm to meters for storage
        dispatch({
            type: 'UPDATE_EDGE_LENGTH',
            payload: { edgeId: selectedEdge.id, length: num / 100 }
        });
    }
  };

  const handleExport = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.polygons, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", "survey_data.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleCenterView = () => {
      if (state.polygons.length === 0) {
          dispatch({ type: 'PAN_ZOOM', payload: { x: 0, y: 0, zoom: 1, rotation: 0 } });
          return;
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasVertices = false;
      const targets = selectedPoly ? [selectedPoly] : state.polygons;
      targets.forEach(p => {
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

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between z-10">
        
        {/* Top Header Section */}
        <div className="w-full flex flex-col items-center sm:block pt-2 px-2 sm:pt-4 sm:px-4 relative pointer-events-none">
            
            {/* Centered Toolbar - Wrapped for responsiveness without clipping */}
            <div className="pointer-events-auto relative z-20 flex flex-wrap justify-center gap-2">
                {!state.isDrawingMode ? (
                    <div className="bg-slate-800/90 backdrop-blur rounded-2xl p-1.5 shadow-xl border border-slate-700 flex flex-wrap justify-center items-center gap-1 sm:gap-2">
                        {/* Group 1: Creation & List */}
                        <div className="flex gap-1">
                            <div className="relative">
                                <button 
                                    onClick={() => { setShowAddMenu(!showAddMenu); setShowLayerMenu(false); }}
                                    className={`p-3 text-white rounded-xl flex flex-col items-center gap-1 min-w-[56px] transition-colors ${showAddMenu ? 'bg-brand-500' : 'bg-brand-600 hover:bg-brand-500'}`}
                                >
                                    <Plus size={20} className={showAddMenu ? 'rotate-45 transition-transform' : 'transition-transform'}/>
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Add</span>
                                </button>
                                {showAddMenu && (
                                    <div ref={addMenuRef} className="fixed left-4 right-4 top-20 sm:absolute sm:top-full sm:left-0 sm:right-auto sm:w-64 mt-2 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                        <h3 className="text-sm font-bold text-slate-300 mb-3">New Polygon</h3>
                                        <div className="mb-3">
                                            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={newPolyName}
                                                onChange={(e) => setNewPolyName(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none placeholder-slate-600"
                                                placeholder="Enter name..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <button 
                                                onClick={handleStartDrawing}
                                                className="bg-brand-700 hover:bg-brand-600 text-white py-2 rounded-md font-semibold text-xs shadow-sm flex items-center justify-center gap-2"
                                            >
                                                <PenTool size={14} /> Free Draw
                                            </button>
                                        </div>
                                        <div className="border-t border-slate-700 my-3"></div>
                                        <h4 className="text-[10px] uppercase font-bold text-slate-500 mb-2">Regular Shape</h4>
                                        <div className="flex items-center justify-between mb-4 bg-slate-900 rounded-md p-2">
                                            <button 
                                                onClick={() => setNumSides(Math.max(3, numSides - 1))}
                                                className="p-2 bg-slate-700 rounded hover:bg-slate-600 text-slate-200"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <div className="text-center">
                                                <div className="text-xl font-bold text-brand-400">{numSides}</div>
                                                <div className="text-[10px] text-slate-500 uppercase">Sides</div>
                                            </div>
                                            <button 
                                                onClick={() => setNumSides(Math.min(12, numSides + 1))}
                                                className="p-2 bg-slate-700 rounded hover:bg-slate-600 text-slate-200"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                        <button 
                                            onClick={handleAddPolygon}
                                            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-2 rounded-md font-semibold text-sm shadow-sm"
                                        >
                                            Add Regular
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="relative">
                                <button 
                                    onClick={() => { setShowLayerMenu(!showLayerMenu); setShowAddMenu(false); }}
                                    className={`p-3 text-slate-200 hover:text-white rounded-xl flex flex-col items-center gap-1 min-w-[56px] transition-colors ${showLayerMenu ? 'bg-slate-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                                >
                                    <Layers size={20} />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">List</span>
                                </button>
                                {showLayerMenu && (
                                    <div ref={layerMenuRef} className="fixed left-4 right-4 top-20 sm:absolute sm:top-full sm:left-0 sm:right-auto sm:w-64 mt-2 bg-slate-800 border border-slate-600 rounded-lg p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-left">
                                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">Polygons</h3>
                                        <div className="max-h-60 overflow-y-auto space-y-1">
                                            <div 
                                                onClick={() => {
                                                    dispatch({ type: 'SELECT_POLYGON', payload: null });
                                                    setShowLayerMenu(false);
                                                }}
                                                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                                                    state.selectedPolygonId === null
                                                    ? 'bg-brand-900/50 border border-brand-500/50' 
                                                    : 'hover:bg-slate-700 border border-transparent'
                                                }`}
                                            >
                                                {state.selectedPolygonId === null ? <Check size={14} className="text-brand-400" /> : <div className="w-[14px]" />}
                                                <span className={`text-sm font-medium ${state.selectedPolygonId === null ? 'text-brand-200' : 'text-slate-300'}`}>
                                                    Show All (Overview)
                                                </span>
                                            </div>
                                            <div className="h-px bg-slate-700 my-1 mx-2"></div>
                                            {state.polygons.length === 0 ? (
                                                <div className="text-slate-500 text-sm px-2 py-2 text-center">No polygons</div>
                                            ) : (
                                                state.polygons.map(p => (
                                                    <div 
                                                        key={p.id}
                                                        onClick={() => {
                                                            dispatch({ type: 'SELECT_POLYGON', payload: p.id });
                                                        }}
                                                        className={`flex items-center justify-between p-2 rounded cursor-pointer ${
                                                            p.id === state.selectedPolygonId 
                                                            ? 'bg-brand-900/50 border border-brand-500/50' 
                                                            : 'hover:bg-slate-700 border border-transparent'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {p.id === state.selectedPolygonId && <Check size={14} className="text-brand-400" />}
                                                            <span className={`text-sm font-medium ${p.id === state.selectedPolygonId ? 'text-brand-200' : 'text-slate-300'}`}>
                                                                {p.name}
                                                            </span>
                                                        </div>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                dispatch({ type: 'DELETE_POLYGON', payload: p.id });
                                                            }}
                                                            className="p-2 text-slate-500 hover:text-red-400 rounded hover:bg-slate-900/50 cursor-pointer"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-slate-700 mx-0.5"></div>

                        {/* Group 2: Tools */}
                        <div className="flex gap-1">
                            <button onClick={handleExport} className="p-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl flex flex-col items-center gap-1 min-w-[50px]">
                                <Download size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Exp</span>
                            </button>
                            <button onClick={handleCenterView} className="p-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl flex flex-col items-center gap-1 min-w-[50px]">
                                <Focus size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Fit</span>
                            </button>
                        </div>

                        <div className="w-px h-8 bg-slate-700 mx-0.5"></div>

                        {/* Group 3: History */}
                        <div className="flex gap-1">
                            <button 
                                onClick={() => dispatch({ type: 'UNDO', payload: undefined })}
                                disabled={state.past.length === 0}
                                className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[50px] ${state.past.length === 0 ? 'text-slate-600 cursor-not-allowed bg-slate-800' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
                            >
                                <Undo2 size={20} /> <span className="text-[9px] font-bold uppercase tracking-wider">Undo</span>
                            </button>
                            <button 
                                onClick={() => dispatch({ type: 'REDO', payload: undefined })}
                                disabled={state.future.length === 0}
                                className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[50px] ${state.future.length === 0 ? 'text-slate-600 cursor-not-allowed bg-slate-800' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
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

            {/* Responsive Title / Status - Below toolbar on mobile, Top-Right on desktop */}
            <div className="pointer-events-auto mt-2 sm:mt-0 sm:absolute sm:top-4 sm:right-4 z-10 flex justify-center sm:block">
                <div className="bg-slate-800/80 backdrop-blur rounded-lg px-3 py-1.5 border border-slate-700/50 text-center shadow-lg min-w-[120px]">
                    <h1 className="text-xs font-bold text-brand-500 uppercase tracking-wider">GeoSurvey</h1>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {state.isDrawingMode ? (
                            <span className="text-brand-300 font-bold animate-pulse">DRAWING MODE ({state.drawingPoints.length} pts)</span>
                        ) : (
                            state.isJoinMode ? (
                                <span className="text-yellow-400 font-bold animate-pulse">SELECT TARGET EDGE</span>
                            ) : (
                                selectedPoly ? selectedPoly.name : `${state.polygons.length} Shape${state.polygons.length !== 1 ? 's' : ''}`
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Solver Message - Displayed below title/toolbar in the stack */}
            {state.solverMsg && (
                <div className={`pointer-events-auto mt-2 sm:absolute sm:top-20 sm:right-4 sm:mt-0 max-w-[90%] sm:max-w-xs p-3 rounded-xl shadow-2xl border flex items-start gap-3 animate-in slide-in-from-top-2 z-30 ${state.solverMsg.type === 'error' ? 'bg-red-900/95 border-red-700 text-red-100' : 'bg-green-900/95 border-green-700 text-green-100'}`}>
                    {state.solverMsg.type === 'error' ? <AlertTriangle size={20} className="shrink-0 mt-0.5" /> : <CheckCircle size={20} className="shrink-0 mt-0.5" />}
                    <div className="flex-1 text-xs font-medium">
                        {state.solverMsg.text}
                    </div>
                    <button onClick={() => dispatch({ type: 'DISMISS_MESSAGE', payload: undefined })} className="p-0.5 hover:bg-white/20 rounded"><X size={14} /></button>
                </div>
            )}
        </div>

        {/* Vertex Context Menu (Popup) */}
        {vertexMenuNode && (
            <div 
                className="pointer-events-auto absolute bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 z-50 flex gap-2 animate-in zoom-in-95"
                style={{ 
                    top: vertexMenuNode.y - 60, // Position above vertex
                    left: vertexMenuNode.x,
                    transform: 'translateX(-50%)' 
                }}
            >
                <button 
                     onClick={() => dispatch({ 
                         type: 'SET_VERTEX_ANGLE', 
                         payload: { vertexId: vertexMenuNode.vertex.id, angle: 90 } 
                     })}
                     className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 ${vertexMenuNode.vertex.fixedAngle === 90 ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                >
                    <Square size={14} /> 90°
                </button>
                <button 
                     onClick={() => dispatch({ 
                         type: 'SET_VERTEX_ANGLE', 
                         payload: { vertexId: vertexMenuNode.vertex.id, angle: undefined } 
                     })}
                     className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 ${vertexMenuNode.vertex.fixedAngle === undefined ? 'bg-brand-600 text-white' : 'bg-slate-700 text-slate-200 hover:bg-slate-600'}`}
                >
                    <Ban size={14} /> Free
                </button>
                <div className="w-px bg-slate-600 mx-1"></div>
                <button 
                     onClick={() => dispatch({ 
                         type: 'DELETE_VERTEX', 
                         payload: vertexMenuNode.vertex.id 
                     })}
                     className="px-3 py-2 bg-red-900/50 text-red-300 hover:bg-red-900/80 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                    <Trash2 size={14} />
                </button>
                <div className="w-px bg-slate-600 mx-1"></div>
                <button 
                     onClick={() => dispatch({ type: 'CLOSE_VERTEX_MENU', payload: undefined })}
                     className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg"
                >
                    <X size={14} />
                </button>
                
                {/* Little triangle arrow pointing down */}
                <div className="absolute top-full left-1/2 -ml-2 -mt-px w-4 h-4 overflow-hidden">
                    <div className="w-3 h-3 bg-slate-800 border-r border-b border-slate-600 rotate-45 transform origin-top-left translate-x-1/2"></div>
                </div>
            </div>
        )}

        {/* Drawing Mode Hint */}
        {state.isDrawingMode && (
             <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-full text-xs text-brand-200 font-bold shadow-xl border border-brand-500/30 w-max max-w-[90%] text-center">
                 Tap to add points. Tap the start point to close.
             </div>
        )}

        <div className="pointer-events-auto p-4 space-y-3 flex flex-col justify-end">
            
            {state.isJoinMode && (
                <div className="bg-yellow-900/80 backdrop-blur border border-yellow-600/50 p-4 rounded-xl text-center shadow-2xl animate-in slide-in-from-bottom-5">
                    <p className="text-yellow-100 font-bold mb-2">Select an edge on another polygon to join.</p>
                    <button onClick={() => dispatch({ type: 'SELECT_POLYGON', payload: selectedPoly?.id || null })} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2 rounded-lg font-bold">CANCEL</button>
                </div>
            )}

            {!state.isJoinMode && !state.isDrawingMode && selectedVerticesCount === 2 && canConnect && (
                 <div className="flex justify-end animate-in slide-in-from-bottom-5">
                    <button onClick={() => dispatch({ type: 'ADD_DIAGONAL', payload: undefined })} className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-bold shadow-lg flex items-center gap-2">
                        <Link2 size={20} /> CONNECT
                    </button>
                 </div>
            )}

            {/* Edge Editor */}
            {!state.isJoinMode && !state.isDrawingMode && selectedEdge && (
                <div className="bg-slate-800/95 backdrop-blur-md rounded-xl p-4 shadow-xl border border-brand-500/50 animate-in slide-in-from-bottom-5 space-y-3">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-brand-400 font-bold text-sm uppercase flex items-center gap-2">
                            <Ruler size={16}/> Measure Input
                        </span>
                        <div className="flex gap-2">
                            {selectedEdge.type === EdgeType.PERIMETER && (
                                <button onClick={() => dispatch({ type: 'SPLIT_EDGE', payload: selectedEdge.id })} className="text-brand-300 hover:text-white p-2 bg-slate-700 hover:bg-slate-600 rounded flex items-center gap-1 text-xs font-bold" title="Add Node">
                                    <PlusCircle size={14} /> SPLIT
                                </button>
                            )}
                            {selectedEdge.type === EdgeType.PERIMETER && state.polygons.length > 1 && !selectedEdge.linkedEdgeId && (
                                <button onClick={() => dispatch({ type: 'START_JOIN_MODE', payload: selectedEdge.id })} className="text-yellow-400 hover:text-yellow-300 p-2 bg-yellow-900/30 rounded flex items-center gap-1 text-xs font-bold" title="Join Polygons">
                                    <ArrowRightLeft size={14} /> JOIN
                                </button>
                            )}
                            {selectedEdge.linkedEdgeId && (
                                <div className="text-[10px] bg-brand-900/50 text-brand-200 px-2 py-1 rounded border border-brand-700 flex items-center gap-1">
                                    <Link2 size={10} /> LINKED
                                </div>
                            )}
                            {selectedEdge.type === EdgeType.DIAGONAL && (
                                <button onClick={() => dispatch({ type: 'DELETE_EDGE', payload: selectedEdge.id })} className="text-red-400 hover:text-red-300 p-2 bg-red-900/30 rounded" title="Delete Diagonal">
                                    <Unlink size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <input 
                            type="number" 
                            value={localLength}
                            onChange={(e) => handleEdgeUpdate(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-xl font-mono text-white focus:border-brand-500 focus:outline-none"
                            step="0.01"
                        />
                        <div className="flex flex-col justify-center text-slate-400 font-bold text-sm px-2">cm</div>
                    </div>

                    {selectedEdge.type === EdgeType.PERIMETER && (
                        <div className="pt-2 border-t border-slate-700 space-y-3">
                             
                             {selectedEdge.linkedEdgeId && (
                                 <div className="bg-slate-700/50 p-2 rounded-lg">
                                     <div className="flex justify-between text-[10px] text-brand-300 uppercase font-bold mb-1">
                                        <span className="flex items-center gap-1"><MoveHorizontal size={10} /> Alignment Offset</span>
                                        <span>{(selectedEdge.alignmentOffset || 0).toFixed(2)} m</span>
                                     </div>
                                     <input 
                                        type="number" 
                                        value={selectedEdge.alignmentOffset || 0}
                                        onChange={(e) => dispatch({ 
                                            type: 'UPDATE_EDGE_ALIGNMENT', 
                                            payload: { edgeId: selectedEdge.id, offset: parseFloat(e.target.value) || 0 } 
                                        })}
                                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white"
                                        step="0.05"
                                     />
                                 </div>
                             )}

                             <div>
                                 <div className="flex justify-between text-[10px] text-slate-400 uppercase font-bold mb-1">
                                    <span>Wall Thickness</span>
                                    <span>{(selectedEdge.thickness || 10).toFixed(0)} cm</span>
                                 </div>
                                 <input 
                                    type="range" 
                                    min="5" max="100" 
                                    value={selectedEdge.thickness || 10}
                                    onChange={(e) => dispatch({ 
                                        type: 'UPDATE_EDGE_THICKNESS', 
                                        payload: { edgeId: selectedEdge.id, thickness: parseInt(e.target.value) } 
                                    })}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                                 />
                             </div>
                        </div>
                    )}
                </div>
            )}
            
            {!state.isDrawingMode && !state.isJoinMode && selectedPoly && (
                <div className="flex gap-2 justify-end">
                    {/* Constraints Badge */}
                    {constraintStats && (
                         <div className={`flex items-center gap-1 px-3 py-2 rounded-xl border text-xs font-bold uppercase shadow-sm ${
                             constraintStats.current > constraintStats.needed 
                             ? 'bg-blue-900/50 border-blue-500 text-blue-200'
                             : (constraintStats.current === constraintStats.needed 
                                ? 'bg-green-900/50 border-green-500 text-green-200' 
                                : 'bg-amber-900/50 border-amber-500 text-amber-200')
                         }`}>
                             <StopCircle size={14} />
                             {constraintStats.current}/{constraintStats.needed}
                         </div>
                    )}

                    <button 
                        onClick={() => dispatch({ type: 'RECONSTRUCT_GEOMETRY', payload: selectedPoly.id })}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-4 rounded-xl font-bold shadow-lg flex items-center gap-2 flex-1 justify-center active:scale-95 transition-transform"
                    >
                        <RefreshCw size={20} />
                        SOLVE
                    </button>
                </div>
            )}
            
            {!state.isDrawingMode && !selectedPoly && state.polygons.length === 0 && (
                <div className="text-center p-4 bg-slate-800/50 rounded-xl text-slate-400 text-sm">
                    Tap "Add" to start a new survey sketch.
                </div>
            )}
        </div>
    </div>
  );
};
