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
import { AdminGuard } from "src/common/guards/admin.guard";
import { InternalAuthGuard } from "src/common/guards/auth.guard";
import { SubcategoryService } from "./subcategory.service";
import { CreateSubcategoryDto } from "./dto/create-subcategory.dto";
import { UpdateSubcategoryDto } from "./dto/update-subcategory.dto";

@UseGuards(InternalAuthGuard, AdminGuard)
@Controller("admin/subcategories")
export class SubcategoryAdminController {
  constructor(private readonly subcategoryService: SubcategoryService) {}

  @Post(":categoryId")
  @HttpCode(HttpStatus.CREATED)
  async createSubcategory(
    @Param("categoryId") categoryId: string,
    @Body() createSubcategoryDto: CreateSubcategoryDto,
  ) {
    const dto = { ...createSubcategoryDto, categoryId };
    const subcategory = await this.subcategoryService.createSubcategory(dto);
    return {
      success: true,
      message: "Subcategory created successfully",
      data: subcategory,
    };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateSubcategory(
    @Param("id") id: string,
    @Body() updateSubcategoryDto: UpdateSubcategoryDto,
  ) {
    const subcategory = await this.subcategoryService.updateSubcategory(
      id,
      updateSubcategoryDto,
    );
    return {
      success: true,
      message: "Subcategory updated successfully",
      data: subcategory,
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSubcategory(@Param("id") id: string) {
    await this.subcategoryService.deleteSubcategory(id);
  }
}
