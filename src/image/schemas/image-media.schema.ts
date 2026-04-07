import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { IMAGE_PROVIDER, IMAGE_PURPOSE, IMAGE_STATUS } from "../types/types";

export type ImageMediaDocument = ImageMedia & Document;

@Schema({ collection: "images", timestamps: true })
export class ImageMedia {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    default: IMAGE_PROVIDER.CLOUDFLARE_R2,
    enum: Object.values(IMAGE_PROVIDER),
  })
  provider: IMAGE_PROVIDER;

  @Prop({ type: String, required: true, index: true })
  providerUid: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(IMAGE_PURPOSE),
  })
  purpose: IMAGE_PURPOSE;

  @Prop({
    type: String,
    required: true,
    default: IMAGE_STATUS.TEMP,
    enum: Object.values(IMAGE_STATUS),
    index: true,
  })
  status: IMAGE_STATUS;

  @Prop({ type: Types.ObjectId, index: true })
  projectId?: Types.ObjectId;

  @Prop({ type: Date, index: true })
  expiresAt?: Date;

  @Prop({ type: Date, required: false })
  publishedAt?: Date;

  @Prop({ type: Date, required: false })
  orphanedAt?: Date;
}

export const ImageMediaSchema = SchemaFactory.createForClass(ImageMedia);

ImageMediaSchema.index({ status: 1, expiresAt: 1 });
ImageMediaSchema.index({ userId: 1, status: 1 });
ImageMediaSchema.index({ userId: 1, purpose: 1 });
