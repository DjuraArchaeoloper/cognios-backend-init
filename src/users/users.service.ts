import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { RoleName } from "src/auth/auth.types";
import { User } from "src/auth/schemas/user.schema";

export interface PublicUserDto {
  id: string;
  email?: string;
  emailVerified: boolean;
  role: RoleName;
  username?: string;
  avatarUrl?: string;
  bio?: string;
  accountStatus: string;
  walletAddress?: string;
  walletVerified: boolean;
  onboardingCompleted: boolean;
  creatorAgreementAccepted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private parseObjectId(id: string): Types.ObjectId | null {
    try {
      return new Types.ObjectId(id.trim());
    } catch {
      return null;
    }
  }

  private toPublicUserDto(user: User & { _id: Types.ObjectId }): PublicUserDto {
    return {
      id: String(user._id),
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      accountStatus: user.accountStatus,
      walletAddress: user.walletAddress,
      walletVerified: user.walletVerified,
      onboardingCompleted: user.onboardingCompleted,
      creatorAgreementAccepted: user.creatorAgreementAccepted,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getUserById(userId: string): Promise<PublicUserDto | null> {
    const oid = this.parseObjectId(userId);
    if (!oid) return null;

    const user = await this.userModel.findById(oid).lean().exec();
    if (!user) return null;

    return this.toPublicUserDto(user as User & { _id: Types.ObjectId });
  }
}
