import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { VideoMedia, VideoMediaDocument } from "./schemas/video-media.schema";
import { CreateTempVideoDto } from "./dto/create-temp-media.dto";
import { VIDEO_PROVIDER, VIDEO_STATUS } from "./types/types";

@Injectable()
export class InternalVideoService {
  constructor(
    @InjectModel(VideoMedia.name)
    private readonly videoMediaModel: Model<VideoMediaDocument>,
  ) {}

  async createTempVideo(dto: CreateTempVideoDto): Promise<VideoMediaDocument> {
    const media = new this.videoMediaModel({
      userId: new Types.ObjectId(dto.userId),
      provider: VIDEO_PROVIDER.CLOUDFLARE_STREAM,
      providerUid: dto.providerUid,
      purpose: dto.purpose,
      status: VIDEO_STATUS.TEMP,
      guideId: dto.guideId ? new Types.ObjectId(dto.guideId) : undefined,
      expiresAt: null,
    });

    const saved = await media.save();

    return saved;
  }

  async makeMediaOrphan(
    mediaId: { id: string; isMediaId: boolean },
    userId: string,
  ): Promise<void> {
    const { id, isMediaId } = mediaId;

    const media = await this.videoMediaModel.findOne({
      [isMediaId ? "_id" : "providerUid"]: isMediaId
        ? new Types.ObjectId(id)
        : id,
      userId: new Types.ObjectId(userId),
    });

    if (!media) throw new NotFoundException("Media record not found");

    await this.videoMediaModel.updateOne(
      { _id: media._id },
      { $set: { status: VIDEO_STATUS.ORPHANED } },
    );
  }

  async makeMediaPublished(mediaId: string, userId: string): Promise<void> {
    const media = await this.videoMediaModel.findOne({
      providerUid: mediaId,
      userId: new Types.ObjectId(userId),
    });

    if (!media) throw new NotFoundException("Media record not found");

    await this.videoMediaModel.updateOne(
      { _id: media._id },
      { $set: { status: VIDEO_STATUS.PUBLISHED } },
    );
  }
}
