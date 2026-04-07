import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { VIDEO_PROVIDER, VIDEO_PURPOSE, VIDEO_STATUS } from "../types/types";

export type VideoMediaDocument = VideoMedia & Document;

@Schema({ collection: "videos", timestamps: true })
export class VideoMedia {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    default: VIDEO_PROVIDER.CLOUDFLARE_STREAM,
    enum: Object.values(VIDEO_PROVIDER),
  })
  provider: VIDEO_PROVIDER;

  @Prop({ type: String, required: true, index: true })
  providerUid: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(VIDEO_PURPOSE),
  })
  purpose: VIDEO_PURPOSE;

  @Prop({
    type: String,
    required: true,
    default: VIDEO_STATUS.TEMP,
    enum: Object.values(VIDEO_STATUS),
    index: true,
  })
  status: VIDEO_STATUS;

  @Prop({ type: Types.ObjectId, index: true })
  guideId?: Types.ObjectId;

  @Prop({ type: Date, index: true })
  expiresAt?: Date;

  @Prop({ type: Date, required: false })
  publishedAt?: Date;

  @Prop({ type: Date, required: false })
  orphanedAt?: Date;
}

export const VideoMediaSchema = SchemaFactory.createForClass(VideoMedia);

VideoMediaSchema.index({ status: 1, expiresAt: 1 });
VideoMediaSchema.index({ userId: 1, status: 1 });
