import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema, Types } from "mongoose";
import {
  DIFFICULTY,
  GUIDE_STATUS,
  GUIDE_TYPE,
  MONETIZATION_TYPE,
  VISIBILITY_TYPE,
  CURRENCY,
  VIDEO_ASSET_ROLE,
  VIDEO_ASSET_SOURCE,
  VIDEO_ASSET_PROVIDER,
  FILE_ASSET_PROVIDER,
  FILE_ASSET_ROLE,
  FILE_ASSET_SOURCE,
} from "../types/guides";

export type GuideDocument = Guide & Document;

@Schema({ timestamps: true })
export class ToolMaterial {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: false })
  link?: string;

  @Prop({ type: Boolean, required: false, default: false })
  isLinkDisabled: boolean;
}

export const ToolMaterialSubSchema = SchemaFactory.createForClass(ToolMaterial);

@Schema({ _id: false, timestamps: true })
export class MainCreatorSnapshotSchema {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ type: String, required: true })
  username: string;

  @Prop({ type: String, required: false })
  avatarUrl?: string;
}

export class VideoAssetSchema {
  @Prop({ required: true })
  streamId: string;

  @Prop({
    required: true,
    enum: Object.values(VIDEO_ASSET_PROVIDER),
    default: VIDEO_ASSET_PROVIDER.CLOUDFLARE_STREAM,
  })
  provider: VIDEO_ASSET_PROVIDER;

  @Prop({ required: true, enum: Object.values(VIDEO_ASSET_ROLE) })
  role: VIDEO_ASSET_ROLE;

  @Prop({ required: true, enum: Object.values(VIDEO_ASSET_SOURCE) })
  source: VIDEO_ASSET_SOURCE;

  @Prop({ required: true })
  displayName: string;
}

export class FileAssetSchema {
  @Prop({ required: true })
  fileKey: string;

  @Prop({
    required: true,
    enum: Object.values(FILE_ASSET_PROVIDER),
    default: FILE_ASSET_PROVIDER.CLOUDFLARE_R2,
  })
  provider: FILE_ASSET_PROVIDER;

  @Prop({ required: true, enum: Object.values(FILE_ASSET_ROLE) })
  role: FILE_ASSET_ROLE;

  @Prop({ required: true, enum: Object.values(FILE_ASSET_SOURCE) })
  source: FILE_ASSET_SOURCE;

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  fileSize: number;
}

@Schema({ _id: false })
export class MediaSchema {
  @Prop()
  previewVideo?: VideoAssetSchema;

  @Prop()
  mainVideo?: VideoAssetSchema;

  @Prop()
  thumbnailId?: string;

  @Prop()
  guideFile?: FileAssetSchema;

  @Prop({ type: [String], default: [] })
  images?: string[];
}

@Schema({ timestamps: true })
export class Guide {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({
    type: Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  })
  mainCreator: Types.ObjectId;

  @Prop({
    type: MainCreatorSnapshotSchema,
    required: true,
  })
  mainCreatorSnapshot: MainCreatorSnapshotSchema;

  @Prop({
    type: Types.ObjectId,
    ref: "Category",
    required: true,
    index: true,
  })
  category: Types.ObjectId;

  @Prop({
    type: [Types.ObjectId],
    ref: "Subcategory",
    default: [],
    index: true,
  })
  subcategories?: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  tags?: string[];

  @Prop({
    type: String,
    enum: Object.values(VISIBILITY_TYPE),
    default: VISIBILITY_TYPE.INVITE_ONLY,
  })
  visibility: VISIBILITY_TYPE;

  @Prop({ type: Date })
  visibilityChangedAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(MONETIZATION_TYPE),
    default: MONETIZATION_TYPE.ONE_OFF,
  })
  monetizationType: MONETIZATION_TYPE;

  @Prop({
    type: String,
    enum: Object.values(GUIDE_STATUS),
    default: GUIDE_STATUS.DRAFT,
  })
  status: GUIDE_STATUS;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({
    type: String,
    enum: Object.values(CURRENCY),
    default: CURRENCY.EUR,
    required: true,
  })
  currency: CURRENCY;

  @Prop({
    type: MediaSchema,
    required: true,
  })
  media: MediaSchema;

  @Prop({
    type: String,
    enum: Object.values(GUIDE_TYPE),
    default: GUIDE_TYPE.VIDEO,
  })
  guideType: GUIDE_TYPE;

  @Prop({ type: String, required: true })
  contentLanguage: string;

  @Prop({
    type: [ToolMaterialSubSchema],
    default: [],
  })
  tools?: ToolMaterial[];

  @Prop({
    type: [ToolMaterialSubSchema],
    default: [],
  })
  materials?: ToolMaterial[];

  @Prop({ type: String })
  safetyNotes?: string;

  @Prop({
    type: String,
    enum: Object.values(DIFFICULTY),
    default: DIFFICULTY.BEGINNER,
  })
  difficulty?: DIFFICULTY;

  @Prop({ type: Number, default: 0 })
  estimatedDurationMinutes: number;

  @Prop({ type: Number, default: 0 })
  purchaseCount?: number;

  @Prop({ type: Number, default: 0 })
  refundRate?: number;

  @Prop({ type: String })
  flaggedReason?: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  slug: string;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Date })
  unpublishedAt?: Date;

  @Prop({ type: Date })
  archivedAt?: Date;

  @Prop({ type: Date })
  unarchivedAt?: Date;

  @Prop({ type: Date })
  lastEditedAt?: Date;
}

export const GuideSchema = SchemaFactory.createForClass(Guide);

GuideSchema.index({ visibility: 1, category: 1 });
GuideSchema.index({ title: "text", description: "text", tags: "text" });
