import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type RefundDocument = Refund & Document;

@Schema({ timestamps: true })
export class Refund {
  @Prop({
    type: Types.ObjectId,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
    index: true,
  })
  projectId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  supportRequestId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  marketplaceListingId: string;

  @Prop({
    type: Types.ObjectId,
    required: true,
  })
  purchaseId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
  })
  adminMessage: string;

  @Prop({
    type: Boolean,
  })
  refunded: boolean;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);
