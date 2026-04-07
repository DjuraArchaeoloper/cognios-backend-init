import { Types } from "mongoose";

export interface ProjectInterface {
  _id: Types.ObjectId;
  title: string;
  description: string;
  creatorId: Types.ObjectId;
  creatorWallet: string;
  category: Types.ObjectId;
  subcategory: Types.ObjectId;
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

export interface Media {
  previewVideo?: Asset;
  mainVideo?: Asset;
  thumbnailId?: string;
  guideFile?: Asset;
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

export enum ProjectLinkReportReason {
  INAPPROPRIATE = "inappropriate",
  SPAM = "spam",
  OTHER = "other",
}

export enum ProjectLinkReportStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
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
