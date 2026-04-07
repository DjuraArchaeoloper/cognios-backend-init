import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HttpModule } from "@nestjs/axios";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";
import { Purchase, PurchaseSchema } from "./schemas/purchase.schema";
import { RefundsModule } from "src/refunds/refunds.module";
import { PurchasesAdminController } from "./purchases.admin.controller";
import {
  SystemSettings,
  SystemSettingsSchema,
} from "./schemas/system-settings";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      {
        name: SystemSettings.name,
        schema: SystemSettingsSchema,
        collection: "system_settings",
      },
    ]),
    HttpModule,
    forwardRef(() => RefundsModule),
  ],
  controllers: [PurchasesController, PurchasesAdminController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
