export type TripoTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "banned"
  | "expired"
  | "cancelled"
  | "unknown";

export interface TripoTask {
  taskId: string;
  status: TripoTaskStatus;
  progress: number;
  modelUrl?: string;
  error?: string;
}

export interface TripoClient {
  uploadImage(buf: Buffer, filename: string): Promise<{ fileToken: string }>;
  createImageToModelTask(input: {
    fileToken: string;
    faceLimit: number;
    modelVersion: string;
    fileType?: "jpg" | "png" | "webp";
    smartLowPoly?: boolean;
  }): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<TripoTask>;
}
