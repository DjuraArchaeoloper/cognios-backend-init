import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { FileController } from "./file.controller";
import { FileService } from "./file.service";
import { FileMedia, FileMediaSchema } from "./schemas/file-media.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FileMedia.name, schema: FileMediaSchema },
    ]),
  ],
  controllers: [FileController],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
