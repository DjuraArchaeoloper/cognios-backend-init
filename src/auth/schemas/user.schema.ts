import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";
import { AccountStatus, RoleName } from "../auth.types";

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: "users", timestamps: false })
export class User {
  @Prop({ required: false, lowercase: true, trim: true })
  email?: string;

  @Prop({ required: true, default: false })
  emailVerified!: boolean;

  @Prop({ required: true, enum: Object.values(RoleName) })
  role!: RoleName;

  @Prop({ required: false, trim: true })
  username?: string;

  @Prop({ required: false, trim: true })
  avatarUrl?: string;

  @Prop({ required: false, trim: true })
  bio?: string;

  @Prop({
    required: true,
    enum: Object.values(AccountStatus),
    default: AccountStatus.ACTIVE,
  })
  accountStatus!: AccountStatus;

  @Prop({ required: false, trim: true })
  walletAddress?: string;

  @Prop({ required: true, default: false })
  walletVerified!: boolean;

  @Prop({ required: true, default: false })
  onboardingCompleted!: boolean;

  @Prop({ required: false })
  onboardingCompletedAt?: Date;

  @Prop({ required: false })
  lastLoginAt?: Date;

  @Prop({ required: false })
  lastSeenAt?: Date;

  @Prop({ required: true, default: false })
  creatorAgreementAccepted!: boolean;

  @Prop({ required: false })
  creatorAgreementAcceptedAt?: Date;

  @Prop({ required: true, default: Date.now })
  createdAt!: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ walletAddress: 1 }, { unique: true, sparse: true });
UserSchema.index({ username: 1 }, { unique: true, sparse: true });
