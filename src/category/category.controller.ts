import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CategoryService } from "./category.service";
import { ServiceToServiceGuard } from "src/common/guards/service.guard";

@Controller("categories")
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get("public/:slug")
  @HttpCode(HttpStatus.OK)
  async getCategoryMetadataBySlug(@Param("slug") slug: string) {
    const category = await this.categoryService.getCategoryMetadataBySlug(slug);
    return {
      success: true,
      data: category,
    };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllCategories() {
    const categories = await this.categoryService.getAllCategories();
    return {
      success: true,
      data: categories,
    };
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

  @UseGuards(ServiceToServiceGuard)
  @HttpCode(HttpStatus.OK)
  @Get(":id/internal")
  async getCategoryByIdInternal(@Param("id") id: string) {
    const category = await this.categoryService.getCategoryByIdInternal(id);
    return {
      success: true,
      data: category,
    };
  }
}
