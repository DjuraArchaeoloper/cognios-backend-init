import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import {
  ProjectLinkReportReason,
  ProjectLinkReportStatus,
  ProjectLinkType,
} from "../types/projects";

export type LinkReportDocument = LinkReport & Document;

@Schema({ timestamps: true })
export class LinkReport {
  @Prop({ type: Types.ObjectId, required: true })
  linkItemId: Types.ObjectId;

  @Prop({ type: String, enum: ProjectLinkType, required: true })
  linkType: ProjectLinkType;

  @Prop({
    type: Types.ObjectId,
    ref: "Project",
    required: true,
    index: true,
  })
  projectId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  link: string;

  @Prop({
    type: String,
    enum: Object.values(ProjectLinkReportReason),
    required: true,
  })
  reason: ProjectLinkReportReason;

  @Prop({ default: Date.now, index: true })
  reportedAt: Date;

  @Prop({
    index: true,
    enum: Object.values(ProjectLinkReportStatus),
    required: true,
    default: ProjectLinkReportStatus.PENDING,
  })
  status: ProjectLinkReportStatus;
}

export const LinkReportSchema = SchemaFactory.createForClass(LinkReport);

LinkReportSchema.index({ projectId: 1, linkItemId: 1, status: 1 });
