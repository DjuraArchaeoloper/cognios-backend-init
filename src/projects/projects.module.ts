import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MongooseModule } from "@nestjs/mongoose";
import { Project, ProjectSchema } from "./schemas/project.schema";
import { LinkReport, LinkReportSchema } from "./schemas/link-report.schema";
import {
  ProjectReport,
  ProjectReportSchema,
} from "./schemas/project-report.schema";
import { ProjectsService } from "./projects.service";
import { ProjectsController } from "./projects.controller";
import { ProjectsAdminController } from "./projects.admin.controller";
import { UsersModule } from "src/users/users.module";
import { FileMedia, FileMediaSchema } from "src/file/schemas/file-media.schema";
import {
  ImageMedia,
  ImageMediaSchema,
} from "src/image/schemas/image-media.schema";
import {
  VideoMedia,
  VideoMediaSchema,
} from "src/video/schemas/video-media.schema";
import { CategoryModule } from "src/category/category.module";
import { PurchasesModule } from "src/purchases/purchases.module";
import { MediaModule } from "src/media/media.module";

@Module({
  imports: [
    HttpModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      {
        name: LinkReport.name,
        schema: LinkReportSchema,
        collection: "project_link_reports",
      },
      {
        name: ProjectReport.name,
        schema: ProjectReportSchema,
        collection: "project_reports",
      },
      { name: FileMedia.name, schema: FileMediaSchema, collection: "files" },
      { name: ImageMedia.name, schema: ImageMediaSchema, collection: "images" },
      { name: VideoMedia.name, schema: VideoMediaSchema, collection: "videos" },
    ]),
    CategoryModule,
    PurchasesModule,
    MediaModule,
  ],
  controllers: [ProjectsController, ProjectsAdminController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
