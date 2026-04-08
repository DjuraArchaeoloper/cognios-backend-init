import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ImageController } from "./image.controller";
import { ImageService } from "./image.service";
import { ImageMedia, ImageMediaSchema } from "./schemas/image-media.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImageMedia.name, schema: ImageMediaSchema },
    ]),
  ],
  controllers: [ImageController],
  providers: [ImageService],
  exports: [ImageService],
})
export class ImageModule {}
