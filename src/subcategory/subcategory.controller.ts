import { Controller, Get, Param, HttpCode, HttpStatus } from "@nestjs/common";
import { SubcategoryService } from "./subcategory.service";

@Controller("subcategories")
export class SubcategoryController {
  constructor(private subcategoryService: SubcategoryService) {}

  @Get("categories/:categoryId")
  @HttpCode(HttpStatus.OK)
  async getSubcategoriesByCategory(@Param("categoryId") categoryId: string) {
    const subcategories =
      await this.subcategoryService.getSubcategoriesByCategory(categoryId);

    return {
      success: true,
      data: subcategories || [],
    };
  }

  @Get("public/:subcategorySlug")
  @HttpCode(HttpStatus.OK)
  async getSubcategoryMetadataBySlug(
    @Param("subcategorySlug") subcategorySlug: string,
  ) {
    const subcategory =
      await this.subcategoryService.getSubcategoryMetadataBySlug(
        subcategorySlug,
      );
    return {
      success: true,
      data: subcategory,
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @HttpCode(HttpStatus.OK)
  @Get(":id/internal")
  async getSubcategoryByIdInternal(@Param("id") id: string) {
    const subcategory =
      await this.subcategoryService.getSubcategoryByIdInternal(id);
    return {
      success: true,
      data: subcategory,
    };
  }
}
