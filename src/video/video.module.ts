import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VideoController } from "./video.controller";
import { VideoService } from "./video.service";
import { InternalVideoService } from "./internal-video.service";
import { VideoMedia, VideoMediaSchema } from "./schemas/video-media.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoMedia.name, schema: VideoMediaSchema },
    ]),
  ],
  controllers: [VideoController],
  providers: [VideoService, InternalVideoService],
  exports: [VideoService, InternalVideoService],
})
export class VideoModule {}
