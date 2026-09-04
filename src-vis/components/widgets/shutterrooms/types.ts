export interface ShutterDeviceDef {
    key: string;
    label: string;
    facade?: string;
    badge?: 'raffstore' | 'dachfenster';
    posDp: string;
    invertPosition?: boolean;
    upDp?: string;
    downDp?: string;
    stopDp?: string;
    activityDp?: string;
    slatDp?: string;
}

export interface ShutterRoomDef {
    name: string;
    facade: string;
    devices: ShutterDeviceDef[];
}
