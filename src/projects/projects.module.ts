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

@Module({
  imports: [
    HttpModule,
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
    ]),
  ],
  controllers: [ProjectsController, ProjectsAdminController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
