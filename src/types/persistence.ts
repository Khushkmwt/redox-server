export type SnapshotEntry =
  | {
      key: string;
      type: "string";
      value: string;
      ttlMsRemaining?: number;
    }
  | {
      key: string;
      type: "hash";
      fields: Record<string, string>;
      ttlMsRemaining?: number;
    }
  | {
      key: string;
      type: "list";
      elements: string[];
      ttlMsRemaining?: number;
    }
  | {
      key: string;
      type: "set";
      members: string[];
      ttlMsRemaining?: number;
    };

export interface SnapshotData {
  version: number;
  savedAt: number;
  entries: SnapshotEntry[];
}

export interface SnapshotSaveResult {
  keyCount: number;
  bytes: number;
}

export interface SnapshotRestoreResult {
  restoredCount: number;
  elapsedMs: number;
}
