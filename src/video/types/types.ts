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
