import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { AppState, Action, Polygon, EdgeType, Edge, HistoryEntry, Vertex } from '../types';
import { solveGeometry, distance, checkConnectionStatus, alignPolygonToEdge, calculateCentroid, midPoint, calculatePolygonArea, rotatePolygon, PIXELS_PER_METER, rotatePoint, translatePolygon, recalculateGroups, getConnectedPolygonGroup, duplicatePolygon, mirrorPolygon, calculateAlignmentTransform, calculateProjectedOffset } from '../utils/geometry';

const initialState: AppState = {
  theme: 'light',
  isAiPanelOpen: false,
  polygons: [],
  selectedPolygonIds: [],
  selectedEdgeIds: [],
  selectedVertexIds: [],
  openVertexMenuId: null,
  panOffset: { x: 0, y: 0 },
  zoomLevel: 1,
  rotation: 0,
  isDragging: false,
  solverMsg: null,
  isFocused: false,
  isJoinMode: false,
  joinSourceEdgeId: null,
  joinConflict: null,
  alignState: null,
  contextMenu: null,
  isDrawingMode: false,
  drawingPoints: [],
  past: [],
  future: []
};

// Helper to create a lightweight snapshot of the domain data
const createSnapshot = (state: AppState): HistoryEntry => ({
    polygons: state.polygons,
    selectedPolygonIds: state.selectedPolygonIds,
    selectedEdgeIds: state.selectedEdgeIds,
    selectedVertexIds: state.selectedVertexIds
});

// Helper to push current state to past and clear future
const withHistory = (state: AppState): AppState => {
    const snapshot = createSnapshot(state);
    // Limit history depth to 50
    const newPast = [...state.past, snapshot].slice(-50);
    return { ...state, past: newPast, future: [] };
};

// --- CORE JOIN LOGIC ---
const executeJoin = (state: AppState, sourceEdgeId: string, targetEdgeId: string, thickness: number, initialOffset: number = 0): AppState => {
    const sourcePoly = state.polygons.find(p => p.edges.some(e => e.id === sourceEdgeId));
    const targetPoly = state.polygons.find(p => p.edges.some(e => e.id === targetEdgeId));

    if (!sourcePoly || !targetPoly) return state;

    // Update thicknesses locally for the operation
    const updatedSourceEdges = sourcePoly.edges.map(e => e.id === sourceEdgeId ? { ...e, thickness: thickness } : e);
    const updatedTargetEdges = targetPoly.edges.map(e => e.id === targetEdgeId ? { ...e, thickness: thickness } : e);
    
    // --- ALIGNMENT LOGIC (CENTER + THICKNESS GAP) ---
    // offset: 0 means align Center-to-Center.
    // initialOffset allows passing a specific projection offset for "in-place" join
    const offset = initialOffset;
    
    // 2. Thickness Spacing
    // gapMeters is derived from the chosen thickness (cm -> m)
    const gapMeters = thickness / 100;

    // Align
    const tempSource = { ...sourcePoly, edges: updatedSourceEdges };
    const tempTarget = { ...targetPoly, edges: updatedTargetEdges };
    
    const alignedSourcePoly = alignPolygonToEdge(tempSource, sourceEdgeId, tempTarget, targetEdgeId, offset, gapMeters);

    // Calculate Delta to apply to peers
    const dx = alignedSourcePoly.vertices[0].x - tempSource.vertices[0].x;
    const dy = alignedSourcePoly.vertices[0].y - tempSource.vertices[0].y;

    // --- GROUP ID LOGIC ---
    let finalGroupId: string;
    if (sourcePoly.groupId && targetPoly.groupId) {
            // Merge groups: Pick one (source's)
            finalGroupId = sourcePoly.groupId;
    } else if (sourcePoly.groupId) {
            finalGroupId = sourcePoly.groupId;
    } else if (targetPoly.groupId) {
            finalGroupId = targetPoly.groupId;
    } else {
            // Create new group
            finalGroupId = `group-${Date.now()}`;
    }
    
    // Finalize Polygons
    const finalSourcePoly = {
        ...alignedSourcePoly,
        groupId: finalGroupId,
        edges: alignedSourcePoly.edges.map(e => e.id === sourceEdgeId ? { 
            ...e, 
            linkedEdgeId: targetEdgeId,
            alignmentOffset: offset 
        } : e)
    };

    const finalTargetPoly = {
        ...tempTarget,
        groupId: finalGroupId,
        edges: tempTarget.edges.map(e => e.id === targetEdgeId ? { 
            ...e, 
            linkedEdgeId: sourceEdgeId 
        } : e)
    };

    const oldSourceGroupId = sourcePoly.groupId;
    const oldTargetGroupId = targetPoly.groupId;

    const newPolygons = state.polygons.map(p => {
        if (p.id === finalSourcePoly.id) return finalSourcePoly;
        if (p.id === finalTargetPoly.id) return finalTargetPoly;
        
        // Propagate move to existing peers of source
        if (oldSourceGroupId && p.groupId === oldSourceGroupId) {
             const moved = translatePolygon(p, dx, dy);
             return { ...moved, groupId: finalGroupId };
        }

        // Merge target peers into new group
        if (oldTargetGroupId && p.groupId === oldTargetGroupId) {
            return { ...p, groupId: finalGroupId };
        }
        return p;
    });

    return {
        ...withHistory(state),
        polygons: newPolygons,
        isJoinMode: false,
        joinSourceEdgeId: null,
        joinConflict: null,
        solverMsg: { type: 'success', text: 'Polygons joined and grouped.' },
        selectedPolygonIds: [finalSourcePoly.id],
        selectedEdgeIds: [sourceEdgeId]
    };
};

