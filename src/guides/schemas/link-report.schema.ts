import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import {
  GuideLinkReportReason,
  GuideLinkReportStatus,
  GuideLinkType,
} from "../types/guides";

export type LinkReportDocument = LinkReport & Document;

@Schema({ timestamps: true })
export class LinkReport {
  @Prop({ type: Types.ObjectId, required: true })
  linkItemId: Types.ObjectId;

  @Prop({ type: String, enum: GuideLinkType, required: true })
  linkType: GuideLinkType;

  @Prop({
    type: Types.ObjectId,
    ref: "Guide",
    required: true,
    index: true,
  })
  guideId: Types.ObjectId;

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
    enum: Object.values(GuideLinkReportReason),
    required: true,
  })
  reason: GuideLinkReportReason;

  @Prop({ default: Date.now, index: true })
  reportedAt: Date;

  @Prop({
    index: true,
    enum: Object.values(GuideLinkReportStatus),
    required: true,
    default: GuideLinkReportStatus.PENDING,
  })
  status: GuideLinkReportStatus;
}

export const LinkReportSchema = SchemaFactory.createForClass(LinkReport);

LinkReportSchema.index({ guideId: 1, linkItemId: 1, status: 1 });
