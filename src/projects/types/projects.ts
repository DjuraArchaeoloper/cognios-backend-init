import { Types } from "mongoose";

export interface ProjectInterface {
  _id: Types.ObjectId;
  title: string;
  description: string;
  creatorId: Types.ObjectId;
  creatorWallet: string;
  category: Types.ObjectId;
  subcategory: Types.ObjectId;
  projectType: PROJECT_TYPE;
  status: PROJECT_STATUS;
  price: number;
  media: Media;
  literature: Literature[];
  difficulty: DIFFICULTY;
  estimatedDurationMinutes: number;
  purchaseCount: number;
  refundRate: number;
  flaggedReason: string;
  createdAt: Date;
  updatedAt: Date;
  contentLanguage: string;
  slug: string;
}

export enum PROJECT_STATUS {
  DRAFT = "draft",
  PUBLISHED = "published",
  FLAGGED = "flagged",
  DELETED = "deleted",
}

export enum PROJECT_TYPE {
  VIDEO = "video",
}

export interface Media {
  previewVideo?: Asset;
  mainVideo?: Asset;
  thumbnailId?: string;
  projectFile?: Asset;
  images?: string[];
}

export interface Asset {
  fileKey: string;
  displayName: string;
}

export type Literature = {
  name: string;
  link?: string;
};

export enum DIFFICULTY {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum ProjectLinkType {
  LITERATURE = "literature",
}

export enum ProjectReportReason {
  DANGEROUS = "dangerous",
  COPYRIGHT = "copyright",
  SCAM = "scam",
  EXPLICIT = "explicit",
  MISLEADING = "misleading",
  OTHER = "other",
}

export enum ProjectReportStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
}

export interface ProjectResponse {
  project: Partial<ProjectInterface>;
  access: ProjectAccess;
  signedAssets?: SignedAssets;
}

export enum ACCESS_LEVEL {
  NONE = "none",
  PREVIEW = "preview",
  FULL = "full",
  OWNER = "owner",
}
export interface ProjectAccess {
  level: ACCESS_LEVEL;
  canWatch: boolean;
  canDownloadPdf: boolean;
  isRefundable?: boolean;
  isOwner: boolean;
  isPurchasable: boolean;
}

export interface SignedAssets {
  videoToken?: string;
}
