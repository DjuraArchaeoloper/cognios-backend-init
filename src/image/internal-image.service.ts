import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ImageMedia, ImageMediaDocument } from "./schemas/image-media.schema";
import { CreateTempImageDto } from "./dto/create-temp-image.dto";
import { IMAGE_PROVIDER, IMAGE_STATUS } from "./types/types";

@Injectable()
export class InternalImageService {
  constructor(
    @InjectModel(ImageMedia.name)
    private readonly imageMediaModel: Model<ImageMediaDocument>,
  ) {}

  async createTempImage(dto: CreateTempImageDto): Promise<ImageMediaDocument> {
    const imageMedia = new this.imageMediaModel({
      userId: new Types.ObjectId(dto.userId),
      provider: IMAGE_PROVIDER.CLOUDFLARE_R2,
      providerUid: dto.providerUid,
      purpose: dto.purpose,
      status: IMAGE_STATUS.TEMP,
      guideId: dto.guideId ? new Types.ObjectId(dto.guideId) : undefined,
      expiresAt: null,
    });

    const saved = await imageMedia.save();

    return saved;
  }

  async makeMediaOrphan(
    mediaId: { id: string; isMediaId: boolean },
    userId: string,
  ): Promise<void> {
    const { id, isMediaId } = mediaId;
    const image = await this.imageMediaModel.findOne({
      [isMediaId ? "_id" : "providerUid"]: isMediaId
        ? new Types.ObjectId(id)
        : id,
      userId: new Types.ObjectId(userId),
    });

    if (!image) throw new NotFoundException("Image record not found");

    await this.imageMediaModel.updateOne(
      { _id: image._id },
      { $set: { status: IMAGE_STATUS.ORPHANED } },
    );
  }

  async makeMediaPublished(mediaId: string, userId: string): Promise<void> {
    const image = await this.imageMediaModel.findOne({
      providerUid: mediaId,
      userId: new Types.ObjectId(userId),
    });

    if (!image) throw new NotFoundException("Image record not found");

    await this.imageMediaModel.updateOne(
      { _id: image._id },
      { $set: { status: IMAGE_STATUS.PUBLISHED } },
    );
  }
}
