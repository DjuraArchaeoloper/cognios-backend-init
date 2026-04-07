import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CategoryService } from "./category.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { AdminGuard } from "src/common/guards/admin.guard";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@UseGuards(InternalAuthGuard, AdminGuard)
@Controller("admin/categories")
export class CategoryAdminController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    const category =
      await this.categoryService.createCategory(createCategoryDto);
    return {
      success: true,
      message: "Category created successfully",
      data: category,
    };
  }

  @Patch(":id")
  async updateCategory(
    @Param("id") id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    const category = await this.categoryService.updateCategory(
      id,
      updateCategoryDto,
    );
    return {
      success: true,
      message: "Category updated successfully",
      data: category,
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(@Param("id") id: string) {
    await this.categoryService.deleteCategory(id);
  }
}
