import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { FileMedia, FileMediaDocument } from "./schemas/file-media.schema";
import { CreateTempFileDto } from "./dto/create-temp-file.dto";
import { FILE_PROVIDER, FILE_STATUS } from "./types/types";

@Injectable()
export class InternalFileService {
  constructor(
    @InjectModel(FileMedia.name)
    private readonly fileMediaModel: Model<FileMediaDocument>,
  ) {}

  async createTempFile(dto: CreateTempFileDto): Promise<FileMediaDocument> {
    const fileMedia = new this.fileMediaModel({
      userId: new Types.ObjectId(dto.userId),
      provider: FILE_PROVIDER.CLOUDFLARE_R2,
      providerUid: dto.providerUid,
      purpose: dto.purpose,
      status: FILE_STATUS.TEMP,
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      expiresAt: null,
    });

    const saved = await fileMedia.save();

    return saved;
  }

  async makeMediaOrphan(
    mediaId: { id: string; isMediaId: boolean },
    userId: string,
  ): Promise<void> {
    const { id, isMediaId } = mediaId;

    const file = await this.fileMediaModel.findOne({
      [isMediaId ? "_id" : "providerUid"]: isMediaId
        ? new Types.ObjectId(id)
        : id,
      userId: new Types.ObjectId(userId),
    });

    if (!file) throw new NotFoundException("File record not found");

    await this.fileMediaModel.updateOne(
      { _id: file._id },
      { $set: { status: FILE_STATUS.ORPHANED } },
    );
  }

  async makeMediaPublished(mediaId: string, userId: string): Promise<void> {
    const file = await this.fileMediaModel.findOne({
      providerUid: mediaId,
      userId: new Types.ObjectId(userId),
    });

    if (!file) throw new NotFoundException("File record not found");

    await this.fileMediaModel.updateOne(
      { _id: file._id },
      { $set: { status: FILE_STATUS.PUBLISHED } },
    );
  }
}
