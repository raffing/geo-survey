
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
  thickness?: number; // Visual thickness to simulate walls (in world units, cm usually stored as number)
  linkedEdgeId?: string; // ID of an edge in another polygon this is joined to
  alignmentOffset?: number; // Distance (m) from center of target edge along the shared line
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
  isLocked?: boolean; // If true, vertices cannot be moved individually. Required for Join.
  groupId?: string; // If set, moves as a rigid body with others in the same group.
}

// Data required to restore a previous state
export interface HistoryEntry {
  polygons: Polygon[];
  selectedPolygonIds: string[];
  selectedEdgeIds: string[]; 
  selectedVertexIds: string[];
}

export interface AlignState {
    step: 'SELECT_SOURCE' | 'SELECT_TARGET' | 'ADJUST';
    sourcePolyId?: string;
    sourceEdgeId?: string;
    targetPolyId?: string;
    targetEdgeId?: string;
    offset: number; // Slide along edge (meters)
    dist: number; // Perpendicular gap (meters)
}

export interface ContextMenuState {
    x: number;
    y: number;
    type: 'CANVAS' | 'POLYGON' | 'EDGE' | 'VERTEX';
    targetId?: string;
}

export interface AppState {
  theme: 'light' | 'dark'; // New theme state
  polygons: Polygon[];
  selectedPolygonIds: string[]; // Replaced single ID with array for multi-select
  selectedEdgeIds: string[]; 
  selectedVertexIds: string[]; 
  openVertexMenuId: string | null; // ID of the vertex with open context menu
  panOffset: Point;
  zoomLevel: number;
  rotation: number; // in radians
  isDragging: boolean;
  solverMsg: { type: 'success' | 'error'; text: string } | null;
  isFocused: boolean;
  
  // Interaction Modes
  isJoinMode: boolean; 
  joinSourceEdgeId: string | null; 
  
  // Alignment Mode (Rotate & Translate)
  alignState: AlignState | null;

  // Context Menu
  contextMenu: ContextMenuState | null;

  // Join Conflict State (Thickness Mismatch)
  joinConflict: {
      sourcePolyId: string;
      targetPolyId: string;
      sourceEdgeId: string;
      targetEdgeId: string;
      sourceThickness: number;
      targetThickness: number;
      initialOffset: number; // Store offset to persist through conflict resolution
  } | null;

  // Drawing Mode
  isDrawingMode: boolean;
  drawingPoints: Point[];
  
  // History Stacks
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export type Action =
  | { type: 'TOGGLE_THEME'; payload: void }
  | { type: 'ADD_POLYGON'; payload: Polygon }
  | { type: 'SELECT_POLYGON'; payload: string | null | { id: string | null; shouldFocus?: boolean; multi?: boolean } }
  | { type: 'SELECT_EDGE'; payload: string | null | { edgeId: string; multi: boolean } }
  | { type: 'SPLIT_EDGE'; payload: string }
  | { type: 'TOGGLE_VERTEX_SELECTION'; payload: string } 
  | { type: 'OPEN_VERTEX_MENU'; payload: string }
  | { type: 'CLOSE_VERTEX_MENU'; payload: void }
  | { type: 'SET_VERTEX_ANGLE'; payload: { vertexId: string; angle: number | undefined } }
  | { type: 'DELETE_VERTEX'; payload: string }
  | { type: 'ADD_DIAGONAL'; payload: void } 
  | { type: 'DELETE_EDGE'; payload: string } 
  | { type: 'UNLINK_EDGE'; payload: string }
  | { type: 'UPDATE_EDGE_LENGTH'; payload: { edgeId: string; length: number } }
  | { type: 'UPDATE_EDGE_THICKNESS'; payload: { edgeId: string; thickness: number } }
  | { type: 'UPDATE_EDGE_ALIGNMENT'; payload: { edgeId: string; offset: number } }
  | { type: 'MOVE_VERTEX'; payload: { vertexId: string; x: number; y: number } }
  | { type: 'MOVE_POLYGON'; payload: { polygonId: string; dx: number; dy: number } }
  | { type: 'ROTATE_POLYGON'; payload: { polygonId: string; rotationDelta: number } }
  | { type: 'RENAME_POLYGON'; payload: { polygonId: string; name: string } }
  | { type: 'RECONSTRUCT_GEOMETRY'; payload: string }
  | { type: 'PAN_ZOOM'; payload: { x: number; y: number; zoom: number; rotation: number } }
  | { type: 'DELETE_POLYGON'; payload: string }
  | { type: 'DISMISS_MESSAGE'; payload: void }
  | { type: 'SHOW_MESSAGE'; payload: { type: 'success' | 'error'; text: string } }
  | { type: 'UNDO'; payload: void }
  | { type: 'REDO'; payload: void }
  | { type: 'CAPTURE_SNAPSHOT'; payload: void }
  | { type: 'START_JOIN_MODE'; payload: string } 
  | { type: 'COMPLETE_JOIN'; payload: string }
  | { type: 'JOIN_SELECTED_EDGES'; payload: void } // New Action
  | { type: 'RESOLVE_JOIN_CONFLICT'; payload: number } // Payload is chosen thickness
  | { type: 'CANCEL_JOIN_CONFLICT'; payload: void }
  | { type: 'START_DRAWING'; payload: void }
  | { type: 'ADD_DRAWING_POINT'; payload: Point }
  | { type: 'UNDO_DRAWING_POINT'; payload: void }
  | { type: 'CANCEL_DRAWING'; payload: void }
  | { type: 'FINISH_DRAWING'; payload: string }
  | { type: 'IMPORT_DATA'; payload: Polygon[] }
  | { type: 'RESET_CANVAS'; payload: void }
  // New Actions
  | { type: 'DUPLICATE_POLYGON'; payload: string | undefined }
  | { type: 'MIRROR_POLYGON'; payload: { axis: 'X' | 'Y' } }
  | { type: 'START_ALIGN_MODE'; payload: void }
  | { type: 'SELECT_ALIGN_EDGE'; payload: string }
  | { type: 'UPDATE_ALIGN_PARAMS'; payload: { offset?: number; dist?: number } }
  | { type: 'CONFIRM_ALIGNMENT'; payload: void }
  | { type: 'CANCEL_ALIGNMENT'; payload: void }
  // Context Menu Actions
  | { type: 'OPEN_CONTEXT_MENU'; payload: ContextMenuState }
  | { type: 'CLOSE_CONTEXT_MENU'; payload: void };
