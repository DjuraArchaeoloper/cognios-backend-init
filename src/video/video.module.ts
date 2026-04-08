import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { VideoController } from "./video.controller";
import { VideoService } from "./video.service";
import { VideoMedia, VideoMediaSchema } from "./schemas/video-media.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VideoMedia.name, schema: VideoMediaSchema },
    ]),
  ],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