const surveyReducer = (state: AppState, action: Action): AppState => {
  switch (action.type) {
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' };

    case 'TOGGLE_AI_PANEL':
        return { ...state, isAiPanelOpen: !state.isAiPanelOpen };

    case 'UNDO': {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, -1);
        
        const currentSnapshot = createSnapshot(state);
        
        return {
            ...state,
            ...previous, // Restore data
            past: newPast,
            future: [currentSnapshot, ...state.future], // Push current to future
            solverMsg: null,
            openVertexMenuId: null,
            isDrawingMode: false, // Cancel drawing on Undo global
            drawingPoints: [],
            joinConflict: null,
            contextMenu: null
        };
    }

    case 'REDO': {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        const newFuture = state.future.slice(1);
        
        const currentSnapshot = createSnapshot(state);

        return {
            ...state,
            ...next, // Restore data
            past: [...state.past, currentSnapshot], // Push current to past
            future: newFuture,
            solverMsg: null,
            openVertexMenuId: null,
            contextMenu: null
        };
    }

    case 'CAPTURE_SNAPSHOT': {
        return withHistory(state);
    }

    case 'IMPORT_DATA': {
        return {
            ...withHistory(state),
            polygons: action.payload,
            selectedPolygonIds: [],
            selectedEdgeIds: [],
            selectedVertexIds: [],
            solverMsg: { type: 'success', text: 'Data imported successfully.' }
        };
    }

    case 'RESET_CANVAS': {
        return {
            ...withHistory(state),
            polygons: [],
            selectedPolygonIds: [],
            selectedEdgeIds: [],
            selectedVertexIds: [],
            openVertexMenuId: null,
            solverMsg: { type: 'success', text: 'Canvas cleared.' },
            panOffset: { x: 0, y: 0 },
            zoomLevel: 1,
            rotation: 0,
            isDrawingMode: false,
            drawingPoints: [],
            isJoinMode: false,
            joinSourceEdgeId: null,
            joinConflict: null,
            isFocused: false,
            contextMenu: null
        };
    }

    // --- DRAWING ACTIONS ---

    case 'START_DRAWING':
        return {
            ...state,
            isDrawingMode: true,
            drawingPoints: [],
            selectedPolygonIds: [], // Deselect everything to focus on drawing
            selectedEdgeIds: [],
            selectedVertexIds: [],
            isJoinMode: false,
            openVertexMenuId: null,
            contextMenu: null
        };

    case 'ADD_DRAWING_POINT':
        return {
            ...state,
            drawingPoints: [...state.drawingPoints, action.payload]
        };

    case 'UNDO_DRAWING_POINT':
        return {
            ...state,
            drawingPoints: state.drawingPoints.slice(0, -1)
        };

    case 'CANCEL_DRAWING':
        return {
            ...state,
            isDrawingMode: false,
            drawingPoints: []
        };

    case 'FINISH_DRAWING': {
        if (state.drawingPoints.length < 3) {
            return {
                ...state,
                solverMsg: { type: 'error', text: 'Polygon must have at least 3 points.' }
            };
        }

        const idBase = `poly-${Date.now()}`;
        const newVertices: Vertex[] = state.drawingPoints.map((p, i) => ({
            id: `${idBase}-v${i}`,
            x: p.x,
            y: p.y,
            label: String.fromCharCode(65 + i),
            solved: true
        }));

        const newEdges: Edge[] = [];
        const numPoints = newVertices.length;

        for (let i = 0; i < numPoints; i++) {
            const next = (i + 1) % numPoints;
            const v1 = newVertices[i];
            const v2 = newVertices[next];
            const len = distance(v1, v2);

            newEdges.push({
                id: `${idBase}-e-p${i}`,
                startVertexId: v1.id,
                endVertexId: v2.id,
                length: parseFloat((len / PIXELS_PER_METER).toFixed(2)),
                type: EdgeType.PERIMETER,
                thickness: 10
            });
        }

        const newPoly: Polygon = {
            id: idBase,
            name: action.payload || `Sketch ${state.polygons.length + 1}`,
            vertices: newVertices,
            edges: newEdges,
            centroid: calculateCentroid(newVertices),
            isClosed: true,
            isLocked: false // Initially unlocked
        };

        return {
            ...withHistory(state),
            polygons: [...state.polygons, newPoly],
            isDrawingMode: false,
            drawingPoints: [],
            selectedPolygonIds: [newPoly.id],
            solverMsg: { type: 'success', text: 'Polygon created! Measurements can be edited.' }
        };
    }

    // --- STANDARD ACTIONS ---

    case 'ADD_POLYGON':
      return {
        ...withHistory(state),
        polygons: [...state.polygons, action.payload],
        selectedPolygonIds: [action.payload.id],
        selectedVertexIds: [],
        selectedEdgeIds: [],
        solverMsg: null
      };

    case 'SELECT_POLYGON': {
      let payloadId: string | null = null;
      let shouldFocus = false;
      let multi = false;

      if (typeof action.payload === 'object' && action.payload !== null) {
          payloadId = action.payload.id;
          shouldFocus = action.payload.shouldFocus || false;
          multi = action.payload.multi || false;
      } else {
          payloadId = action.payload as string | null;
      }

      // If null, clear all
      if (payloadId === null) {
          return {
              ...state,
              selectedPolygonIds: [],
              selectedEdgeIds: [],
              selectedVertexIds: [],
              isFocused: false,
              isJoinMode: false,
              contextMenu: null
          };
      }

      let newSelectedIds = [...state.selectedPolygonIds];

      if (multi) {
          if (newSelectedIds.includes(payloadId)) {
              newSelectedIds = newSelectedIds.filter(id => id !== payloadId);
          } else {
              newSelectedIds.push(payloadId);
          }
      } else {
          newSelectedIds = [payloadId];
      }

      return { 
        ...state, 
        selectedPolygonIds: newSelectedIds,
        selectedEdgeIds: [],
        selectedVertexIds: [],
        openVertexMenuId: null,
        isJoinMode: false,
        joinSourceEdgeId: null,
        isDrawingMode: false, // Exit drawing if selecting elsewhere
        isFocused: shouldFocus || false, // Default to false (Context mode) unless specified
        contextMenu: null // Close context menu on selection
      };
    }

    case 'SELECT_EDGE': {
      let edgeId: string | null = null;
      let isMulti = false;

      if (action.payload && typeof action.payload === 'object' && 'multi' in action.payload) {
          edgeId = action.payload.edgeId;
          isMulti = action.payload.multi;
      } else {
          edgeId = action.payload as string | null;
          isMulti = false;
      }
      
      // ALIGN MODE SELECTION LOGIC
      if (state.alignState) {
            if (edgeId) {
                return surveyReducer(state, { type: 'SELECT_ALIGN_EDGE', payload: edgeId });
            } else {
                return state; 
            }
      }

      if (state.isJoinMode && state.joinSourceEdgeId && edgeId) {
          return surveyReducer(state, { type: 'COMPLETE_JOIN', payload: edgeId });
      }

      if (!edgeId) {
          return { ...state, selectedEdgeIds: [] };
      }
      
      const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
      if (!poly) return state;

      // Update Polygon Selection logic
      let newSelectedPolyIds = [...state.selectedPolygonIds];
      
      if (isMulti) {
          // If multi, ensure polygon is added to selection if not present
          if (!newSelectedPolyIds.includes(poly.id)) {
              newSelectedPolyIds.push(poly.id);
          }
      } else {
          // Single select: Replace poly selection unless it was already the only one
           if (!newSelectedPolyIds.includes(poly.id) || newSelectedPolyIds.length > 1) {
               newSelectedPolyIds = [poly.id];
           }
      }

      // Edge Selection Logic
      let newSelection: string[] = [];

      if (isMulti) {
          newSelection = [...state.selectedEdgeIds];
          if (newSelection.includes(edgeId)) {
              newSelection = newSelection.filter(id => id !== edgeId);
          } else {
              newSelection.push(edgeId);
          }
      } else {
          newSelection = [edgeId];
      }

      return { 
        ...state, 
        selectedPolygonIds: newSelectedPolyIds,
        selectedEdgeIds: newSelection,
        selectedVertexIds: [],
        openVertexMenuId: null, // Close vertex menu on edge select
        contextMenu: null
      };
    }

    case 'SPLIT_EDGE': {
        const edgeId = action.payload;
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;

        if (poly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Cannot split edge on a locked polygon. Modify a length to unlock.' }, contextMenu: null };
        }

        const edge = poly.edges.find(e => e.id === edgeId);
        if (!edge || edge.type !== EdgeType.PERIMETER) {
            return { ...state, solverMsg: { type: 'error', text: 'Can only split perimeter edges.' }, contextMenu: null };
        }

        const vStart = poly.vertices.find(v => v.id === edge.startVertexId);
        const vEnd = poly.vertices.find(v => v.id === edge.endVertexId);
        if (!vStart || !vEnd) return state;

        // 1. Create New Vertex at Midpoint
        const mid = midPoint(vStart, vEnd);
        const newVertexId = `${poly.id}-v${Date.now()}`;
        const newVertex: Vertex = {
            id: newVertexId,
            x: mid.x,
            y: mid.y,
            label: String.fromCharCode(65 + (poly.vertices.length % 26)), // Simple auto-labeling
            solved: true
        };

        // 2. Insert Vertex into array in correct order
        const vStartIndex = poly.vertices.findIndex(v => v.id === vStart.id);
        const newVertices = [...poly.vertices];
        newVertices.splice(vStartIndex + 1, 0, newVertex);

        // 3. Create two new edges
        const dist1 = distance(vStart, newVertex);
        const dist2 = distance(newVertex, vEnd);

        const edge1: Edge = {
            id: `edge-${Date.now()}-1`,
            startVertexId: vStart.id,
            endVertexId: newVertex.id,
            length: parseFloat((dist1 / PIXELS_PER_METER).toFixed(2)),
            type: EdgeType.PERIMETER,
            thickness: edge.thickness,
            feature: edge.feature // Preserve feature style if needed, or reset. Let's reset for split.
        };

        const edge2: Edge = {
            id: `edge-${Date.now()}-2`,
            startVertexId: newVertex.id,
            endVertexId: vEnd.id,
            length: parseFloat((dist2 / PIXELS_PER_METER).toFixed(2)),
            type: EdgeType.PERIMETER,
            thickness: edge.thickness
        };

        // 4. Update Edges list (Remove old, add new ones)
        const newEdges = poly.edges.filter(e => e.id !== edgeId);
        newEdges.push(edge1, edge2);

        const updatedPoly = {
            ...poly,
            vertices: newVertices,
            edges: newEdges,
            isLocked: false // Modifying geometry unlocks it
        };

        const newPolygons = state.polygons.map(p => p.id === poly.id ? updatedPoly : p);

        return {
            ...withHistory(state),
            polygons: newPolygons,
            selectedEdgeIds: [], // Deselect the split edge
            selectedVertexIds: [newVertexId], // Select the new node for immediate adjustment
            solverMsg: { type: 'success', text: 'Edge split. Node added.' },
            contextMenu: null
        };
    }

    case 'TOGGLE_VERTEX_SELECTION': {
        const vId = action.payload;
        const poly = state.polygons.find(p => p.vertices.some(v => v.id === vId));
        if (!poly) return state;

        const isNewPoly = !state.selectedPolygonIds.includes(poly.id);
        
        let newSelection = isNewPoly ? [] : [...state.selectedVertexIds];

        if (newSelection.includes(vId)) {
            newSelection = newSelection.filter(id => id !== vId);
        } else {
            newSelection.push(vId);
            if (newSelection.length > 2) {
                newSelection.shift();
            }
        }

        return {
            ...state,
            selectedPolygonIds: [poly.id], // Vertex select switches to single poly focus usually
            selectedVertexIds: newSelection,
            selectedEdgeIds: [],
            openVertexMenuId: vId // Auto-open menu on select/tap
        };
    }

    case 'OPEN_VERTEX_MENU':
        return { ...state, openVertexMenuId: action.payload };

    case 'CLOSE_VERTEX_MENU':
        return { ...state, openVertexMenuId: null };

    case 'DELETE_VERTEX': {
        const vertexId = action.payload;
        const poly = state.polygons.find(p => p.vertices.some(v => v.id === vertexId));
        if (!poly) return state;

        if (poly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Cannot delete vertex on a locked polygon.' }, contextMenu: null };
        }

        // Minimum constraint: Triangle
        if (poly.vertices.length <= 3) {
            return {
                ...state,
                solverMsg: { type: 'error', text: 'Cannot delete vertex: Minimum 3 points required.' },
                contextMenu: null
            };
        }

        const vIndex = poly.vertices.findIndex(v => v.id === vertexId);
        // Assuming ordered vertices
        const prevIndex = (vIndex - 1 + poly.vertices.length) % poly.vertices.length;
        const nextIndex = (vIndex + 1) % poly.vertices.length;

        const prevV = poly.vertices[prevIndex];
        const nextV = poly.vertices[nextIndex];

        const newLen = distance(prevV, nextV);

        // Create new edge connecting neighbors
        const closingEdge: Edge = {
            id: `edge-closure-${Date.now()}`,
            startVertexId: prevV.id,
            endVertexId: nextV.id,
            length: parseFloat((newLen / PIXELS_PER_METER).toFixed(2)),
            type: EdgeType.PERIMETER,
            thickness: 10
        };

        const newVertices = poly.vertices.filter(v => v.id !== vertexId);
        
        // Remove connected edges
        const newEdges = poly.edges.filter(e => 
            e.startVertexId !== vertexId && e.endVertexId !== vertexId
        );
        newEdges.push(closingEdge);

        const updatedPoly: Polygon = {
            ...poly,
            vertices: newVertices,
            edges: newEdges,
            centroid: calculateCentroid(newVertices),
            isLocked: false // Structure change
        };

        const newPolygons = state.polygons.map(p => p.id === poly.id ? updatedPoly : p);

        return {
            ...withHistory(state),
            polygons: newPolygons,
            selectedVertexIds: [],
            openVertexMenuId: null,
            solverMsg: null,
            contextMenu: null
        };
    }

    case 'SET_VERTEX_ANGLE': {
        const { vertexId, angle, shouldClose } = action.payload;
        const poly = state.polygons.find(p => p.vertices.some(v => v.id === vertexId));
        if (!poly) return state;

        // 1. Update vertex angle
        const newVertices = poly.vertices.map(v => 
            v.id === vertexId ? { ...v, fixedAngle: angle } : v
        );

        // 2. If setting an angle (not clearing), remove all diagonals connected to this vertex
        let newEdges = poly.edges;
        if (angle !== undefined) {
             // Filter out any diagonal connected to this vertex
             newEdges = newEdges.filter(e => {
                if (e.type === EdgeType.DIAGONAL) {
                    return !(e.startVertexId === vertexId || e.endVertexId === vertexId);
                }
                return true;
             });
        }

        const updatedPoly = { ...poly, vertices: newVertices, edges: newEdges, isLocked: false };
        const newPolygons = state.polygons.map(p => p.id === poly.id ? updatedPoly : p);
        
        const closeMenu = shouldClose !== undefined ? shouldClose : true;

        return {
            ...withHistory(state),
            polygons: newPolygons,
            solverMsg: null,
            openVertexMenuId: closeMenu ? null : state.openVertexMenuId, // Only close if requested (default true)
            contextMenu: closeMenu ? null : state.contextMenu
        };
    }

    case 'START_JOIN_MODE': {
        const sourceEdgeId = action.payload;
        const sourcePoly = state.polygons.find(p => p.edges.some(e => e.id === sourceEdgeId));
        
        if (!sourcePoly) return state;
        if (!sourcePoly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Polygon must be solved (locked) before joining.' } };
        }

        return {
            ...state,
            isJoinMode: true,
            joinSourceEdgeId: sourceEdgeId,
            solverMsg: { type: 'success', text: 'Select an edge on another solved polygon to snap to.' },
            openVertexMenuId: null
        };
    }

    case 'COMPLETE_JOIN': {
        const targetEdgeId = action.payload; 
        const sourceEdgeId = state.joinSourceEdgeId; 
        
        if (!sourceEdgeId || !targetEdgeId) return { ...state, isJoinMode: false, joinSourceEdgeId: null };

        const sourcePoly = state.polygons.find(p => p.edges.some(e => e.id === sourceEdgeId));
        const targetPoly = state.polygons.find(p => p.edges.some(e => e.id === targetEdgeId));

        if (!sourcePoly || !targetPoly) return { ...state, isJoinMode: false, joinSourceEdgeId: null };
        if (sourcePoly.id === targetPoly.id) {
            return { 
                ...state, 
                isJoinMode: false, 
                joinSourceEdgeId: null,
                solverMsg: { type: 'error', text: 'Cannot join a polygon to itself.' }
            };
        }

        if (!targetPoly.isLocked) {
             return { 
                ...state, 
                solverMsg: { type: 'error', text: 'Target polygon is not solved (locked). Solve it first.' }
            };
        }

        // --- SINGLE JOIN CONSTRAINT ---
        const alreadyLinked = sourcePoly.edges.some(e => {
            if (!e.linkedEdgeId) return false;
            const linkedPoly = state.polygons.find(p => p.edges.some(le => le.id === e.linkedEdgeId));
            return linkedPoly?.id === targetPoly.id;
        });

        if (alreadyLinked) {
            return {
                ...state,
                isJoinMode: false,
                joinSourceEdgeId: null,
                solverMsg: { type: 'error', text: 'Polygons are already joined by another edge. Only one join allowed.' }
            };
        }

        const sEdge = sourcePoly.edges.find(e => e.id === sourceEdgeId)!;
        const tEdge = targetPoly.edges.find(e => e.id === targetEdgeId)!;

        // --- THICKNESS CONFLICT CHECK ---
        const sThick = sEdge.thickness || 10;
        const tThick = tEdge.thickness || 10;

        if (sThick !== tThick) {
            return {
                ...state,
                joinConflict: {
                    sourcePolyId: sourcePoly.id,
                    targetPolyId: targetPoly.id,
                    sourceEdgeId,
                    targetEdgeId,
                    sourceThickness: sThick,
                    targetThickness: tThick,
                    initialOffset: 0
                }
            };
        }

        return executeJoin(state, sourceEdgeId, targetEdgeId, sThick, 0);
    }

    case 'JOIN_SELECTED_EDGES': {
        // Must have exactly 2 selected edges
        if (state.selectedEdgeIds.length !== 2) return state;

        const edge1Id = state.selectedEdgeIds[0];
        const edge2Id = state.selectedEdgeIds[1];

        const poly1 = state.polygons.find(p => p.edges.some(e => e.id === edge1Id));
        const poly2 = state.polygons.find(p => p.edges.some(e => e.id === edge2Id));

        if (!poly1 || !poly2 || poly1.id === poly2.id) {
             return { ...state, solverMsg: { type: 'error', text: 'Must select edges from two DIFFERENT polygons.' } };
        }

        if (!poly1.isLocked || !poly2.isLocked) {
            return { ...state, solverMsg: { type: 'error', text: 'Both polygons must be locked (solved) to join.' } };
        }

        // Check if already linked
        const alreadyLinked = poly1.edges.some(e => {
            if (!e.linkedEdgeId) return false;
            const linkedPoly = state.polygons.find(p => p.edges.some(le => le.id === e.linkedEdgeId));
            return linkedPoly?.id === poly2.id;
        });

        if (alreadyLinked) {
             return { ...state, solverMsg: { type: 'error', text: 'Polygons are already joined.' } };
        }

        const edge1 = poly1.edges.find(e => e.id === edge1Id)!;
        const edge2 = poly2.edges.find(e => e.id === edge2Id)!;

        // Calculate Offset to keep them in current visual place
        // We define Poly1 as Source for the calculation
        const sV1 = poly1.vertices.find(v => v.id === edge1.startVertexId)!;
        const sV2 = poly1.vertices.find(v => v.id === edge1.endVertexId)!;
        const tV1 = poly2.vertices.find(v => v.id === edge2.startVertexId)!;
        const tV2 = poly2.vertices.find(v => v.id === edge2.endVertexId)!;

        const projectedOffset = calculateProjectedOffset(sV1, sV2, tV1, tV2);

        // Thickness Check
        const t1 = edge1.thickness || 10;
        const t2 = edge2.thickness || 10;

        if (t1 !== t2) {
             return {
                ...state,
                joinConflict: {
                    sourcePolyId: poly1.id,
                    targetPolyId: poly2.id,
                    sourceEdgeId: edge1Id,
                    targetEdgeId: edge2Id,
                    sourceThickness: t1,
                    targetThickness: t2,
                    initialOffset: projectedOffset
                }
            };
        }

        return executeJoin(state, edge1Id, edge2Id, t1, projectedOffset);
    }

    case 'RESOLVE_JOIN_CONFLICT': {
        const thickness = action.payload;
        const conflict = state.joinConflict;

        if (!conflict) return state;

        return executeJoin(state, conflict.sourceEdgeId, conflict.targetEdgeId, thickness, conflict.initialOffset);
    }

    case 'CANCEL_JOIN_CONFLICT':
        return {
            ...state,
            joinConflict: null,
            isJoinMode: false,
            joinSourceEdgeId: null
        };
    
    case 'UNLINK_EDGE': {
        const edgeId = action.payload;
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;

        const edge = poly.edges.find(e => e.id === edgeId);
        if (!edge || !edge.linkedEdgeId) return state;

        const targetPolyId = state.polygons.find(p => p.edges.some(e => e.id === edge.linkedEdgeId))?.id;

        // 1. Remove Links
        let newPolygons = state.polygons.map(p => {
            if (p.id === poly.id) {
                return {
                    ...p,
                    edges: p.edges.map(e => e.id === edgeId ? { ...e, linkedEdgeId: undefined, alignmentOffset: undefined } : e)
                };
            }
            if (p.id === targetPolyId) {
                return {
                    ...p,
                    edges: p.edges.map(e => e.id === edge.linkedEdgeId ? { ...e, linkedEdgeId: undefined } : e)
                };
            }
            return p;
        });

        // 2. Recalculate Groups
        // If the group was broken, some polygons might need new Group IDs
        if (poly.groupId) {
            newPolygons = recalculateGroups(newPolygons);
        }

        return {
            ...withHistory(state),
            polygons: newPolygons,
            solverMsg: { type: 'success', text: 'Edges unlinked. Groups updated.' }
        };
    }

    case 'UPDATE_EDGE_ALIGNMENT': {
        const { edgeId, offset } = action.payload;
        const sourcePoly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!sourcePoly) return state;

        const sourceEdge = sourcePoly.edges.find(e => e.id === edgeId);
        if (!sourceEdge || !sourceEdge.linkedEdgeId) return state;

        const targetPoly = state.polygons.find(p => p.edges.some(e => e.id === sourceEdge.linkedEdgeId));
        if (!targetPoly) return state;

        // Keep thickness gap during update
        const gapMeters = (sourceEdge.thickness || 10) / 100; 

        // Align sourcePoly to get new position relative to target
        const alignedPoly = alignPolygonToEdge(sourcePoly, edgeId, targetPoly, sourceEdge.linkedEdgeId, offset, gapMeters);
        
        const dx = alignedPoly.vertices[0].x - sourcePoly.vertices[0].x;
        const dy = alignedPoly.vertices[0].y - sourcePoly.vertices[0].y;

        // Propagate to subgroup: All connected to sourcePoly, excluding targetPoly (and its side of the link)
        const subgroupIds = getConnectedPolygonGroup(sourcePoly.id, state.polygons, targetPoly.id);

        const newPolygons = state.polygons.map(p => {
            // Main moved poly
            if (p.id === sourcePoly.id) {
                return {
                    ...alignedPoly,
                    edges: alignedPoly.edges.map(e => e.id === edgeId ? { ...e, alignmentOffset: offset } : e)
                };
            }
            // Subgroup peers
            if (subgroupIds.has(p.id)) {
                return translatePolygon(p, dx, dy);
            }
            return p;
        });

        return {
            ...withHistory(state),
            polygons: newPolygons
        };
    }

    case 'ADD_DIAGONAL': {
        if (state.selectedVertexIds.length !== 2 || state.selectedPolygonIds.length !== 1) return state;
        
        const poly = state.polygons.find(p => p.id === state.selectedPolygonIds[0]);
        if (!poly) return state;
        
        if (poly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Cannot add diagonal to locked polygon. Edit a length to unlock.' } };
        }

        const v1 = poly.vertices.find(v => v.id === state.selectedVertexIds[0]);
        const v2 = poly.vertices.find(v => v.id === state.selectedVertexIds[1]);
        
        if (!v1 || !v2) return state;

        const check = checkConnectionStatus(v1.id, v2.id, poly);
        if (!check.valid) {
            const failure = check as { valid: false; msg: string };
            return {
                ...state,
                solverMsg: { type: 'error', text: failure.msg || 'Cannot connect.' }
            };
        }

        const len = distance(v1, v2);
        const newEdge: Edge = {
            id: `edge-${Date.now()}`,
            startVertexId: v1.id,
            endVertexId: v2.id,
            length: parseFloat((len / PIXELS_PER_METER).toFixed(2)),
            type: EdgeType.DIAGONAL
        };

        const updatedPoly = { ...poly, edges: [...poly.edges, newEdge] };
        const newPolygons = state.polygons.map(p => p.id === poly.id ? updatedPoly : p);

        return {
            ...withHistory(state),
            polygons: newPolygons,
            selectedVertexIds: [],
            solverMsg: null 
        };
    }

    case 'DELETE_EDGE': {
        const edgeId = action.payload; 
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;
        
        if (poly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Cannot delete edge of locked polygon.' }, contextMenu: null };
        }

        const edgeToDelete = poly.edges.find(e => e.id === edgeId);
        if (!edgeToDelete || edgeToDelete.type === EdgeType.PERIMETER) {
            return { ...state, solverMsg: { type: 'error', text: 'Cannot delete perimeter edges.' }, contextMenu: null };
        }

        const updatedPoly = {
            ...poly,
            edges: poly.edges.filter(e => e.id !== edgeId)
        };

        const newPolygons = state.polygons.map(p => p.id === poly.id ? updatedPoly : p);
        
        return {
            ...withHistory(state),
            polygons: newPolygons,
            selectedEdgeIds: [],
            solverMsg: null,
            contextMenu: null
        };
    }
    
    case 'UPDATE_EDGE_LENGTH': {
        const { edgeId, length } = action.payload;
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;

        let newPolygons = [...state.polygons];

        newPolygons = newPolygons.map(p => {
            if (p.id !== poly.id) return p;
            return {
                ...p,
                isLocked: false, // Modification unlocks the polygon
                edges: p.edges.map(e => e.id === edgeId ? { ...e, length } : e)
            };
        });

        return { ...withHistory(state), polygons: newPolygons, solverMsg: null };
    }

    case 'UPDATE_EDGE_THICKNESS': {
        const { edgeId, thickness } = action.payload;
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;

        const edge = poly.edges.find(e => e.id === edgeId)!;

        // 1. Basic Update (if not linked)
        if (!edge.linkedEdgeId) {
             const newPolygons = state.polygons.map(p => {
                if (p.id !== poly.id) return p;
                return {
                    ...p,
                    edges: p.edges.map(e => e.id === edgeId ? { ...e, thickness } : e)
                };
            });
            return { ...withHistory(state), polygons: newPolygons };
        }

        // 2. Linked Update
        const targetPoly = state.polygons.find(p => p.edges.some(e => e.id === edge.linkedEdgeId));
        if (!targetPoly) return state;

        // Calculate Alignment / Move Delta based on new thickness
        const gapMeters = thickness / 100;
        const currentOffset = edge.alignmentOffset || 0;
        
        // Calculate new position for Source Poly
        const alignedPoly = alignPolygonToEdge(poly, edgeId, targetPoly, edge.linkedEdgeId, currentOffset, gapMeters);
        
        const dx = alignedPoly.vertices[0].x - poly.vertices[0].x;
        const dy = alignedPoly.vertices[0].y - poly.vertices[0].y;

        // Find subgroup to move: All connected to poly, EXCLUDING targetPoly branch
        const subgroupIds = getConnectedPolygonGroup(poly.id, state.polygons, targetPoly.id);

        const newPolygons = state.polygons.map(p => {
            // Update thickness for Source Poly & Move
            if (p.id === poly.id) {
                const moved = translatePolygon(p, dx, dy);
                return {
                    ...moved,
                    edges: moved.edges.map(e => e.id === edgeId ? { ...e, thickness } : e)
                };
            }
            // Update thickness for Target Poly (No move)
            if (p.id === targetPoly.id) {
                return {
                    ...p,
                    edges: p.edges.map(e => e.id === edge.linkedEdgeId ? { ...e, thickness } : e)
                };
            }
            // Move Subgroup Peers
            if (subgroupIds.has(p.id)) {
                 return translatePolygon(p, dx, dy);
            }
            return p;
        });
        
        return { ...withHistory(state), polygons: newPolygons };
    }

    case 'SET_EDGE_FEATURE': {
        const { edgeId, feature, width, distance } = action.payload;
        const poly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
        if (!poly) return state;

        const newPolygons = state.polygons.map(p => {
            if (p.id !== poly.id) return p;
            return {
                ...p,
                edges: p.edges.map(e => {
                    if (e.id !== edgeId) return e;
                    
                    // Logic to set width, defaulting if not provided
                    let newWidth = width;
                    // If switching to a feature and width is not provided, use default
                    if (feature && !newWidth && newWidth !== 0) {
                        if (feature === 'door') newWidth = 0.8;
                        if (feature === 'window') newWidth = 1.2;
                    }
                    else if (feature && newWidth === undefined) {
                         // Preserve existing if set
                         if (e.featureWidth) newWidth = e.featureWidth;
                    }

                    // Distance logic
                    let newDistance = distance;
                    if (newDistance === undefined) {
                        // If we already have a distance, keep it (unless we switched feature types or something, but usually keep)
                        if (e.featureDistance !== undefined) {
                            newDistance = e.featureDistance;
                        } else {
                            // Default to center if no distance set
                            newDistance = (e.length - (newWidth || 0)) / 2;
                        }
                    }
                    
                    return { ...e, feature, featureWidth: newWidth, featureDistance: newDistance };
                })
            };
        });

        return { 
            ...withHistory(state), 
            polygons: newPolygons,
            contextMenu: null // Close context menu
        };
    }

    case 'MOVE_VERTEX': {
        const { vertexId, x, y } = action.payload;
        const targetPolyIndex = state.polygons.findIndex(p => p.vertices.some(v => v.id === vertexId));
        if (targetPolyIndex === -1) return state;

        const poly = state.polygons[targetPolyIndex];

        // PREVENT MOVEMENT IF LOCKED
        if (poly.isLocked) {
            // We can return state without change, or set a message (throttled)
            return state; 
        }

        const newVertices = poly.vertices.map(v => v.id === vertexId ? { ...v, x, y } : v);
        
        const newPoly = { ...poly, vertices: newVertices };
        const newPolygons = [...state.polygons];
        newPolygons[targetPolyIndex] = newPoly;

        return { 
            ...state, 
            polygons: newPolygons, 
            isDragging: true, 
            solverMsg: null, 
            openVertexMenuId: null 
        };
    }

    case 'MOVE_POLYGON': {
        const { polygonId, dx, dy } = action.payload;
        
        // Determine the set of unique Polygon IDs to move
        const idsToMove = new Set<string>();
        
        // 1. The dragged polygon always moves
        idsToMove.add(polygonId);
        
        // 2. If the dragged polygon is selected, then ALL selected polygons move.
        if (state.selectedPolygonIds.includes(polygonId)) {
            state.selectedPolygonIds.forEach(id => idsToMove.add(id));
        }
        
        // 3. Expand to include rigid body groups for ALL moving polygons
        const involvedGroupIds = new Set<string>();
        state.polygons.forEach(p => {
            if (idsToMove.has(p.id) && p.groupId) {
                involvedGroupIds.add(p.groupId);
            }
        });
        
        // Add all members of these groups
        state.polygons.forEach(p => {
            if (p.groupId && involvedGroupIds.has(p.groupId)) {
                idsToMove.add(p.id);
            }
        });

        const newPolygons = state.polygons.map(p => {
            if (idsToMove.has(p.id)) {
                return translatePolygon(p, dx, dy);
            }
            return p;
        });

        return {
            ...state,
            polygons: newPolygons,
            isDragging: true,
            openVertexMenuId: null
        };
    }

    case 'ROTATE_POLYGON': {
        const { polygonId, rotationDelta } = action.payload;
        const mainPoly = state.polygons.find(p => p.id === polygonId);
        if (!mainPoly) return state;

        // Rotate Main Polygon around its OWN centroid (User is grabbing handle of mainPoly)
        const center = mainPoly.centroid;
        const movingGroup = mainPoly.groupId;

        const newPolygons = state.polygons.map(p => {
            // Rotate the handled polygon
            if (p.id === polygonId) {
                return rotatePolygon(p, center, rotationDelta);
            }
            // Rotate group peers around the SAME center (pivot)
            if (movingGroup && p.groupId === movingGroup) {
                return rotatePolygon(p, center, rotationDelta);
            }
            return p;
        });

        return {
            ...state,
            polygons: newPolygons,
            isDragging: true
        };
    }
    
    case 'RENAME_POLYGON': {
        const { polygonId, name } = action.payload;
        const newPolygons = state.polygons.map(p => 
            p.id === polygonId ? { ...p, name } : p
        );
        return { ...withHistory(state), polygons: newPolygons };
    }

    case 'RECONSTRUCT_GEOMETRY': {
        const polyId = action.payload;
        let msg = null;
        const stateWithHistory = withHistory(state);

        const newPolygons = state.polygons.map(p => {
            if (p.id !== polyId) return p;
            
            const result = solveGeometry(p);
            const solvedPoly = result.polygon;
            const error = result.metricError;
            const approx = result.approximated;

            // Update area if solved
            if (!error) {
                solvedPoly.area = calculatePolygonArea(solvedPoly.vertices);
                solvedPoly.isLocked = true; // LOCK ON SUCCESS
            } else {
                solvedPoly.isLocked = false;
            }

            if (error) {
                msg = { type: 'error', text: error } as const;
                return solvedPoly;
            }

            const totalV = solvedPoly.vertices.length;
            const solvedV = solvedPoly.vertices.filter(v => v.solved).length;
            const diagonals = solvedPoly.edges.filter(e => e.type === EdgeType.DIAGONAL).length;
            const fixedAngles = solvedPoly.vertices.filter(v => v.fixedAngle !== undefined).length;
            const totalConstraints = diagonals + fixedAngles;
            const needed = Math.max(0, totalV - 3);

            if (solvedV < totalV) {
                if (totalConstraints < needed) {
                     msg = { type: 'error', text: `Unstable Geometry: Found ${totalConstraints} constraints, need ${needed}.` } as const;
                } else {
                     msg = { type: 'error', text: `Unstable Geometry: Connectivity issue. Ensure the shape is rigid.` } as const;
                }
                solvedPoly.isLocked = false;
            } else {
                 if (totalConstraints > needed) {
                     msg = { type: 'success', text: approx ? 'Geometry reconstructed! (Over-determined, Approx. applied)' : 'Geometry reconstructed! (Over-determined)' } as const;
                 } else {
                     msg = { type: 'success', text: approx ? 'Geometry reconstructed! (Approx. applied)' : 'Geometry successfully reconstructed!' } as const;
                 }
                 if (solvedPoly.area) {
                     msg = { type: 'success', text: `${msg.text} Area: ${solvedPoly.area.toFixed(2)}m²` } as const;
                 }
            }

            return solvedPoly;
        });
        return { ...stateWithHistory, polygons: newPolygons, solverMsg: msg, contextMenu: null };
    }

    case 'PAN_ZOOM':
        return { 
            ...state, 
            panOffset: { x: action.payload.x, y: action.payload.y }, 
            zoomLevel: action.payload.zoom,
            rotation: action.payload.rotation,
            openVertexMenuId: null
        };

    case 'DELETE_POLYGON': {
        const isSelected = state.selectedPolygonIds.includes(action.payload);
        const polyToDelete = state.polygons.find(p => p.id === action.payload);
        let updatedPolygons = state.polygons.filter(p => p.id !== action.payload);
        
        if (polyToDelete?.groupId) {
             updatedPolygons = recalculateGroups(updatedPolygons);
        }
        
        const newSelected = state.selectedPolygonIds.filter(id => id !== action.payload);

        return {
            ...withHistory(state),
            polygons: updatedPolygons,
            selectedPolygonIds: newSelected, 
            selectedEdgeIds: isSelected ? [] : state.selectedEdgeIds,
            solverMsg: null,
            contextMenu: null
        };
    }

    // --- NEW ACTIONS ---

    case 'DUPLICATE_POLYGON': {
        let polyId: string | undefined = action.payload;
        // Fallback to selected if no specific ID provided
        if (!polyId && state.selectedPolygonIds.length > 0) {
            polyId = state.selectedPolygonIds[0];
        }
        
        if (!polyId) return state;

        const poly = state.polygons.find(p => p.id === polyId);
        if (!poly) return state;

        const newPoly = duplicatePolygon(poly);
        return {
            ...withHistory(state),
            polygons: [...state.polygons, newPoly],
            selectedPolygonIds: [newPoly.id],
            selectedEdgeIds: [],
            selectedVertexIds: [],
            solverMsg: { type: 'success', text: 'Polygon duplicated.' },
            contextMenu: null
        };
    }

    case 'MIRROR_POLYGON': {
        if (state.selectedPolygonIds.length === 0) return state;
        const polyId = state.selectedPolygonIds[0];
        const axis = action.payload.axis;
        const mainPoly = state.polygons.find(p => p.id === polyId);
        if (!mainPoly) return state;

        const pivot = mainPoly.centroid;
        const group = mainPoly.groupId;

        const newPolygons = state.polygons.map(p => {
            if (p.id === mainPoly.id || (group && p.groupId === group)) {
                return mirrorPolygon(p, axis, pivot);
            }
            return p;
        });

        return {
            ...withHistory(state),
            polygons: newPolygons,
            solverMsg: { type: 'success', text: `Mirrored ${axis === 'X' ? 'Horizontally' : 'Vertically'}` }
        };
    }

    case 'START_ALIGN_MODE': {
        if (state.selectedPolygonIds.length !== 1) return state;
        const polyId = state.selectedPolygonIds[0];
        const poly = state.polygons.find(p => p.id === polyId);
        if (!poly || !poly.isLocked) {
             return { ...state, solverMsg: { type: 'error', text: 'Polygon must be solved (locked) to align.' } };
        }
        return {
            ...state,
            alignState: {
                step: 'SELECT_SOURCE',
                sourcePolyId: poly.id,
                offset: 0,
                dist: 0
            },
            solverMsg: { type: 'success', text: 'Select an edge on the active polygon to align with.' }
        };
    }

    case 'SELECT_ALIGN_EDGE': {
        const edgeId = action.payload;
        if (!state.alignState) return state;

        if (state.alignState.step === 'SELECT_SOURCE') {
            // Verify edge belongs to source poly
            const poly = state.polygons.find(p => p.id === state.alignState?.sourcePolyId);
            if (!poly?.edges.some(e => e.id === edgeId)) return state;

            return {
                ...state,
                alignState: {
                    ...state.alignState,
                    step: 'SELECT_TARGET',
                    sourceEdgeId: edgeId
                },
                selectedEdgeIds: [edgeId], // Highlight it
                solverMsg: { type: 'success', text: 'Now select a target edge on ANY other polygon.' }
            };
        }

        if (state.alignState.step === 'SELECT_TARGET') {
            // Find target poly
            const targetPoly = state.polygons.find(p => p.edges.some(e => e.id === edgeId));
            if (!targetPoly) return state;
            if (targetPoly.id === state.alignState.sourcePolyId) {
                 return { ...state, solverMsg: { type: 'error', text: 'Cannot align to itself.' } };
            }

            return {
                ...state,
                alignState: {
                    ...state.alignState,
                    step: 'ADJUST',
                    targetPolyId: targetPoly.id,
                    targetEdgeId: edgeId
                },
                selectedEdgeIds: [...state.selectedEdgeIds, edgeId], // Highlight both
                solverMsg: { type: 'success', text: 'Adjust alignment parameters.' }
            };
        }

        return state;
    }

    case 'UPDATE_ALIGN_PARAMS': {
        if (!state.alignState) return state;
        return {
            ...state,
            alignState: {
                ...state.alignState,
                offset: action.payload.offset !== undefined ? action.payload.offset : state.alignState.offset,
                dist: action.payload.dist !== undefined ? action.payload.dist : state.alignState.dist,
            }
        };
    }

    case 'CONFIRM_ALIGNMENT': {
        if (!state.alignState || !state.alignState.sourcePolyId || !state.alignState.sourceEdgeId || !state.alignState.targetPolyId || !state.alignState.targetEdgeId) return state;

        const { sourcePolyId, sourceEdgeId, targetPolyId, targetEdgeId, offset, dist } = state.alignState;
        
        const sPoly = state.polygons.find(p => p.id === sourcePolyId);
        const tPoly = state.polygons.find(p => p.id === targetPolyId);
        if (!sPoly || !tPoly) return { ...state, alignState: null };

        // Calculate Transform
        const transform = calculateAlignmentTransform(sPoly, sourceEdgeId, tPoly, targetEdgeId, offset, dist);

        // Apply Rigid Body Transform to Source Group
        const movingGroup = sPoly.groupId;
        const pivot = sPoly.centroid; // Pivot for rotation is the Source Poly centroid

        const newPolygons = state.polygons.map(p => {
             if (p.id === sPoly.id || (movingGroup && p.groupId === movingGroup)) {
                 // 1. Rotate around source centroid
                 const rotated = rotatePolygon(p, pivot, transform.rotation);
                 // 2. Translate
                 const translated = translatePolygon(rotated, transform.dx, transform.dy);
                 return translated;
             }
             return p;
        });

        return {
            ...withHistory(state),
            polygons: newPolygons,
            alignState: null,
            selectedEdgeIds: [],
            solverMsg: { type: 'success', text: 'Alignment applied.' }
        };
    }

    case 'CANCEL_ALIGNMENT':
        return {
            ...state,
            alignState: null,
            selectedEdgeIds: [],
            solverMsg: null
        };
    
    // --- CONTEXT MENU ---
    case 'OPEN_CONTEXT_MENU':
        return {
            ...state,
            contextMenu: action.payload
        };
        
    case 'CLOSE_CONTEXT_MENU':
        return {
            ...state,
            contextMenu: null
        };
        
    case 'DISMISS_MESSAGE':
        return { ...state, solverMsg: null };
        
    case 'SHOW_MESSAGE':
        return { ...state, solverMsg: action.payload };
    
    case 'CLOSE_VERTEX_MENU':
        return { ...state, openVertexMenuId: null };

    default:
      return state;
  }
};

const SurveyContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

export const SurveyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(surveyReducer, initialState);
  return (
    <SurveyContext.Provider value={{ state, dispatch }}>
      {children}
    </SurveyContext.Provider>
  );
};

export const useSurvey = () => {
  const context = useContext(SurveyContext);
  if (!context) throw new Error('useSurvey must be used within SurveyProvider');
  return context;
};
