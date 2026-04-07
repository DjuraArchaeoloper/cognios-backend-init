import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { DIFFICULTY, PROJECT_STATUS } from "../types/projects";

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true })
export class Literature {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: false })
  link?: string;

  @Prop({ type: Boolean, required: false, default: false })
  isLinkDisabled: boolean;
}

@Schema({ timestamps: true })
export class Media {
  @Prop({ type: String, required: false })
  previewVideo?: string;

  @Prop({ type: String, required: false })
  mainVideo?: string;

  @Prop({ type: String, required: false })
  thumbnailId?: string;

  @Prop({ type: String, required: false })
  guideFile?: string;

  @Prop({ type: [String], required: false })
  images?: string[];
}

export const LiteratureSubSchema = SchemaFactory.createForClass(Literature);
export const MediaSubSchema = SchemaFactory.createForClass(Media);

@Schema({ timestamps: true })
export class Project {
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
  creatorId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  creatorWallet: string;

  @Prop({
    type: Types.ObjectId,
    ref: "Category",
    required: true,
    index: true,
  })
  category: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: "Subcategory",
    required: true,
    index: true,
  })
  subcategory: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PROJECT_STATUS),
    default: PROJECT_STATUS.DRAFT,
  })
  status: PROJECT_STATUS;

  @Prop({ type: Number, required: true })
  price: number;

  @Prop({
    type: MediaSubSchema,
    required: true,
  })
  media: Media;

  @Prop({
    type: [LiteratureSubSchema],
    required: true,
  })
  literature: Literature[];

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

  @Prop({ type: String, required: true, index: true })
  contentLanguage: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  slug: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ title: "text", description: "text" });
