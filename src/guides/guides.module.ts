import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { MongooseModule } from "@nestjs/mongoose";
import { GuidesController } from "./guides.controller";
import { GuidesService } from "./guides.service";
import { Guide, GuideSchema } from "./schemas/guide.schema";
import { LinkReport, LinkReportSchema } from "./schemas/link-report.schema";
import { GuideReport, GuideReportSchema } from "./schemas/guide-report.schema";
import { SavedGuide, SavedGuideSchema } from "./schemas/saved-guide.schema";
import { GuidesAdminController } from "./guides.admin.controller";

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      { name: Guide.name, schema: GuideSchema },
      {
        name: LinkReport.name,
        schema: LinkReportSchema,
        collection: "guide_link_reports",
      },
      {
        name: GuideReport.name,
        schema: GuideReportSchema,
        collection: "guide_reports",
      },
      {
        name: SavedGuide.name,
        schema: SavedGuideSchema,
        collection: "saved_guides",
      },
    ]),
  ],
  controllers: [GuidesController, GuidesAdminController],
  providers: [GuidesService],
  exports: [GuidesService],
})
export class GuidesModule {}
