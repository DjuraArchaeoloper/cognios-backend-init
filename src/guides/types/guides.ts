import { Types } from "mongoose";

export enum GuideLinkType {
  TOOL = "tool",
  MATERIAL = "material",
}

export enum GuideReportStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

export enum GuideReportReason {
  DANGEROUS = "dangerous",
  COPYRIGHT = "copyright",
  SCAM = "scam",
  EXPLICIT = "explicit",
  MISLEADING = "misleading",
  OTHER = "other",
}

export enum GuideLinkReportStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

export enum GuideLinkReportReason {
  SCAM = "scam",
  MALWARE = "malware",
  OTHER = "other",
}

export enum VIDEO_ASSET_ROLE {
  MAIN_VIDEO = "main_video",
  PREVIEW_VIDEO = "preview_video",
}

export enum VIDEO_ASSET_SOURCE {
  AUTO_GENERATED = "auto_generated",
  UPLOADED = "uploaded",
}

export enum VIDEO_ASSET_PROVIDER {
  CLOUDFLARE_STREAM = "cloudflare_stream",
}

export enum FILE_ASSET_ROLE {
  PDF = "guide_pdf",
}

export enum FILE_ASSET_SOURCE {
  AUTO_GENERATED = "auto_generated",
  UPLOADED = "uploaded",
}

export enum FILE_ASSET_PROVIDER {
  CLOUDFLARE_R2 = "cloudflare_r2",
}

export enum VISIBILITY_TYPE {
  INVITE_ONLY = "invite_only",
  PUBLIC = "public",
  FEATURED = "featured",
}

export enum MONETIZATION_TYPE {
  SUBSCRIPTION = "subscription",
  ONE_OFF = "one_off",
  HYBRID = "hybrid",
}

export enum GUIDE_TYPE {
  VIDEO = "video",
  STEP_BY_STEP = "step_by_step",
}

export enum GUIDE_STATUS {
  DRAFT = "draft",
  PUBLISHED = "published",
  ARCHIVED = "archived",
  FLAGGED = "flagged",
  DELETED = "deleted",
}

export enum DIFFICULTY {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum CURRENCY {
  EUR = "EUR",
}

export enum ACCESS_LEVEL {
  NONE = "none",
  PREVIEW = "preview",
  FULL = "full",
  OWNER = "owner",
}

export interface VideoAsset {
  streamId: string;
  role: VIDEO_ASSET_ROLE;
  source: VIDEO_ASSET_SOURCE;
  displayName: string;
}

export interface FileAsset {
  fileKey: string;
  role: FILE_ASSET_ROLE;
  source: FILE_ASSET_SOURCE;
  displayName: string;
  mimeType: string;
  fileSize: number;
}

export type CategoryRef = { _id: string; name?: string; slug?: string };
export type SubcategoryRef = { _id: string; name?: string; slug?: string };
export interface MainCreatorSnapshot {
  _id: Types.ObjectId;
  username: string;
  avatarUrl?: string;
}

export type ToolOrMaterial = {
  name: string;
  link?: string;
};

export interface Media {
  previewVideo?: VideoAsset;
  mainVideo?: VideoAsset;
  thumbnailId?: string;
  guideFile?: FileAsset;
  images?: string[];
}

export interface GuideInterface {
  _id: string;
  title: string;
  description: string;
  mainCreator: string;
  mainCreatorSnapshot: MainCreatorSnapshot;
  category: CategoryRef;
  subcategories?: SubcategoryRef[];
  tags?: string[];
  visibility: VISIBILITY_TYPE;
  monetizationType: MONETIZATION_TYPE;
  status: GUIDE_STATUS;
  price: number;
  media: Media;
  guideType: GUIDE_TYPE;
  tools: ToolOrMaterial[];
  materials: ToolOrMaterial[];
  safetyNotes?: string;
  difficulty: DIFFICULTY;
  estimatedDurationMinutes: number;
  purchaseCount: number;
  refundRate: number;
  flaggedReason: string;
  publishedAt: string;
  unpublishedAt: string;
  archivedAt: string;
  unarchivedAt: string;
  createdAt: Date;
  updatedAt: Date;
  contentLanguage: string;
  slug: string;
  currency: CURRENCY;
}

export type AccessLevel = ACCESS_LEVEL;

export interface GuideAccess {
  level: AccessLevel;
  canWatch: boolean;
  canDownloadPdf: boolean;
  isRefundable?: boolean;
  isOwner: boolean;
  isPurchasable: boolean;
}

export interface SignedAssets {
  videoToken?: string;
  // pdfUrl?: string;
}

export type GuideMediaResponse = {
  thumbnailId?: string;
  images?: string[];
  video?: {
    playbackUrl: string;
    requiresToken: boolean;
  };
  hasPdf: boolean;
};

export interface GuideResponse {
  guide: PublicGuideResponse;
  access: GuideAccess;
  signedAssets?: SignedAssets;
}

export interface CreatorGuideResponse {
  guide: GuideInterface;
  access: GuideAccess;
  signedAssets?: SignedAssets;
}

export type PublicGuideResponse = {
  _id: string;
  title: string;
  description: string;
  difficulty: DIFFICULTY;
  estimatedDurationMinutes: number;
  contentLanguage: string;
  price: number;
  monetizationType: MONETIZATION_TYPE;
  visibility: VISIBILITY_TYPE;
  status: GUIDE_STATUS;
  tags?: string[];
  category: CategoryRef;
  subcategories?: SubcategoryRef[];
  mainCreator: string;
  mainCreatorSnapshot: MainCreatorSnapshot;
  tools: ToolOrMaterial[];
  materials: ToolOrMaterial[];
  safetyNotes?: string;
  guideType: GUIDE_TYPE;
  media: GuideMediaResponse;
  createdAt: Date;
  updatedAt: Date;
  slug: string;
  currency: CURRENCY;
  purchaseCount: number;
  publishedAt: Date;
};

export type MetadataGuideResponse = {
  _id: string;
  title: string;
  description: string;
  category: CategoryRef;
  slug: string;
  media: Partial<Media>;
  visibility: VISIBILITY_TYPE;
  estimatedDurationMinutes: number;
  mainCreatorSnapshot: MainCreatorSnapshot;
  contentLanguage: string;
  safetyNotes?: string;
  price: number;
  currency: CURRENCY;
  createdAt: Date;
};

export type PurchaseGuideResponse = {
  _id: string;
  price: number;
  visibility: VISIBILITY_TYPE;
  mainCreator: string;
  currency: CURRENCY;
  title: string;
  slug: string;
  media: {
    thumbnailId: string;
    guideFile?: {
      fileKey: string;
    };
  };
};
