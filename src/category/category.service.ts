import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Category, CategoryDocument } from "./schemas/category.schema";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { CreateSubcategoryDto } from "src/category/dto/create-subcategory.dto";
import {
  Subcategory,
  SubcategoryDocument,
} from "src/category/schemas/subcategory.schema";
import { UpdateSubcategoryDto } from "./dto/update-subcategory.dto";

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private categoryModel: Model<CategoryDocument>,
    @InjectModel(Subcategory.name)
    private subcategoryModel: Model<SubcategoryDocument>,
  ) {}

  async getAllCategories(): Promise<CategoryDocument[]> {
    return this.categoryModel.find().sort({ isActive: -1 }).exec();
  }

  // ADMIN CATEGORY

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDocument> {
    const existingCategory = await this.categoryModel.findOne({
      $or: [{ name: dto.name }, { slug: dto.slug }],
    });

    if (existingCategory) {
      throw new ConflictException(
        "A category with this name or slug already exists",
      );
    }

    const category = new this.categoryModel({
      ...dto,
      isActive: dto.isActive ?? true,
      keywords: dto.keywords ?? [],
    });

    return category.save();
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    if (dto.name || dto.slug) {
      const existingCategory = await this.categoryModel.findOne({
        _id: { $ne: id },
        $or:
          dto.name && dto.slug
            ? [{ name: dto.name }, { slug: dto.slug }]
            : dto.name
              ? [{ name: dto.name }]
              : [{ slug: dto.slug }],
      });

      if (existingCategory) {
        throw new ConflictException(
          "A category with this name or slug already exists",
        );
      }
    }

    if (dto.name !== undefined) category.name = dto.name;
    if (dto.slug !== undefined) category.slug = dto.slug;
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.keywords !== undefined) category.keywords = dto.keywords;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return category.save();
  }

  async deleteCategory(id: string): Promise<void> {
    await this.categoryModel.findByIdAndDelete(id).exec();
  }

  // ADMIN SUBCATEGORY

  async createSubcategory(
    dto: CreateSubcategoryDto,
  ): Promise<SubcategoryDocument> {
    const category = await this.findByIdForSubcategoryService(dto.categoryId);

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

  async getCategoryByIdInternal(id: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();

    if (!category)
      throw new NotFoundException(`Category with ID ${id} not found`);

    return category;
  }

  async findByIdForSubcategoryService(
    id: string,
  ): Promise<CategoryDocument | null> {
    return this.categoryModel.findById(id).exec();
  }

  async getSubcategoryByIdInternal(id: string): Promise<SubcategoryDocument> {
    const subcategory = await this.subcategoryModel.findById(id).exec();
    if (!subcategory)
      throw new NotFoundException(`Subcategory with ID ${id} not found`);

    return subcategory;
  }

  async getSubcategoriesByCategory(
    categoryId: string,
  ): Promise<SubcategoryDocument[]> {
    const category = await this.findByIdForSubcategoryService(categoryId);

    if (!category)
      throw new NotFoundException(`Category with ID ${categoryId} not found`);

    return this.subcategoryModel.find({ categoryId }).sort({ name: 1 }).exec();
  }
}
