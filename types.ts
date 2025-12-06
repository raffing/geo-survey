
export interface Point {
  x: number;
  y: number;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
  label: string; // e.g., "A", "B", "C"
  solved?: boolean;
  fixedAngle?: number; // In degrees, e.g., 90
}

export enum EdgeType {
  PERIMETER = 'PERIMETER',
  DIAGONAL = 'DIAGONAL',
}

export interface Edge {
  id: string;
  startVertexId: string;
  endVertexId: string;
  length: number; // The real-world measured length (meters)
  type: EdgeType;
  thickness?: number; // Visual thickness to simulate walls (in world units)
  linkedEdgeId?: string; // ID of an edge in another polygon this is joined to
  alignmentOffset?: number; // Distance (m) from target start vertex along the shared line
}

export interface Polygon {
  id: string;
  name: string;
  vertices: Vertex[];
  edges: Edge[];
  centroid: Point;
  isClosed: boolean;
  metricError?: string;
  area?: number;
}

// Data required to restore a previous state
export interface HistoryEntry {
  polygons: Polygon[];
  selectedPolygonId: string | null;
  selectedEdgeIds: string[]; 
  selectedVertexIds: string[];
}

export interface AppState {
  polygons: Polygon[];
  selectedPolygonId: string | null;
  selectedEdgeIds: string[]; 
  selectedVertexIds: string[]; 
  openVertexMenuId: string | null; // ID of the vertex with open context menu
  panOffset: Point;
  zoomLevel: number;
  rotation: number; // in radians
  isDragging: boolean;
  solverMsg: { type: 'success' | 'error'; text: string } | null;
  
  // Interaction Modes
  isJoinMode: boolean; 
  joinSourceEdgeId: string | null; 

  // Drawing Mode
  isDrawingMode: boolean;
  drawingPoints: Point[];
  
  // History Stacks
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export type Action =
  | { type: 'ADD_POLYGON'; payload: Polygon }
  | { type: 'SELECT_POLYGON'; payload: string | null }
  | { type: 'SELECT_EDGE'; payload: string | null | { edgeId: string; multi: boolean } }
  | { type: 'SPLIT_EDGE'; payload: string }
  | { type: 'TOGGLE_VERTEX_SELECTION'; payload: string } 
  | { type: 'OPEN_VERTEX_MENU'; payload: string }
  | { type: 'CLOSE_VERTEX_MENU'; payload: void }
  | { type: 'SET_VERTEX_ANGLE'; payload: { vertexId: string; angle: number | undefined } }
  | { type: 'DELETE_VERTEX'; payload: string }
  | { type: 'ADD_DIAGONAL'; payload: void } 
  | { type: 'DELETE_EDGE'; payload: string } 
  | { type: 'UPDATE_EDGE_LENGTH'; payload: { edgeId: string; length: number } }
  | { type: 'UPDATE_EDGE_THICKNESS'; payload: { edgeId: string; thickness: number } }
  | { type: 'UPDATE_EDGE_ALIGNMENT'; payload: { edgeId: string; offset: number } }
  | { type: 'MOVE_VERTEX'; payload: { vertexId: string; x: number; y: number } }
  | { type: 'RECONSTRUCT_GEOMETRY'; payload: string }
  | { type: 'PAN_ZOOM'; payload: { x: number; y: number; zoom: number; rotation: number } }
  | { type: 'DELETE_POLYGON'; payload: string }
  | { type: 'DISMISS_MESSAGE'; payload: void }
  | { type: 'UNDO'; payload: void }
  | { type: 'REDO'; payload: void }
  | { type: 'CAPTURE_SNAPSHOT'; payload: void }
  | { type: 'START_JOIN_MODE'; payload: string } 
  | { type: 'COMPLETE_JOIN'; payload: string }
  | { type: 'START_DRAWING'; payload: void }
  | { type: 'ADD_DRAWING_POINT'; payload: Point }
  | { type: 'UNDO_DRAWING_POINT'; payload: void }
  | { type: 'CANCEL_DRAWING'; payload: void }
  | { type: 'FINISH_DRAWING'; payload: string }; // Payload is the name of the polygon
