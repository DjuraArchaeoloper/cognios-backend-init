import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { GuideReportReason, GuideReportStatus } from "../types/guides";

export type GuideReportDocument = GuideReport & Document;

@Schema({ timestamps: true })
export class GuideReport {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: "Guide",
    required: true,
    index: true,
  })
  guideId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: false,
    default: null,
    index: true,
  })
  userId: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: String,
    enum: Object.values(GuideReportReason),
    required: true,
  })
  reason: GuideReportReason;

  @Prop({ required: false })
  message?: string;

  @Prop({ default: Date.now, index: true })
  reportedAt: Date;

  @Prop({
    index: true,
    enum: Object.values(GuideReportStatus),
    required: true,
    default: GuideReportStatus.PENDING,
  })
  status: GuideReportStatus;
}

export const GuideReportSchema = SchemaFactory.createForClass(GuideReport);

GuideReportSchema.index({ guideId: 1, status: 1 });
