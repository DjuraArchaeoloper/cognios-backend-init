import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Schema as MongooseSchema } from "mongoose";
import { InternalPurchaseStatus } from "./../types/types";

export type PurchaseDocument = Purchase & Document;

@Schema({ timestamps: true })
export class Purchase {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  guideId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    required: true,
    index: true,
  })
  creatorId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: String,
    enum: InternalPurchaseStatus,
    default: InternalPurchaseStatus.PENDING,
    index: true,
  })
  internalStatus: InternalPurchaseStatus;

  @Prop()
  stripeChargeId?: string;

  @Prop()
  priceAtPurchase?: number;

  @Prop()
  currency?: string;

  @Prop()
  creatorStripeAccountId?: string;

  @Prop()
  platformFeeAmount?: number;

  @Prop()
  creatorEarningsAmount?: number;

  @Prop()
  platformFeePercentage: number;

  @Prop()
  refundedAt?: Date;

  @Prop()
  refundableUntil: Date;

  @Prop()
  refunded: boolean;

  @Prop()
  refundReason?: string;

  @Prop()
  pdfAvailable: boolean;

  @Prop()
  pdfAccessed?: boolean;

  @Prop()
  pdfAccessedAt?: Date;

  @Prop()
  videoPlaybackInitiatedAt?: Date;

  @Prop()
  videoPlaybackUrl?: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt?: Date;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);

PurchaseSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      stripePaymentIntentId: { $exists: true },
    },
  },
);

PurchaseSchema.index(
  { userId: 1, guideId: 1 },
  {
    unique: true,
    partialFilterExpression: { refunded: false },
  },
);
