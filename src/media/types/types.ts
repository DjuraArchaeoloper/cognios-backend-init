export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}

// VIDEO
export enum VIDEO_PROVIDER {
  CLOUDFLARE_STREAM = "cloudflare-stream",
  CLOUDFLARE_R2 = "cloudflare-r2",
}

export enum VIDEO_PURPOSE {
  PROJECT_MAIN_VIDEO = "project-main-video",
  PROJECT_PREVIEW_VIDEO = "project-preview-video",
}

export enum VIDEO_STATUS {
  TEMP = "temp",
  PUBLISHED = "published",
  ORPHANED = "orphaned",
}

// IMAGE
export enum IMAGE_PURPOSE {
  PROJECT_IMAGE = "project-image",
  PROFILE_AVATAR = "profile-avatar",
  CATEGORY_ICON = "category-icon",
}

export enum IMAGE_STATUS {
  TEMP = "temp",
  PUBLISHED = "published",
  ORPHANED = "orphaned",
}

export enum IMAGE_PROVIDER {
  CLOUDFLARE_R2 = "cloudflare-r2",
}

export interface ImageUploadOptions {
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "jpeg" | "png" | "webp";
}

export interface ImageUploadResult {
  url: string;
  fileKey: string;
  width: number;
  height: number;
  size: number;
  fileId: string;
}

// FILE
export enum FILE_PURPOSE {
  PROJECT_PDF = "project-pdf",
}

export enum FILE_STATUS {
  TEMP = "temp",
  PUBLISHED = "published",
  ORPHANED = "orphaned",
}

export enum FILE_PROVIDER {
  CLOUDFLARE_R2 = "cloudflare-r2",
}

export interface FileUploadOptions {
  folder?: string;
  maxSize?: number;
}

export interface FileUploadResult {
  fileKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
