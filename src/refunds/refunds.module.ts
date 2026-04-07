import { forwardRef, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HttpModule } from "@nestjs/axios";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import { Refund, RefundSchema } from "./schemas/refund.schema";
import { RefundsAdminController } from "./refunds.admin.controller";
import { EmailService } from "./email.service";
import { ConfigModule } from "@nestjs/config";
import { PurchasesModule } from "src/purchases/purchases.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Refund.name, schema: RefundSchema }]),
    HttpModule,
    ConfigModule,
    forwardRef(() => PurchasesModule),
  ],
  controllers: [RefundsController, RefundsAdminController],
  providers: [RefundsService, EmailService],
  exports: [RefundsService],
})
export class RefundsModule {}
