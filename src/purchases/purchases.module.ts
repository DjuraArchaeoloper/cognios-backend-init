import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HttpModule } from "@nestjs/axios";
import { PurchasesController } from "./purchases.controller";
import { PurchasesService } from "./purchases.service";
import { Purchase, PurchaseSchema } from "./schemas/purchase.schema";
import {
  MarketplaceListing,
  MarketplaceListingSchema,
} from "./schemas/marketplace-listing.schema";
import { RefundsModule } from "src/refunds/refunds.module";
import { Project, ProjectSchema } from "src/projects/schemas/project.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: MarketplaceListing.name, schema: MarketplaceListingSchema },
      { name: Project.name, schema: ProjectSchema },
    ]),
    HttpModule,
    forwardRef(() => RefundsModule),
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
