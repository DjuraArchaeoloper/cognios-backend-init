import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Category, CategoryDocument } from "./schemas/category.schema";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { MetadataCategoryResponse } from "./types/category";

@Injectable()
export class CategoryService {
  constructor(
    @InjectModel(Category.name)
    private categoryModel: Model<CategoryDocument>,
  ) {}

  async getCategoryMetadataBySlug(
    slug: string,
  ): Promise<MetadataCategoryResponse | null> {
    const category = await this.categoryModel
      .findOne(
        {
          slug,
          isActive: true,
        },
        {
          _id: 1,
          name: 1,
          description: 1,
          slug: 1,
          icon: 1,
          keywords: 1,
          isActive: 1,
          createdAt: 1,
        },
      )
      .lean<MetadataCategoryResponse>()
      .exec();

    if (!category)
      throw new NotFoundException(`Category with slug ${slug} not found`);

    return category;
  }

  async getAllCategories(): Promise<CategoryDocument[]> {
    return this.categoryModel.find().sort({ isActive: -1 }).exec();
  }

  ///
  /// ----------------------------- ADMIN FACING METHODS -----------------------------
  ///

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

  ///
  /// ----------------------------- INTERNAL SERVICE-TO-SERVICE ENDPOINTS -----------------------------
  ///

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
}
