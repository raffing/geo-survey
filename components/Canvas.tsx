
import React, { useRef, useState, useMemo } from 'react';
import { useSurvey } from '../context/SurveyContext';
import { EdgeType } from '../types';

// Helper to rotate a point around origin (0,0)
const rotatePoint = (p: {x: number, y: number}, angle: number) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos
    };
};

export const Canvas: React.FC = () => {
  const { state, dispatch } = useSurvey();
  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  
  // Drag & Interaction Refs
  const interactionTypeRef = useRef<'background' | 'polygon' | 'edge' | 'vertex' | 'handle' | null>(null);
  const draggedVertexRef = useRef<string | null>(null);
  const draggedPolygonRef = useRef<string | null>(null);
  const rotatingPolygonRef = useRef<{ id: string, startAngle: number, currentAngle: number } | null>(null);
  
  const dragStartPosRef = useRef<{x: number, y: number} | null>(null);
  const dragStartWasSelectedRef = useRef<boolean>(false);
  const hasMovedRef = useRef<boolean>(false);
  const hasSnapshotRef = useRef<boolean>(false);

  // Gesture State
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartInfo = useRef<{ 
      dist: number; 
      zoom: number; 
      pan: { x: number; y: number }; 
      mid: { x: number; y: number };
      angle: number;
      rotation: number;
  } | null>(null);

  const visiblePolygons = useMemo(() => {
      if (state.isDrawingMode) {
          return state.polygons;
      }
      if (state.isJoinMode) return state.polygons;

      if (state.selectedPolygonId && state.isFocused) {
          return state.polygons.filter(p => p.id === state.selectedPolygonId || p.edges.some(e => e.linkedEdgeId));
      }
      return state.polygons;
  }, [state.polygons, state.selectedPolygonId, state.isJoinMode, state.isDrawingMode, state.isFocused]);

  const rotationDeg = state.rotation * 180 / Math.PI;
  const gridColor = state.theme === 'dark' ? '#1e293b' : '#cbd5e1';
  const gridBgColor = state.theme === 'dark' ? 'none' : '#f8fafc'; // Transparent for dark (handled by CSS bg), slight color for light

  const getSVGPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current || !groupRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(groupRef.current.getScreenCTM()?.inverse());
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Reset movement flags
    hasMovedRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    // Determine Interaction Type if not already set by child
    if (!interactionTypeRef.current) {
         if (e.target === svgRef.current || (e.target as HTMLElement).id === 'grid-bg') {
             interactionTypeRef.current = 'background';
         }
    }

    // Close menu if clicking background (or anything else really, unless handled specifically)
    if (state.openVertexMenuId) {
        dispatch({ type: 'CLOSE_VERTEX_MENU', payload: undefined });
    }

    if (state.isDrawingMode) {
        if (e.pointerType === 'touch' && activePointers.current.size > 1) {
            // Allow panning in drawing mode if multitouch
        } else {
            const worldPt = getSVGPoint(e.clientX, e.clientY);
            if (state.drawingPoints.length > 2) {
                const firstPt = state.drawingPoints[0];
                const dist = Math.hypot(firstPt.x - worldPt.x, firstPt.y - worldPt.y);
                const hitRadius = Math.max(30 / state.zoomLevel, 20);
                if (dist < hitRadius) {
                    dispatch({ type: 'FINISH_DRAWING', payload: '' }); 
                    return;
                }
            }
            dispatch({ type: 'ADD_DRAWING_POINT', payload: worldPt });
            return;
        }
    }

    if (activePointers.current.size === 2) {
        // Pinch Logic
        const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
        const p1 = points[0];
        const p2 = points[1];
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        pinchStartInfo.current = {
            dist,
            zoom: state.zoomLevel,
            pan: { ...state.panOffset },
            mid,
            angle,
            rotation: state.rotation
        };
        
        setIsPanning(false);
        draggedVertexRef.current = null;
        draggedPolygonRef.current = null;
        rotatingPolygonRef.current = null;
        return;
    }

    // Default Pan or Background Logic
    if (activePointers.current.size === 1) {
        if (interactionTypeRef.current === 'background') {
            setIsPanning(true);
            setLastPointer({ x: e.clientX, y: e.clientY });
        }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Check for movement threshold
    if (dragStartPosRef.current && !hasMovedRef.current) {
        const dist = Math.hypot(e.clientX - dragStartPosRef.current.x, e.clientY - dragStartPosRef.current.y);
        if (dist > 5) {
            hasMovedRef.current = true;
        }
    }

    if (state.isDrawingMode) {
         const worldPt = getSVGPoint(e.clientX, e.clientY);
         setCursorPos(worldPt);
    }

    // Pinch Zoom/Rotate
    if (activePointers.current.size === 2 && pinchStartInfo.current) {
        const points = Array.from(activePointers.current.values()) as { x: number; y: number }[];
        const p1 = points[0];
        const p2 = points[1];
        const currDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        
        if (currDist < 5) return;

        const startInfo = pinchStartInfo.current;
        const midNow = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        const scale = currDist / startInfo.dist;
        const newZoom = Math.min(Math.max(startInfo.zoom * scale, 0.1), 10);

        const currAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const dAngle = currAngle - startInfo.angle;
        const newRotation = startInfo.rotation + dAngle;

        const offsetScreen = {
            x: startInfo.mid.x - startInfo.pan.x,
            y: startInfo.mid.y - startInfo.pan.y
        };

        const vecUnrotated = rotatePoint(offsetScreen, -startInfo.rotation);
        const vecWorldUnit = {
            x: vecUnrotated.x / startInfo.zoom,
            y: vecUnrotated.y / startInfo.zoom
        };
        const vecNewScaled = {
            x: vecWorldUnit.x * newZoom,
            y: vecWorldUnit.y * newZoom
        };
        const vecNewRotated = rotatePoint(vecNewScaled, newRotation);

        const newPanX = midNow.x - vecNewRotated.x;
        const newPanY = midNow.y - vecNewRotated.y;

        dispatch({
            type: 'PAN_ZOOM',
            payload: { x: newPanX, y: newPanY, zoom: newZoom, rotation: newRotation }
        });
        return;
    }

    // Vertex Drag
    if (draggedVertexRef.current && activePointers.current.size === 1) {
        if (hasMovedRef.current && !hasSnapshotRef.current) {
            dispatch({ type: 'CAPTURE_SNAPSHOT', payload: undefined });
            hasSnapshotRef.current = true;
        }
        const point = getSVGPoint(e.clientX, e.clientY);
        dispatch({
            type: 'MOVE_VERTEX',
            payload: { vertexId: draggedVertexRef.current, x: point.x, y: point.y }
        });
        return;
    }

    // Polygon Drag
    if (draggedPolygonRef.current && activePointers.current.size === 1) {
        if (hasMovedRef.current && !hasSnapshotRef.current) {
            dispatch({ type: 'CAPTURE_SNAPSHOT', payload: undefined });
            hasSnapshotRef.current = true;
        }
        const point = getSVGPoint(e.clientX, e.clientY);
        const prevPoint = getSVGPoint(lastPointer.x, lastPointer.y);
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        
        setLastPointer({ x: e.clientX, y: e.clientY }); // Update last pointer for delta calculation

        dispatch({
            type: 'MOVE_POLYGON',
            payload: { polygonId: draggedPolygonRef.current, dx, dy }
        });
        return;
    }

    // Polygon Rotate
    if (rotatingPolygonRef.current && activePointers.current.size === 1) {
        const poly = state.polygons.find(p => p.id === rotatingPolygonRef.current!.id);
        if (poly) {
             if (!hasSnapshotRef.current) {
                dispatch({ type: 'CAPTURE_SNAPSHOT', payload: undefined });
                hasSnapshotRef.current = true;
             }
             const point = getSVGPoint(e.clientX, e.clientY);
             const cx = poly.centroid.x;
             const cy = poly.centroid.y;
             const newAngle = Math.atan2(point.y - cy, point.x - cx);
             
             // Calculate delta from last frame (or keep track of absolute)
             // We'll use delta from the internal ref
             const delta = newAngle - rotatingPolygonRef.current.currentAngle;
             rotatingPolygonRef.current.currentAngle = newAngle;

             dispatch({
                 type: 'ROTATE_POLYGON',
                 payload: { polygonId: poly.id, rotationDelta: delta }
             });
        }
        return;
    }

    // Pan
    if (isPanning && activePointers.current.size === 1) {
      const dx = e.clientX - lastPointer.x;
      const dy = e.clientY - lastPointer.y;
      setLastPointer({ x: e.clientX, y: e.clientY });
      dispatch({
        type: 'PAN_ZOOM',
        payload: {
          x: state.panOffset.x + dx,
          y: state.panOffset.y + dy,
          zoom: state.zoomLevel,
          rotation: state.rotation,
        },
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    activePointers.current.delete(e.pointerId);

    if (draggedVertexRef.current) {
        if (!hasMovedRef.current && dragStartWasSelectedRef.current) {
            dispatch({ type: 'TOGGLE_VERTEX_SELECTION', payload: draggedVertexRef.current });
        }
        draggedVertexRef.current = null;
    } 
    else if (draggedPolygonRef.current) {
        if (!hasMovedRef.current) {
             // If we clicked but didn't drag, we ensure it is selected (handled in onPointerDown already)
        }
        draggedPolygonRef.current = null;
    }
    else if (rotatingPolygonRef.current) {
        rotatingPolygonRef.current = null;
    }
    else if (interactionTypeRef.current === 'background' && !state.isDrawingMode) {
        // Only deselect if we clicked background AND didn't pan significantly
        if (!hasMovedRef.current) {
             dispatch({ type: 'SELECT_EDGE', payload: null });
             // Only switch to overview if we are NOT in focused mode
             if (!state.isFocused) {
                 dispatch({ type: 'SELECT_POLYGON', payload: null });
             }
        }
    }

    // Reset interaction state
    interactionTypeRef.current = null;
    dragStartPosRef.current = null;
    
    if (activePointers.current.size < 2) {
        pinchStartInfo.current = null;
    }
    if (activePointers.current.size === 0) {
        setIsPanning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const scaleFactor = 1.05;
    const newZoom = e.deltaY < 0 ? state.zoomLevel * scaleFactor : state.zoomLevel / scaleFactor;
    const clampedZoom = Math.min(Math.max(newZoom, 0.1), 10);
    
    dispatch({
      type: 'PAN_ZOOM',
      payload: { ...state.panOffset, zoom: clampedZoom, rotation: state.rotation },
    });
  };

  return (
    <svg
      ref={svgRef}
      className="w-full h-full cursor-crosshair touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
        <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke={gridColor} strokeWidth="1"/>
            </pattern>
        </defs>
        <rect id="grid-bg" width="100%" height="100%" fill="url(#grid)" />
        {state.theme === 'light' && <rect width="100%" height="100%" fill={gridBgColor} style={{mixBlendMode: 'multiply'}} pointerEvents="none" />}

        <g 
            ref={groupRef}
            transform={`translate(${state.panOffset.x}, ${state.panOffset.y}) rotate(${rotationDeg}) scale(${state.zoomLevel})`}
        >
            {/* EXISTING POLYGONS */}
            {visiblePolygons.map((poly) => {
                const isSelected = state.selectedPolygonId === poly.id;
                const isDimmed = (state.isJoinMode && poly.id !== state.selectedPolygonId) || state.isDrawingMode || (state.isFocused && !isSelected); 
                
                // Rotation Handle Position (Above Topmost Vertex)
                let rotationHandle = null;
                if (isSelected && !state.isJoinMode && !state.isDrawingMode) {
                    const topVertex = poly.vertices.reduce((prev, curr) => curr.y < prev.y ? curr : prev, poly.vertices[0]);
                    const handleY = topVertex.y - (60 / state.zoomLevel);
                    
                    rotationHandle = (
                        <g 
                            transform={`translate(${topVertex.x}, ${handleY})`}
                            className="cursor-grab active:cursor-grabbing"
                            onPointerDown={(e) => {
                                e.preventDefault();
                                interactionTypeRef.current = 'handle';
                                hasSnapshotRef.current = false;
                                const point = getSVGPoint(e.clientX, e.clientY);
                                const angle = Math.atan2(point.y - poly.centroid.y, point.x - poly.centroid.x);
                                rotatingPolygonRef.current = { id: poly.id, startAngle: angle, currentAngle: angle };
                            }}
                        >
                            <line x1={0} y1={0} x2={0} y2={60/state.zoomLevel} stroke="#fbbf24" strokeWidth={2/state.zoomLevel} strokeDasharray="4,4" />
                            <circle r={8/state.zoomLevel} fill="#fbbf24" stroke="white" strokeWidth={2/state.zoomLevel} />
                            <g transform={`scale(${1/state.zoomLevel})`}>
                                <path d="M -4 2 A 4 4 0 1 0 4 2" fill="none" stroke="black" strokeWidth="1.5" />
                                <path d="M 4 2 L 2 0 M 4 2 L 6 0" fill="none" stroke="black" strokeWidth="1.5" />
                            </g>
                        </g>
                    );
                }

                return (
                <g key={poly.id} opacity={isDimmed ? 0.3 : 1}>
                     {/* Polygon Body (Fill) - Handles Move */}
                     <path
                        d={`M ${poly.vertices.map(v => `${v.x},${v.y}`).join(' L ')} Z`}
                        fill={isSelected ? "rgba(14, 165, 233, 0.1)" : "transparent"}
                        stroke="none"
                        className={isSelected ? "cursor-move" : ""}
                        pointerEvents="all" // Allow clicking transparent fill to select/drag
                        onPointerDown={(e) => {
                            if (state.isDrawingMode || state.isJoinMode) return;
                            interactionTypeRef.current = 'polygon';
                            dispatch({ type: 'SELECT_POLYGON', payload: poly.id });
                            
                            draggedPolygonRef.current = poly.id;
                            dragStartPosRef.current = { x: e.clientX, y: e.clientY };
                            setLastPointer({ x: e.clientX, y: e.clientY });
                            hasMovedRef.current = false;
                            hasSnapshotRef.current = false;
                        }}
                    />

                    {/* Rotation Handle */}
                    {rotationHandle}

                    {/* Centroid Label (Name and Area) */}
                    {!state.isDrawingMode && (
                        <g transform={`translate(${poly.centroid.x}, ${poly.centroid.y})`} pointerEvents="none">
                            <g transform={`rotate(${-rotationDeg})`}> {/* Cancel main rotation so text is upright */}
                                <g transform={`scale(${1/state.zoomLevel})`}> {/* Inverse zoom scaling so label is constant size */}
                                     {/* Background Rect */}
                                     <rect 
                                        x="-50" y="-20" 
                                        width="100" height="40" 
                                        rx="4" 
                                        fill={state.theme === 'dark' ? "rgba(15, 23, 42, 0.8)" : "rgba(255, 255, 255, 0.8)"}
                                        stroke={state.theme === 'light' ? '#94a3b8' : 'none'}
                                        strokeWidth={1}
                                    />
                                    {/* Name */}
                                    <text
                                        x="0"
                                        y="-5"
                                        textAnchor="middle"
                                        fill={state.theme === 'dark' ? "white" : "#0f172a"}
                                        fontSize={14}
                                        fontWeight="bold"
                                    >
                                        {poly.name}
                                    </text>
                                    {/* Area */}
                                    {poly.area !== undefined && (
                                        <text
                                            x="0"
                                            y="12"
                                            textAnchor="middle"
                                            fill={state.theme === 'dark' ? "#94a3b8" : "#64748b"}
                                            fontSize={11}
                                        >
                                            {poly.area.toFixed(2)} m²
                                        </text>
                                    )}
                                </g>
                            </g>
                        </g>
                    )}

                    {poly.edges.map((edge) => {
                        const start = poly.vertices.find(v => v.id === edge.startVertexId);
                        const end = poly.vertices.find(v => v.id === edge.endVertexId);
                        if (!start || !end) return null;

                        const isEdgeSelected = state.selectedEdgeIds.includes(edge.id);
                        const isConnectedToSelected = state.selectedVertexIds.includes(edge.startVertexId) || state.selectedVertexIds.includes(edge.endVertexId);
                        const isPerimeter = edge.type === EdgeType.PERIMETER;
                        const isDiagonal = edge.type === EdgeType.DIAGONAL;
                        const isJoined = !!edge.linkedEdgeId;

                        const strokeColor = isEdgeSelected 
                            ? '#38bdf8' 
                            : (isJoined 
                                ? '#a855f7' // Purple-500
                                : (isConnectedToSelected 
                                    ? '#7dd3fc' 
                                    : (isDiagonal 
                                        ? (state.theme === 'dark' ? '#475569' : '#94a3b8') 
                                        : (state.theme === 'dark' ? '#94a3b8' : '#64748b'))));
                        
                        const baseStroke = isPerimeter ? 3 : 1.5;
                        const strokeWidth = (isEdgeSelected ? 5 : baseStroke) / state.zoomLevel;
                        const hitWidth = Math.max(30 / state.zoomLevel, 20);

                        // Calculate label position. If diagonal, offset to 35% (near start) to avoid centroid overlap
                        const t = isDiagonal ? 0.35 : 0.5;
                        const midX = start.x + (end.x - start.x) * t;
                        const midY = start.y + (end.y - start.y) * t;
                        
                        const showThickness = isPerimeter && edge.thickness;

                        return (
                            <g key={edge.id} 
                               onPointerDown={(e) => {
                                   if (state.isDrawingMode) return;
                                   interactionTypeRef.current = 'edge';
                                   dispatch({ type: 'SELECT_EDGE', payload: edge.id });
                               }}
                               className={state.isDrawingMode ? '' : 'cursor-pointer'}
                            >
                                {/* Hit Area */}
                                <line
                                    x1={start.x} y1={start.y}
                                    x2={end.x} y2={end.y}
                                    stroke="rgba(255,255,255,0.001)" 
                                    strokeWidth={hitWidth}
                                    strokeLinecap="round"
                                />

                                {/* Visual Line */}
                                <line
                                    x1={start.x} y1={start.y}
                                    x2={end.x} y2={end.y}
                                    stroke={strokeColor}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={isDiagonal ? "5,5" : "0"}
                                    strokeLinecap="round"
                                    pointerEvents="none"
                                />
                                
                                <g transform={`rotate(${-rotationDeg}, ${midX}, ${midY})`} pointerEvents="none">
                                    <rect 
                                        x={midX - (showThickness ? 26 : 22)} 
                                        y={midY - (showThickness ? 18 : 12)} 
                                        width={showThickness ? 52 : 44} 
                                        height={showThickness ? 36 : 24} 
                                        rx="4"
                                        fill={isEdgeSelected ? '#0ea5e9' : (isJoined ? '#7e22ce' : (isConnectedToSelected ? '#334155' : (state.theme === 'dark' ? '#1e293b' : '#f1f5f9')))} 
                                        opacity="0.95"
                                        stroke={isEdgeSelected ? 'white' : (isJoined ? '#d8b4fe' : (state.theme === 'light' ? '#cbd5e1' : 'none'))}
                                        strokeWidth={1}
                                    />
                                    <text
                                        x={midX}
                                        y={midY}
                                        dy={showThickness ? "-0.3em" : "0.3em"}
                                        textAnchor="middle"
                                        fill={state.theme === 'dark' || isEdgeSelected || isJoined || isConnectedToSelected ? "white" : "#0f172a"}
                                        fontSize={12}
                                        fontWeight="bold"
                                    >
                                        {(edge.length * 100).toFixed(2)}cm
                                    </text>
                                    {showThickness && (
                                        <text
                                            x={midX}
                                            y={midY}
                                            dy="1.0em"
                                            textAnchor="middle"
                                            fill={isEdgeSelected ? "#e0f2fe" : "#94a3b8"}
                                            fontSize={10}
                                        >
                                            w: {edge.thickness}cm
                                        </text>
                                    )}
                                </g>
                            </g>
                        );
                    })}

                    {poly.vertices.map((vertex) => {
                        const isVertexSelected = state.selectedVertexIds.includes(vertex.id);
                        const hasError = vertex.solved === false;
                        const isConnectedToSelectedEdge = state.selectedEdgeIds.length > 0
                            ? poly.edges.some(e => state.selectedEdgeIds.includes(e.id) && (e.startVertexId === vertex.id || e.endVertexId === vertex.id))
                            : false;

                        const labelY = vertex.y - (15 / state.zoomLevel);
                        const hitRadius = Math.max(30 / state.zoomLevel, 20);
                        
                        const showAngle = vertex.fixedAngle !== undefined;
                        let angleMarker = null;
                        
                        if (showAngle) {
                             const edges = poly.edges.filter(e => 
                                (e.startVertexId === vertex.id || e.endVertexId === vertex.id) && e.type === EdgeType.PERIMETER
                            );
                            if (edges.length === 2) {
                                const others = edges.map(e => {
                                    const otherId = e.startVertexId === vertex.id ? e.endVertexId : e.startVertexId;
                                    return poly.vertices.find(v => v.id === otherId)!;
                                });
                                const ang1 = Math.atan2(others[0].y - vertex.y, others[0].x - vertex.x);
                                const ang2 = Math.atan2(others[1].y - vertex.y, others[1].x - vertex.x);
                                let midAng = (ang1 + ang2) / 2;
                                if (Math.abs(ang1 - ang2) > Math.PI) midAng += Math.PI;
                                const dist = 20 / state.zoomLevel;
                                if (vertex.fixedAngle === 90) {
                                    angleMarker = (
                                        <g transform={`translate(${vertex.x}, ${vertex.y}) rotate(${midAng * 180 / Math.PI})`} pointerEvents="none">
                                            <rect x={0} y={-dist/2} width={dist} height={dist} fill="none" stroke="#fbbf24" strokeWidth={2/state.zoomLevel} />
                                            <circle cx={dist/2} cy={0} r={2/state.zoomLevel} fill="#fbbf24" />
                                        </g>
                                    );
                                }
                            }
                        }

                        return (
                            <g key={vertex.id} 
                               onPointerDown={(e) => {
                                   if (state.isJoinMode || state.isDrawingMode) return; 
                                   interactionTypeRef.current = 'vertex';
                                   draggedVertexRef.current = vertex.id;
                                   dragStartPosRef.current = { x: e.clientX, y: e.clientY };
                                   dragStartWasSelectedRef.current = isVertexSelected;
                                   hasMovedRef.current = false;
                                   hasSnapshotRef.current = false;
                                   
                                   if (!isVertexSelected) {
                                       dispatch({ type: 'TOGGLE_VERTEX_SELECTION', payload: vertex.id });
                                   }
                               }}
                               className={state.isDrawingMode ? "" : "cursor-move"}
                            >
                                {angleMarker}

                                <circle
                                    cx={vertex.x}
                                    cy={vertex.y}
                                    r={hitRadius}
                                    fill="transparent"
                                    stroke="none"
                                />

                                <circle
                                    cx={vertex.x}
                                    cy={vertex.y}
                                    r={state.zoomLevel > 0.5 ? 8 / state.zoomLevel : 16}
                                    fill={hasError ? '#ef4444' : (isVertexSelected ? '#38bdf8' : (isConnectedToSelectedEdge ? '#bae6fd' : (state.theme === 'dark' ? '#f8fafc' : '#ffffff')))}
                                    stroke={hasError ? '#7f1d1d' : (isConnectedToSelectedEdge ? '#0284c7' : '#0ea5e9')}
                                    strokeWidth={isVertexSelected || isConnectedToSelectedEdge ? 3 / state.zoomLevel : 2 / state.zoomLevel}
                                    className="pointer-events-none"
                                />
                                <text
                                    x={vertex.x}
                                    y={labelY}
                                    textAnchor="middle"
                                    fill={hasError ? '#f87171' : (isVertexSelected || isConnectedToSelectedEdge ? '#38bdf8' : (state.theme === 'dark' ? '#cbd5e1' : '#475569'))}
                                    fontSize={14 / state.zoomLevel}
                                    fontWeight="bold"
                                    pointerEvents="none"
                                    transform={`rotate(${-rotationDeg}, ${vertex.x}, ${labelY})`}
                                >
                                    {vertex.label}
                                </text>
                            </g>
                        );
                    })}
                </g>
            )})}
            
            {/* DRAWING MODE OVERLAY */}
            {state.isDrawingMode && (
                <g>
                    {state.drawingPoints.map((pt, i) => {
                         if (i === 0) return null;
                         const prev = state.drawingPoints[i - 1];
                         return (
                            <line
                                key={`d-line-${i}`}
                                x1={prev.x} y1={prev.y}
                                x2={pt.x} y2={pt.y}
                                stroke="#facc15"
                                strokeWidth={2 / state.zoomLevel}
                                strokeDasharray="5,5"
                            />
                         );
                    })}
                    {state.drawingPoints.length > 0 && (
                         <line
                            x1={state.drawingPoints[state.drawingPoints.length - 1].x}
                            y1={state.drawingPoints[state.drawingPoints.length - 1].y}
                            x2={cursorPos.x}
                            y2={cursorPos.y}
                            stroke="#facc15"
                            strokeWidth={2 / state.zoomLevel}
                            opacity={0.6}
                         />
                    )}
                    {state.drawingPoints.map((pt, i) => {
                        const isFirst = i === 0;
                        const radius = (isFirst ? 8 : 4) / state.zoomLevel;
                        return (
                            <g key={`d-pt-${i}`}>
                                {isFirst && (
                                    <circle 
                                        cx={pt.x} cy={pt.y} 
                                        r={Math.max(20 / state.zoomLevel, 15)} 
                                        fill="rgba(250, 204, 21, 0.2)"
                                        className="animate-pulse"
                                    />
                                )}
                                <circle
                                    cx={pt.x}
                                    cy={pt.y}
                                    r={radius}
                                    fill={isFirst ? '#facc15' : '#fbbf24'}
                                    stroke="#fff"
                                    strokeWidth={1 / state.zoomLevel}
                                />
                            </g>
                        )
                    })}
                </g>
            )}

        </g>
    </svg>
  );
};
