/** A task on the workspace task board. */
export interface Task {
  id: string;
  title: string;
  details?: string;
  done: boolean;
}

/** A file entry in the workspace file explorer. */
export interface FileEntry {
  path: string;
  name: string;
  type: string; // file, directory, image, pdf, code, text
  size: string;
  preview?: string;
}

/** An event in the activity feed. */
export interface ActivityEvent {
  id: string;
  timestamp: number;
  type: "tool" | "file" | "system" | "cost";
  title: string;
  detail?: string;
}
