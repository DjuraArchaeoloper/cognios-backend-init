import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { User, UserSchema } from "./schemas/user.schema";
import { WalletController } from "./wallet.controller";
import { CreatorOnboardingController } from "./creator-onboarding.controller";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema, collection: "users" }]),
  ],
  controllers: [AuthController, WalletController, CreatorOnboardingController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
