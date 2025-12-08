
import { Point, Vertex, Edge, EdgeType, Polygon } from '../types';

export const PIXELS_PER_METER = 100;

// --- Basic Math ---

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const midPoint = (p1: Point, p2: Point): Point => {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
};

export const calculateCentroid = (vertices: Vertex[]): Point => {
  if (vertices.length === 0) return { x: 0, y: 0 };
  const sum = vertices.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
};

export const rotatePoint = (p: Point, center: Point, angle: number): Point => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
        x: center.x + (dx * cos - dy * sin),
        y: center.y + (dx * sin + dy * cos)
    };
};

/**
 * Calculates the Signed Area of the polygon.
 * In Screen Coordinates (Y-Down):
 * Area > 0 implies Clockwise (CW) winding.
 * Area < 0 implies Counter-Clockwise (CCW) winding.
 */
export const getPolygonSignedArea = (vertices: Vertex[]): number => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += (vertices[i].x * vertices[j].y);
        area -= (vertices[j].x * vertices[i].y);
    }
    return area / 2;
};

// --- Group Logic (Graph Traversal) ---

/**
 * Returns a Set of Polygon IDs that are connected to the startPolyId
 * via linked edges (recursively).
 * Optional excludePolyId to block traversal (useful for finding a subgraph connected to one side of a link).
 */
export const getConnectedPolygonGroup = (startPolyId: string, allPolygons: Polygon[], excludePolyId?: string): Set<string> => {
    const group = new Set<string>();
    const queue = [startPolyId];
    group.add(startPolyId);

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentPoly = allPolygons.find(p => p.id === currentId);
        if (!currentPoly) continue;

        // Find all linked edges in this polygon
        currentPoly.edges.forEach(edge => {
            if (edge.linkedEdgeId) {
                // Find the polygon that contains the linked edge
                const neighbor = allPolygons.find(p => p.edges.some(e => e.id === edge.linkedEdgeId));
                if (neighbor && neighbor.id !== excludePolyId && !group.has(neighbor.id)) {
                    group.add(neighbor.id);
                    queue.push(neighbor.id);
                }
            }
        });
    }
    return group;
};

/**
 * Recalculates groups for all polygons in the provided list.
 * Should be called after unlinking or removing polygons.
 * Returns the updated list of polygons.
 */
export const recalculateGroups = (polygons: Polygon[]): Polygon[] => {
    const visited = new Set<string>();
    const newPolygons = [...polygons];
    
    // We iterate through all polygons. If not visited, start a BFS/DFS to find component.
    for (const poly of newPolygons) {
        if (visited.has(poly.id)) continue;

        const component = getConnectedPolygonGroup(poly.id, newPolygons);
        
        // Mark all in component as visited
        component.forEach(id => visited.add(id));

        // If component size > 1, assign a new group ID. If size == 1, remove group ID.
        if (component.size > 1) {
            const newGroupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            component.forEach(id => {
                const pIndex = newPolygons.findIndex(p => p.id === id);
                if (pIndex !== -1) {
                    newPolygons[pIndex] = { ...newPolygons[pIndex], groupId: newGroupId };
                }
            });
        } else {
            // Singleton
            const pIndex = newPolygons.findIndex(p => p.id === poly.id);
            if (pIndex !== -1) {
                newPolygons[pIndex] = { ...newPolygons[pIndex], groupId: undefined };
            }
        }
    }
    
    return newPolygons;
};


// --- Transformation Logic ---

export const rotatePolygon = (poly: Polygon, center: Point, angle: number): Polygon => {
    const newVertices = poly.vertices.map(v => {
        const rotated = rotatePoint(v, center, angle);
        return { ...v, x: rotated.x, y: rotated.y };
    });
    return {
        ...poly,
        vertices: newVertices,
        centroid: calculateCentroid(newVertices)
    };
};

export const translatePolygon = (poly: Polygon, dx: number, dy: number): Polygon => {
    const newVertices = poly.vertices.map(v => ({
        ...v,
        x: v.x + dx,
        y: v.y + dy
    }));
    return {
        ...poly,
        vertices: newVertices,
        centroid: calculateCentroid(newVertices)
    };
};

