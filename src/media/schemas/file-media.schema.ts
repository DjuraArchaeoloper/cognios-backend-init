import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { FILE_PROVIDER, FILE_PURPOSE, FILE_STATUS } from "../types/types";

export type FileMediaDocument = FileMedia & Document;

@Schema({ collection: "files", timestamps: true })
export class FileMedia {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    default: FILE_PROVIDER.CLOUDFLARE_R2,
    enum: Object.values(FILE_PROVIDER),
  })
  provider: FILE_PROVIDER;

  @Prop({ type: String, required: true, index: true })
  providerUid: string;

  @Prop({
    type: String,
    required: true,
    enum: Object.values(FILE_PURPOSE),
    default: FILE_PURPOSE.PROJECT_PDF,
  })
  purpose: FILE_PURPOSE;

  @Prop({
    type: String,
    required: true,
    default: FILE_STATUS.TEMP,
    enum: Object.values(FILE_STATUS),
    index: true,
  })
  status: FILE_STATUS;

  @Prop({ type: Types.ObjectId, index: true })
  projectId?: Types.ObjectId;
}

export const FileMediaSchema = SchemaFactory.createForClass(FileMedia);

FileMediaSchema.index({ userId: 1, status: 1 });
