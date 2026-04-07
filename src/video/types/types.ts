export enum VIDEO_PROVIDER {
  CLOUDFLARE_STREAM = "cloudflare-stream",
  CLOUDFLARE_R2 = "cloudflare-r2",
}

export enum VIDEO_PURPOSE {
  GUIDE_MAIN_VIDEO = "guide-main-video",
  GUIDE_PREVIEW_VIDEO = "guide-preview-video",
}

export enum VIDEO_STATUS {
  TEMP = "temp",
  PUBLISHED = "published",
  ORPHANED = "orphaned",
}