export const duplicatePolygon = (poly: Polygon): Polygon => {
    const idMap = new Map<string, string>();
    const newId = `poly-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Offset slightly
    const offset = 30;

    const newVertices = poly.vertices.map(v => {
        const newVId = `${newId}-v${Math.random().toString(36).substr(2, 5)}`;
        idMap.set(v.id, newVId);
        return { ...v, id: newVId, x: v.x + offset, y: v.y + offset };
    });

    const newEdges = poly.edges.map(e => {
        const newEId = `${newId}-e${Math.random().toString(36).substr(2, 5)}`;
        return {
            ...e,
            id: newEId,
            startVertexId: idMap.get(e.startVertexId)!,
            endVertexId: idMap.get(e.endVertexId)!,
            linkedEdgeId: undefined, // Detach connections
            alignmentOffset: undefined
        };
    });

    return {
        ...poly,
        id: newId,
        name: `${poly.name} (Copy)`,
        vertices: newVertices,
        edges: newEdges,
        centroid: calculateCentroid(newVertices),
        groupId: undefined, // Detach from group
        isLocked: poly.isLocked // Maintain locked state logic? Usually a copy keeps shape but is free. Let's keep it locked if original was solved.
    };
};

export const mirrorPolygon = (poly: Polygon, axis: 'X' | 'Y', pivot: Point): Polygon => {
    const newVertices = poly.vertices.map(v => {
        let x = v.x;
        let y = v.y;
        
        if (axis === 'X') {
            // Flip Horizontal (across vertical line at pivot.x)
            x = pivot.x - (x - pivot.x);
        } else {
            // Flip Vertical (across horizontal line at pivot.y)
            y = pivot.y - (y - pivot.y);
        }
        return { ...v, x, y };
    });
    
    // When mirroring, winding order reverses (CW becomes CCW). 
    // This can break "External Join" logic which relies on winding.
    // We should reverse the vertex array order to preserve geometric winding properties relative to "Inside/Outside".
    // However, the ID mapping for edges needs to stay consistent.
    
    return {
        ...poly,
        vertices: newVertices,
        centroid: calculateCentroid(newVertices)
    };
};

export const calculateAlignmentTransform = (
    sourcePoly: Polygon, 
    sourceEdgeId: string, 
    targetPoly: Polygon, 
    targetEdgeId: string,
    offset: number = 0, // Linear sliding offset from center
    perpendicularDist: number = 0 // Thickness spacing (Meters)
): { rotation: number, dx: number, dy: number } => {
    // 1. Get Coordinates
    const sEdge = sourcePoly.edges.find(e => e.id === sourceEdgeId);
    const tEdge = targetPoly.edges.find(e => e.id === targetEdgeId);
    if (!sEdge || !tEdge) return { rotation: 0, dx: 0, dy: 0 };

    const sV1 = sourcePoly.vertices.find(v => v.id === sEdge.startVertexId)!;
    const sV2 = sourcePoly.vertices.find(v => v.id === sEdge.endVertexId)!;
    const tV1 = targetPoly.vertices.find(v => v.id === tEdge.startVertexId)!;
    const tV2 = targetPoly.vertices.find(v => v.id === tEdge.endVertexId)!;

    // 2. Winding & Normals
    const sArea = getPolygonSignedArea(sourcePoly.vertices);
    const tArea = getPolygonSignedArea(targetPoly.vertices);
    const sIsCW = sArea > 0;
    const tIsCW = tArea > 0;

    const angleSource = Math.atan2(sV2.y - sV1.y, sV2.x - sV1.x);
    const angleTarget = Math.atan2(tV2.y - tV1.y, tV2.x - tV1.x);

    const sNormalAngleRel = sIsCW ? Math.PI / 2 : -Math.PI / 2;
    const tNormalAngleRel = tIsCW ? Math.PI / 2 : -Math.PI / 2;

    const sNormalAngle = angleSource + sNormalAngleRel;
    const tNormalAngle = angleTarget + tNormalAngleRel;

    // 3. Determine Required Rotation
    const rotationNeeded = tNormalAngle + Math.PI - sNormalAngle;

    // 4. Determine Translation
    // We calculate where the Source Centroid SHOULD be after rotation + translation
    
    // Rotate Source Centroid around itself? No, rotation is around centroid.
    // So centroid stays at (cx, cy) during rotation.
    // We need to find the vector from Rotated Edge Midpoint to Target Position.
    
    // Simulate Rotation of Edge Midpoint
    const sMid = { x: (sV1.x + sV2.x) / 2, y: (sV1.y + sV2.y) / 2 };
    const rotatedSMid = rotatePoint(sMid, sourcePoly.centroid, rotationNeeded);
    
    const tMid = { x: (tV1.x + tV2.x) / 2, y: (tV1.y + tV2.y) / 2 };

    // Target Position
    const tOutAngle = tNormalAngle + Math.PI;
    const nx = Math.cos(tOutAngle);
    const ny = Math.sin(tOutAngle);

    const tLen = distance(tV1, tV2);
    const ux = (tV2.x - tV1.x) / tLen;
    const uy = (tV2.y - tV1.y) / tLen;

    const distPx = perpendicularDist * PIXELS_PER_METER;
    const offsetPx = offset * PIXELS_PER_METER;

    const targetX = tMid.x + (nx * distPx) + (ux * offsetPx);
    const targetY = tMid.y + (ny * distPx) + (uy * offsetPx);

    const dx = targetX - rotatedSMid.x;
    const dy = targetY - rotatedSMid.y;

    return { rotation: rotationNeeded, dx, dy };
};

/**
 * Calculates the offset required to project Source Edge onto Target Edge 
 * based on their current visual positions, effectively allowing "snap in place".
 * The returned offset is in Meters, relative to the center alignment.
 */
export const calculateProjectedOffset = (
    sV1: Vertex, sV2: Vertex,
    tV1: Vertex, tV2: Vertex
): number => {
    const sMid = { x: (sV1.x + sV2.x) / 2, y: (sV1.y + sV2.y) / 2 };
    const tMid = { x: (tV1.x + tV2.x) / 2, y: (tV1.y + tV2.y) / 2 };

    const dx = tV2.x - tV1.x;
    const dy = tV2.y - tV1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return 0;

    const ux = dx / len;
    const uy = dy / len;

    // Vector from Target Midpoint to Source Midpoint
    const diffX = sMid.x - tMid.x;
    const diffY = sMid.y - tMid.y;

    // Project diff onto unit vector of Target
    const offsetPx = diffX * ux + diffY * uy;
    
    // Convert to meters
    return offsetPx / PIXELS_PER_METER;
}

/**
 * Aligns 'sourcePoly' to 'targetPoly' along their respective edges.
 * Uses calculateAlignmentTransform internally.
 */
export const alignPolygonToEdge = (
    sourcePoly: Polygon, 
    sourceEdgeId: string, 
    targetPoly: Polygon, 
    targetEdgeId: string,
    offset: number = 0,
    perpendicularDist: number = 0
): Polygon => {
    const transform = calculateAlignmentTransform(sourcePoly, sourceEdgeId, targetPoly, targetEdgeId, offset, perpendicularDist);
    
    // 1. Rotate
    const rotated = rotatePolygon(sourcePoly, sourcePoly.centroid, transform.rotation);
    // 2. Translate
    return translatePolygon(rotated, transform.dx, transform.dy);
};

// --- Intersection Logic (for validation) ---

const ccw = (p1: Point, p2: Point, p3: Point): boolean => {
  return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
};

export const doSegmentsIntersect = (p1: Point, p2: Point, p3: Point, p4: Point): boolean => {
  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) && 
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
};

export type ConnectionStatus = 
  | { valid: true }
  | { valid: false; msg: string };

export const checkConnectionStatus = (v1Id: string, v2Id: string, poly: Polygon): ConnectionStatus => {
    if (v1Id === v2Id) return { valid: false, msg: "Cannot connect vertex to itself." };

    const existingEdge = poly.edges.find(e => 
        (e.startVertexId === v1Id && e.endVertexId === v2Id) ||
        (e.startVertexId === v2Id && e.endVertexId === v1Id)
    );

    if (existingEdge) {
        if (existingEdge.type === EdgeType.PERIMETER) {
            return { valid: false, msg: "Points are already connected (Perimeter)." };
        } else {
            return { valid: false, msg: "Diagonal already exists." };
        }
    }

    const v1 = poly.vertices.find(v => v.id === v1Id);
    const v2 = poly.vertices.find(v => v.id === v2Id);
    
    if (!v1 || !v2) return { valid: false, msg: "Invalid vertices." };

    const hasIntersection = poly.edges.some(edge => {
        const eStart = poly.vertices.find(v => v.id === edge.startVertexId);
        const eEnd = poly.vertices.find(v => v.id === edge.endVertexId);
        if (!eStart || !eEnd) return false;
        
        if (eStart.id === v1Id || eStart.id === v2Id || 
            eEnd.id === v1Id || eEnd.id === v2Id) {
            return false; 
        }
        
        return doSegmentsIntersect(v1, v2, eStart, eEnd);
    });

    if (hasIntersection) {
        return { valid: false, msg: "Cannot connect: Lines would intersect." };
    }

    return { valid: true };
};

// --- Triangulation Solver (Wavefront Propagation) ---

const EPSILON = 10; // 10px tolerance (equivalent to 10cm at 100px/m)

export const findIntersection = (
  p1: Point,
  r1: number,
  p2: Point,
  r2: number,
  originalP3: Point 
): { type: 'success', point: Point, approximated?: boolean } | { type: 'error', code: 'SEPARATED' | 'CONTAINED' } => {
  const d = distance(p1, p2);

  if (d === 0) return { type: 'error', code: 'CONTAINED' };

  if (d > r1 + r2) {
      if (d <= r1 + r2 + EPSILON) {
          const ratio = r1 / (r1 + r2);
          const x = p1.x + (p2.x - p1.x) * ratio;
          const y = p1.y + (p2.y - p1.y) * ratio;
          return { type: 'success', point: { x, y }, approximated: true };
      }
      return { type: 'error', code: 'SEPARATED' }; 
  }

  if (d < Math.abs(r1 - r2)) {
       if (d >= Math.abs(r1 - r2) - EPSILON) {
            const rMax = Math.max(r1, r2);
            let x, y;
            if (r1 > r2) {
                 x = p1.x + (p2.x - p1.x) * (r1 / d);
                 y = p1.y + (p2.y - p1.y) * (r1 / d);
            } else {
                 x = p2.x + (p1.x - p2.x) * (r2 / d);
                 y = p2.y + (p1.y - p2.y) * (r2 / d);
            }
            return { type: 'success', point: { x, y }, approximated: true };
       }
       return { type: 'error', code: 'CONTAINED' };
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));

  const x2 = p1.x + (a * (p2.x - p1.x)) / d;
  const y2 = p1.y + (a * (p2.y - p1.y)) / d;

  const intersection1 = {
    x: x2 + (h * (p2.y - p1.y)) / d,
    y: y2 - (h * (p2.x - p1.x)) / d,
  };

  const intersection2 = {
    x: x2 - (h * (p2.y - p1.y)) / d,
    y: y2 + (h * (p2.x - p1.x)) / d,
  };

  const dist1 = distance(intersection1, originalP3);
  const dist2 = distance(intersection2, originalP3);

  return { type: 'success', point: dist1 < dist2 ? intersection1 : intersection2 };
};

export const calculateSASDistance = (lenA: number, lenB: number, angleDeg: number): number => {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cSq = Math.pow(lenA, 2) + Math.pow(lenB, 2) - 2 * lenA * lenB * Math.cos(angleRad);
    return Math.sqrt(cSq);
};

export const calculatePolygonArea = (vertices: Vertex[]): number => {
    if (vertices.length < 3) return 0;
    const areaPx = Math.abs(getPolygonSignedArea(vertices));
    return areaPx / (PIXELS_PER_METER * PIXELS_PER_METER);
};

export const solveGeometry = (polygon: Polygon): { polygon: Polygon, metricError?: string, approximated?: boolean } => {
  let vertices = [...polygon.vertices];
  let effectiveEdges = [...polygon.edges];
  let isApproximated = false;

  vertices.forEach(v => {
      if (v.fixedAngle !== undefined) {
          const connected = polygon.edges.filter(e => 
              (e.startVertexId === v.id || e.endVertexId === v.id) &&
              e.type === EdgeType.PERIMETER
          );

          if (connected.length === 2) {
              const e1 = connected[0];
              const e2 = connected[1];
              const n1Id = e1.startVertexId === v.id ? e1.endVertexId : e1.startVertexId;
              const n2Id = e2.startVertexId === v.id ? e2.endVertexId : e2.startVertexId;

              const virtualLen = calculateSASDistance(e1.length, e2.length, v.fixedAngle);
              
              effectiveEdges = effectiveEdges.filter(e => 
                  !((e.startVertexId === n1Id && e.endVertexId === n2Id) || 
                    (e.startVertexId === n2Id && e.endVertexId === n1Id))
              );

              effectiveEdges.push({
                  id: `virtual-${v.id}`,
                  startVertexId: n1Id,
                  endVertexId: n2Id,
                  length: parseFloat(virtualLen.toFixed(4)),
                  type: EdgeType.DIAGONAL
              });
          }
      }
  });

  const solved = new Set<string>();
  
  if (vertices.length < 3) {
      return { polygon: { ...polygon, vertices: vertices.map(v => ({...v, solved: false})) } };
  }

  const vertexMap = new Map<string, Vertex>();
  vertices.forEach(v => vertexMap.set(v.id, v));

  let v0: Vertex | undefined, v1: Vertex | undefined;
  let startEdge: Edge | undefined;

  for (const edge of effectiveEdges) {
      const s = vertexMap.get(edge.startVertexId);
      const e = vertexMap.get(edge.endVertexId);
      if (s && e) {
          v0 = s; 
          v1 = e;
          startEdge = edge;
          break;
      }
  }

  if (!v0 || !v1 || !startEdge) {
      return { polygon: { ...polygon, vertices: vertices.map(v => ({...v, solved: false})) } };
  }

  solved.add(v0.id);
  solved.add(v1.id);

  const currentAngle = Math.atan2(v1.y - v0.y, v1.x - v0.x);
  const scaledStartLength = startEdge.length * PIXELS_PER_METER;

  const newV1 = {
      ...v1,
      x: v0.x + Math.cos(currentAngle) * scaledStartLength,
      y: v0.y + Math.sin(currentAngle) * scaledStartLength
  };
  vertexMap.set(v1.id, newV1);
  vertices = vertices.map(v => v.id === v1.id ? newV1 : v);

  let progress = true;
  let metricError: string | undefined = undefined;

  while (progress) {
    progress = false;

    for (const vTarget of vertices) {
      if (solved.has(vTarget.id)) continue;

      const connected = effectiveEdges.filter(e => 
        (e.startVertexId === vTarget.id && solved.has(e.endVertexId)) ||
        (e.endVertexId === vTarget.id && solved.has(e.startVertexId))
      );

      if (connected.length >= 2) {
        // Sort by id for determinism or just take first two
        const e1 = connected[0];
        const e2 = connected[1];

        const p1Id = e1.startVertexId === vTarget.id ? e1.endVertexId : e1.startVertexId;
        const p2Id = e2.startVertexId === vTarget.id ? e2.endVertexId : e2.startVertexId;

        const p1 = vertexMap.get(p1Id)!;
        const p2 = vertexMap.get(p2Id)!;

        const r1 = e1.length * PIXELS_PER_METER;
        const r2 = e2.length * PIXELS_PER_METER;

        const result = findIntersection(p1, r1, p2, r2, vTarget);

        if (result.type === 'success') {
             const newV = { ...vTarget, x: result.point.x, y: result.point.y, solved: true };
             vertexMap.set(vTarget.id, newV);
             const idx = vertices.findIndex(v => v.id === vTarget.id);
             if (idx !== -1) vertices[idx] = newV;
             
             solved.add(vTarget.id);
             progress = true;
             if (result.approximated) isApproximated = true;
        } else {
             if (!metricError) {
                 if (result.code === 'SEPARATED') metricError = `Geometric conflict: Edge lengths around ${vTarget.label} are too short to connect.`;
                 if (result.code === 'CONTAINED') metricError = `Geometric conflict: Edge lengths around ${vTarget.label} are impossible (one contained in other).`;
             }
        }
      }
    }
  }

  // Update remaining vertices as unsolved if not reached
  vertices = vertices.map(v => solved.has(v.id) ? v : { ...v, solved: false });

  // If we have solved all vertices, we should also check if we have any "extra" edges that are now violated
  // e.g. a diagonal that was not used for triangulation but exists. 
  // For simplicity, we assume if triangulation succeeded, it's good, but we can check consistency.
  
  if (vertices.some(v => !v.solved) && !metricError) {
      metricError = "Insufficient constraints to fully solve geometry.";
  }

  return { 
      polygon: {
          ...polygon,
          vertices: vertices,
          centroid: calculateCentroid(vertices)
      },
      metricError,
      approximated: isApproximated
  };
};

export const generateRegularPolygon = (center: Point, sides: number, id: string, name: string): Polygon => {
    const radius = 150; 
    const vertices: Vertex[] = [];
    const edges: Edge[] = [];
    const angleStep = (2 * Math.PI) / sides;

    for (let i = 0; i < sides; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = center.x + radius * Math.cos(angle);
        const y = center.y + radius * Math.sin(angle);
        vertices.push({
            id: `${id}-v${i}`,
            x,
            y,
            label: String.fromCharCode(65 + i),
            solved: true
        });
    }

    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        const v1 = vertices[i];
        const v2 = vertices[next];
        const len = distance(v1, v2);
        edges.push({
            id: `${id}-e${i}`,
            startVertexId: v1.id,
            endVertexId: v2.id,
            length: parseFloat((len / PIXELS_PER_METER).toFixed(2)),
            type: EdgeType.PERIMETER,
            thickness: 10
        });
    }

    return {
        id,
        name,
        vertices,
        edges,
        centroid: calculateCentroid(vertices),
        isClosed: true,
        isLocked: false 
    };
};

export const generateDXF = (polygons: Polygon[]): string => {
    let s = "0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
    
    for (const poly of polygons) {
        for (const edge of poly.edges) {
             const v1 = poly.vertices.find(v => v.id === edge.startVertexId);
             const v2 = poly.vertices.find(v => v.id === edge.endVertexId);
             if (v1 && v2) {
                 const x1 = v1.x / PIXELS_PER_METER;
                 const y1 = -v1.y / PIXELS_PER_METER; // Invert Y for CAD
                 const x2 = v2.x / PIXELS_PER_METER;
                 const y2 = -v2.y / PIXELS_PER_METER;
                 
                 s += "0\nLINE\n";
                 s += "8\n" + (edge.type === EdgeType.PERIMETER ? "WALLS" : "DIAGONALS") + "\n";
                 s += "10\n" + x1.toFixed(4) + "\n";
                 s += "20\n" + y1.toFixed(4) + "\n";
                 s += "30\n0.0\n";
                 s += "11\n" + x2.toFixed(4) + "\n";
                 s += "21\n" + y2.toFixed(4) + "\n";
                 s += "31\n0.0\n";
             }
        }
        
        const c = poly.centroid;
        const cx = c.x / PIXELS_PER_METER;
        const cy = -c.y / PIXELS_PER_METER;
        s += "0\nTEXT\n";
        s += "8\nLABELS\n";
        s += "10\n" + cx.toFixed(4) + "\n";
        s += "20\n" + cy.toFixed(4) + "\n";
        s += "30\n0.0\n";
        s += "40\n0.2\n"; 
        s += "1\n" + poly.name + "\n";
    }
    
    s += "0\nENDSEC\n0\nEOF\n";
    return s;
}
