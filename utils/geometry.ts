
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

// --- Group Logic (Graph Traversal) ---

/**
 * Returns a Set of Polygon IDs that are connected to the startPolyId
 * via linked edges (recursively).
 */
export const getConnectedPolygonGroup = (startPolyId: string, allPolygons: Polygon[]): Set<string> => {
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
                if (neighbor && !group.has(neighbor.id)) {
                    group.add(neighbor.id);
                    queue.push(neighbor.id);
                }
            }
        });
    }
    return group;
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

/**
 * Aligns 'sourcePoly' to 'targetPoly' along their respective edges.
 * supports 'offset' (in pixels/units) to slide the source along the target vector.
 */
export const alignPolygonToEdge = (
    sourcePoly: Polygon, 
    sourceEdgeId: string, 
    targetPoly: Polygon, 
    targetEdgeId: string,
    offset: number = 0
): Polygon => {
    // 1. Get Coordinates
    const sEdge = sourcePoly.edges.find(e => e.id === sourceEdgeId);
    const tEdge = targetPoly.edges.find(e => e.id === targetEdgeId);
    if (!sEdge || !tEdge) return sourcePoly;

    // We align sV1 (start of source) relative to tV1 (start of target)
    const sV1 = sourcePoly.vertices.find(v => v.id === sEdge.startVertexId)!;
    const sV2 = sourcePoly.vertices.find(v => v.id === sEdge.endVertexId)!;
    
    // Target vector details
    const tV1 = targetPoly.vertices.find(v => v.id === tEdge.startVertexId)!;
    const tV2 = targetPoly.vertices.find(v => v.id === tEdge.endVertexId)!;

    // 2. Calculate Angles
    const angleSource = Math.atan2(sV2.y - sV1.y, sV2.x - sV1.x);
    const angleTarget = Math.atan2(tV2.y - tV1.y, tV2.x - tV1.x);

    // 3. Determine Best Rotation (Flip logic)
    // We strictly want them anti-parallel (facing each other) for walls
    // Vector Source must be opposite to Vector Target
    const targetOpposite = angleTarget + Math.PI;
    const angleDiff = targetOpposite - angleSource;

    // A. Rotate Source around its centroid
    const rotated = rotatePolygon(sourcePoly, sourcePoly.centroid, angleDiff);
    
    // B. Get rotated source start vertex
    const rV1 = rotated.vertices.find(v => v.id === sV1.id)!;
    const rV2 = rotated.vertices.find(v => v.id === sV2.id)!;
    
    // C. Calculate Target Anchor Point
    // We align the line (rV1 -> rV2) onto the line (tV1 -> tV2)
    // Anchor: We want rV1 (or rV2) to lie on the line.
    
    // Vector of Target Edge (Unit vector)
    const tLen = distance(tV1, tV2);
    const ux = (tV2.x - tV1.x) / tLen;
    const uy = (tV2.y - tV1.y) / tLen;

    // D. Calculate Translation to snap Start-to-End (Standard Join)
    // Usually we snap rV1 to tV2 (Start of source to End of target for continuous flow) 
    // OR rV1 to tV1 if we want them side-by-side. 
    // Given the 'offset', let's base it on tV1 as origin.
    
    const pxPerMeter = tEdge.length > 0 ? tLen / tEdge.length : PIXELS_PER_METER;
    const offsetPx = offset * pxPerMeter;

    const targetX = tV1.x + ux * offsetPx;
    const targetY = tV1.y + uy * offsetPx;

    // E. Translate
    // Note: Due to rotation, rV1 might not be the 'start' visually anymore, but logically it is.
    // If we want rV2 (end of source edge) to align with tV1 (start of target edge), we'd translate rV2 to target.
    // Let's assume rV1 aligns with tV1 + offset.
    
    const dx = targetX - rV1.x;
    const dy = targetY - rV1.y;
    
    return translatePolygon(rotated, dx, dy);
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
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    const areaPx = Math.abs(area) / 2;
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

      const connectedEdges = effectiveEdges.filter(e => 
        e.startVertexId === vTarget.id || e.endVertexId === vTarget.id
      );

      const solvedNeighbors: { vertex: Vertex, edgeLen: number }[] = [];

      for (const edge of connectedEdges) {
        const neighborId = edge.startVertexId === vTarget.id ? edge.endVertexId : edge.startVertexId;
        if (solved.has(neighborId)) {
          solvedNeighbors.push({
            vertex: vertexMap.get(neighborId)!,
            edgeLen: edge.length * PIXELS_PER_METER
          });
        }
      }

      if (solvedNeighbors.length >= 2) {
        const anchor1 = solvedNeighbors[0];
        const anchor2 = solvedNeighbors[1];

        const result = findIntersection(
          anchor1.vertex, anchor1.edgeLen,
          anchor2.vertex, anchor2.edgeLen,
          vTarget 
        );

        if (result.type === 'success') {
          if (result.approximated) isApproximated = true;

          const updatedV = { ...vTarget, x: result.point.x, y: result.point.y };
          vertexMap.set(vTarget.id, updatedV);
          
          const idx = vertices.findIndex(v => v.id === vTarget.id);
          if (idx !== -1) vertices[idx] = updatedV;

          solved.add(vTarget.id);
          progress = true; 
        } else {
             metricError = `Measurement Error: Edges do not meet at Vertex ${vTarget.label}.`;
        }
      }
    }
  }

  const finalVertices = vertices.map(v => ({
      ...v,
      solved: solved.has(v.id)
  }));

  return {
    polygon: {
        ...polygon,
        vertices: finalVertices,
        centroid: calculateCentroid(finalVertices)
    },
    metricError,
    approximated: isApproximated
  };
};

