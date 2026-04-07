import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SubcategoryController } from "./subcategory.controller";
import { SubcategoryService } from "./subcategory.service";
import { Subcategory, SubcategorySchema } from "./schemas/subcategory.schema";
import { CategoryModule } from "../category/category.module";
import { SubcategoryAdminController } from "./subcategory.admin.controller";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subcategory.name, schema: SubcategorySchema },
    ]),
    CategoryModule,
  ],
  controllers: [SubcategoryController, SubcategoryAdminController],
  providers: [SubcategoryService],
  exports: [SubcategoryService],
})
export class SubcategoryModule {}
