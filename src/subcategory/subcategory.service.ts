import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Subcategory, SubcategoryDocument } from "./schemas/subcategory.schema";
import { CreateSubcategoryDto } from "./dto/create-subcategory.dto";
import { UpdateSubcategoryDto } from "./dto/update-subcategory.dto";
import { CategoryService } from "../category/category.service";
import { MetadataSubcategoryResponse } from "./types/subcategory";

@Injectable()
export class SubcategoryService {
  constructor(
    @InjectModel(Subcategory.name)
    private subcategoryModel: Model<SubcategoryDocument>,
    private categoryService: CategoryService,
  ) {}

  async getSubcategoryMetadataBySlug(
    subcategorySlug: string,
  ): Promise<MetadataSubcategoryResponse | null> {
    const subcategory = await this.subcategoryModel
      .findOne(
        {
          slug: subcategorySlug,
          isActive: true,
        },
        {
          _id: 1,
          name: 1,
          slug: 1,
          categoryId: 1,
          description: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      )
      .lean<MetadataSubcategoryResponse>()
      .exec();

    if (!subcategory)
      throw new NotFoundException(
        `Subcategory with slug ${subcategorySlug} not found`,
      );

    return subcategory;
  }

  async getSubcategoriesByCategory(
    categoryId: string,
  ): Promise<SubcategoryDocument[]> {
    const category =
      await this.categoryService.findByIdForSubcategoryService(categoryId);

    if (!category)
      throw new NotFoundException(`Category with ID ${categoryId} not found`);

    return this.subcategoryModel.find({ categoryId }).sort({ name: 1 }).exec();
  }

  ///
  /// ----------------------------- ADMIN FACING METHODS -----------------------------
  ///

  async createSubcategory(
    dto: CreateSubcategoryDto,
  ): Promise<SubcategoryDocument> {
    const category = await this.categoryService.findByIdForSubcategoryService(
      dto.categoryId,
    );

    if (!category)
      throw new BadRequestException(
        `Category with ID ${dto.categoryId} not found`,
      );

    const existingSubcategory = await this.subcategoryModel.findOne({
      categoryId: dto.categoryId,
      $or: [{ name: dto.name }, { slug: dto.slug }],
    });

    if (existingSubcategory) {
      throw new ConflictException(
        "A subcategory with this name or slug already exists for this category",
      );
    }

    const subcategory = new this.subcategoryModel({
      ...dto,
      isActive: dto.isActive ?? true,
    });

    return subcategory.save();
  }

  async updateSubcategory(
    id: string,
    dto: UpdateSubcategoryDto,
  ): Promise<SubcategoryDocument> {
    const subcategory = await this.subcategoryModel.findById(id).exec();

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    if (dto.name || dto.slug) {
      const existingSubcategory = await this.subcategoryModel.findOne({
        _id: { $ne: id },
        categoryId: subcategory.categoryId,
        $or:
          dto.name && dto.slug
            ? [{ name: dto.name }, { slug: dto.slug }]
            : dto.name
              ? [{ name: dto.name }]
              : [{ slug: dto.slug }],
      });

      if (existingSubcategory) {
        throw new ConflictException(
          "A subcategory with this name or slug already exists for this category",
        );
      }
    }

    if (dto.name !== undefined) subcategory.name = dto.name;
    if (dto.slug !== undefined) subcategory.slug = dto.slug;
    if (dto.description !== undefined)
      subcategory.description = dto.description;
    if (dto.isActive !== undefined) subcategory.isActive = dto.isActive;

    return subcategory.save();
  }

  async deleteSubcategory(id: string): Promise<void> {
    await this.subcategoryModel.findByIdAndDelete(id).exec();
  }

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE METHODS -----------------------------
  ///

  async getSubcategoryByIdInternal(id: string): Promise<SubcategoryDocument> {
    const subcategory = await this.subcategoryModel.findById(id).exec();
    if (!subcategory)
      throw new NotFoundException(`Subcategory with ID ${id} not found`);

    return subcategory;
  }
}
