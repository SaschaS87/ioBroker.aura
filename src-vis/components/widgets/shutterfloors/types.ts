import type { ShutterDeviceDef } from '../shuttershared/types';

export interface ShutterFloorDeviceDef extends ShutterDeviceDef {
    kind: 'fenster' | 'dachfenster' | 'raffstore';
    room?: string;
}

export interface ShutterFloorDef {
    name: string;
    devices: ShutterFloorDeviceDef[];
}