export const generateRegularPolygon = (
    center: Point, 
    sides: number, 
    idBase: string, 
    name?: string
): Polygon => {
  const radius = 150;
  const vertices: Vertex[] = [];
  const validSides = Math.max(3, sides);
  const startAngle = validSides === 4 ? -Math.PI / 4 : -Math.PI / 2;

  for (let i = 0; i < validSides; i++) {
    const angle = startAngle + (i * 2 * Math.PI) / validSides; 
    vertices.push({
      id: `${idBase}-v${i}`,
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
      label: String.fromCharCode(65 + i),
      solved: true 
    });
  }

  const edges: Edge[] = [];
  
  for (let i = 0; i < validSides; i++) {
    const next = (i + 1) % validSides;
    const v1 = vertices[i];
    const v2 = vertices[next];
    const len = distance(v1, v2);
    
    edges.push({
      id: `${idBase}-e-p${i}`,
      startVertexId: v1.id,
      endVertexId: v2.id,
      length: parseFloat((len / PIXELS_PER_METER).toFixed(2)),
      type: EdgeType.PERIMETER,
      thickness: 10 
    });
  }

  if (validSides > 3) {
      for (let i = 2; i < validSides - 1; i++) {
          const vStart = vertices[0];
          const vEnd = vertices[i];
          const len = distance(vStart, vEnd);
          
          edges.push({
              id: `${idBase}-e-d${i}`,
              startVertexId: vStart.id,
              endVertexId: vEnd.id,
              length: parseFloat((len / PIXELS_PER_METER).toFixed(2)),
              type: EdgeType.DIAGONAL
          });
      }
  }

  return {
    id: idBase,
    name: name || `Polygon ${validSides}`,
    vertices,
    edges,
    centroid: calculateCentroid(vertices),
    isClosed: true
  };
};

export const generateDXF = (polygons: Polygon[]): string => {
    let dxf = "0\nSECTION\n2\nENTITIES\n";
    
    polygons.forEach(poly => {
        poly.edges.forEach(edge => {
            const v1 = poly.vertices.find(v => v.id === edge.startVertexId);
            const v2 = poly.vertices.find(v => v.id === edge.endVertexId);
            if (v1 && v2) {
                const layer = edge.type === EdgeType.PERIMETER ? "WALLS" : "DIAGONALS";
                const color = edge.type === EdgeType.PERIMETER ? "7" : "252"; 
                
                dxf += "0\nLINE\n8\n" + layer + "\n62\n" + color + "\n";
                dxf += "10\n" + (v1.x / PIXELS_PER_METER).toFixed(4) + "\n"; 
                dxf += "20\n" + (-v1.y / PIXELS_PER_METER).toFixed(4) + "\n"; 
                dxf += "11\n" + (v2.x / PIXELS_PER_METER).toFixed(4) + "\n"; 
                dxf += "21\n" + (-v2.y / PIXELS_PER_METER).toFixed(4) + "\n"; 
            }
        });

        poly.vertices.forEach(v => {
             dxf += "0\nTEXT\n8\nLABELS\n62\n3\n"; 
             dxf += "10\n" + (v.x / PIXELS_PER_METER).toFixed(4) + "\n";
             dxf += "20\n" + (-v.y / PIXELS_PER_METER).toFixed(4) + "\n";
             dxf += "40\n0.2\n"; 
             dxf += "1\n" + v.label + "\n";
        });
    });

    dxf += "0\nENDSEC\n0\nEOF\n";
    return dxf;
};
