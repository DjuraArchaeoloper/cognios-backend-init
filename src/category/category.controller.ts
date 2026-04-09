import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CategoryService } from "./category.service";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { AdminGuard } from "src/common/guards/admin.guard";
import { CreateSubcategoryDto } from "src/category/dto/create-subcategory.dto";
import { UpdateSubcategoryDto } from "src/category/dto/update-subcategory.dto";

@Controller("categories")
export class CategoryController {
  constructor(private categoryService: CategoryService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllCategories() {
    const categories = await this.categoryService.getAllCategories();
    return {
      success: true,
      data: categories,
    };
  }

  // ADMIN CATEGORY

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Post("admin")
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

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Patch("admin/:id")
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

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Delete("admin/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(@Param("id") id: string) {
    await this.categoryService.deleteCategory(id);
  }

  // ADMIN SUBCATEGORY

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Post("admin/subcategories/:categoryId")
  @HttpCode(HttpStatus.CREATED)
  async createSubcategory(
    @Param("categoryId") categoryId: string,
    @Body() createSubcategoryDto: CreateSubcategoryDto,
  ) {
    const dto = { ...createSubcategoryDto, categoryId };
    const subcategory = await this.categoryService.createSubcategory(dto);
    return {
      success: true,
      message: "Subcategory created successfully",
      data: subcategory,
    };
  }

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Patch("admin/subcategories/:id")
  @HttpCode(HttpStatus.OK)
  async updateSubcategory(
    @Param("id") id: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    const subcategory = await this.categoryService.updateSubcategory(
      id,
      updateSubcategoryDto,
    );
    return {
      success: true,
      message: "Subcategory updated successfully",
      data: subcategory,
    };
  }

  @UseGuards(InternalAuthGuard, AdminGuard)
  @Delete("admin/subcategories/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubcategory(@Param("id") id: string) {
    await this.categoryService.deleteSubcategory(id);
  }

  @Get("subcategories/:categoryId")
  @HttpCode(HttpStatus.OK)
  async getSubcategoriesByCategory(@Param("categoryId") categoryId: string) {
    const subcategories =
      await this.categoryService.getSubcategoriesByCategory(categoryId);

    return {
      success: true,
      data: subcategories || [],
    };
  }
}
